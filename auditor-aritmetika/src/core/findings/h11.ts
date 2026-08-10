import type { Finding, ParsedCell } from '../types';
import { AuditContext, labelMatches, makeFinding, ref } from './context';
import { boardParagraph } from './boardLanguage';

/**
 * H11 — Inconsistencias logicas internas entre dos celdas relacionadas.
 *
 * Caso real: un flag de "modo deuda" indica apalancamiento pero el % de tramo
 * senior esta en 0% (no deberia haber deuda). La app no puede resolver estas
 * por si sola; su trabajo es poner las dos celdas juntas para que Stephanie las
 * revise de un vistazo.
 */

interface RulePair {
  name: string;
  flagRe: RegExp;
  valueRe: RegExp;
  /** Devuelve un texto de conflicto, o null si no hay conflicto */
  conflict: (flag: boolean, value: number) => string | null;
}

const RULES: RulePair[] = [
  {
    name: 'Modo deuda activo con tramo senior en cero',
    flagRe: /(modo deuda|con deuda|usa deuda|apalanc|leverage|debt mode|deuda si)/,
    valueRe: /(tramo senior|senior|% senior|senior tranche|participacion senior)/,
    conflict: (flag, value) =>
      flag && value === 0
        ? 'el modelo indica que opera con deuda, pero la participacion del tramo senior es 0%'
        : !flag && value > 0
          ? 'el modelo indica que no opera con deuda, pero hay una participacion de tramo senior mayor a 0%'
          : null,
  },
  {
    name: 'Cobertura cambiaria activa sin instrumento asignado',
    flagRe: /(cobertura|hedge|hedging|cubierto)/,
    valueRe: /(ndf|forward|opcion|opciones|collar|sblc|costo de cobertura|prima)/,
    conflict: (flag, value) =>
      flag && value === 0
        ? 'la cobertura cambiaria figura como activa, pero el costo o nocional del instrumento esta en cero'
        : null,
  },
  {
    name: 'Carry activo con tasa de carry en cero',
    flagRe: /(carry|participacion en ganancias|performance fee)/,
    valueRe: /(carry gp|% carry|tasa de carry|gp share|participacion gp)/,
    conflict: (flag, value) =>
      flag && value === 0
        ? 'el modelo contempla carry pero la participacion del GP esta en 0%; conviene confirmar si es una decision de diseno (por ejemplo, un buyout de tramo con carry 100% al LP) o una omision'
        : null,
  },
];

function truthy(cell: ParsedCell): boolean | null {
  const v = cell.value;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 1 ? true : v === 0 ? false : null;
  if (typeof v === 'string') {
    const t = v.trim().toLowerCase();
    if (['si', 'sí', 'true', 'verdadero', 'x', 'yes', '1', 'activo'].includes(t)) return true;
    if (['no', 'false', 'falso', '0', 'inactivo', 'n/a'].includes(t)) return false;
  }
  return null;
}

export function detectH11(ctx: AuditContext): Finding[] {
  const out: Finding[] = [];

  for (const rule of RULES) {
    const flags: { cell: ParsedCell; label: string; value: boolean }[] = [];
    const values: { cell: ParsedCell; label: string; value: number }[] = [];

    for (const sheet of ctx.workbook.sheets) {
      for (const row of sheet.rows) {
        const dataCells = row.cells.filter((c) => c.ref !== row.labelRef);
        if (dataCells.length === 0) continue;

        if (labelMatches(row.label, rule.flagRe)) {
          const flagValue = truthy(dataCells[0]);
          if (flagValue !== null) flags.push({ cell: dataCells[0], label: row.label!, value: flagValue });
        }
        if (labelMatches(row.label, rule.valueRe)) {
          const numeric = AuditContext.numeric(dataCells[0]);
          if (numeric !== null) values.push({ cell: dataCells[0], label: row.label!, value: numeric });
        }
      }
    }

    for (const flag of flags) {
      for (const value of values) {
        if (out.length >= ctx.config.maxPerCheck) return out;
        const conflict = rule.conflict(flag.value, value.value);
        if (!conflict) continue;

        const flagLoc = ref(flag.cell.sheet, flag.cell.ref);
        const valueLoc = ref(value.cell.sheet, value.cell.ref);

        out.push(
          makeFinding(
            {
              id: 'H11',
              sheet: flag.cell.sheet,
              cellRefs: [flag.cell.ref, value.cell.ref],
              title: `${rule.name} — revisar en conjunto`,
              description: `Dos celdas relacionadas del modelo parecen contradecirse: ${conflict}. "${flag.label}" = ${flag.cell.value} en ${flagLoc}; "${value.label}" = ${value.cell.value} en ${valueLoc}.`,
              evidence: [
                `${flagLoc} (${flag.label}) = ${flag.cell.value}`,
                `${valueLoc} (${value.label}) = ${value.cell.value}`,
              ],
              status: 'needs-review',
              severity: 'media',
              boardLanguage: boardParagraph({
                observation: `${conflict}, por lo que conviene confirmar cual de las dos celdas refleja la intencion del modelo.`,
                location: `${flagLoc} y ${valueLoc}`,
                suggestion:
                  'alinear ambas celdas (o vincular una a la otra por formula) para que la configuracion del escenario quede definida en un solo lugar.',
              }),
            },
            out.length,
          ),
        );
      }
    }
  }

  return out;
}
