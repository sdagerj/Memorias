import type { Finding } from '../types';
import { AuditContext, makeFinding, ref } from './context';
import { boardFields } from './boardLanguage';
import { normalizeLabel } from '../parser/labels';

/**
 * H7 — Inconsistencia entre el valor mostrado en dashboard/resumen y el valor
 * que realmente corre en el motor/cascada.
 *
 * Caso real: SOFR en 3.82% en el dashboard mientras el waterfall usaba 3.62% —
 * 20 bp de diferencia silenciosa.
 *
 * Estrategia: agrupar por etiqueta normalizada las filas que se comportan como
 * parámetro (pocas celdas numéricas) y comparar el valor entre hojas distintas.
 */

/** Filas con mas celdas numéricas que esto son series, no parámetros. */
const MAX_NUMERIC_CELLS = 3;
const MIN_LABEL_LENGTH = 3;
const REL_TOLERANCE = 1e-9;
/** Holgura para dar dos cifras por iguales en magnitud aunque difieran en signo. */
const SIGN_TOLERANCE = 1e-6;

interface ParamOccurrence {
  sheet: string;
  ref: string;
  label: string;
  value: number;
}

export function detectH7(ctx: AuditContext): Finding[] {
  const byLabel = new Map<string, ParamOccurrence[]>();

  for (const sheet of ctx.workbook.sheets) {
    for (const row of sheet.rows) {
      if (!row.label || normalizeLabel(row.label).length < MIN_LABEL_LENGTH) continue;
      const numericCells = row.cells.filter(
        (c) => c.ref !== row.labelRef && AuditContext.numeric(c) !== null,
      );
      if (numericCells.length === 0 || numericCells.length > MAX_NUMERIC_CELLS) continue;

      const cell = numericCells[0];
      const value = AuditContext.numeric(cell)!;
      const key = normalizeLabel(row.label);
      const list = byLabel.get(key);
      const occurrence: ParamOccurrence = {
        sheet: sheet.name,
        ref: cell.ref,
        label: row.label,
        value,
      };
      if (list) list.push(occurrence);
      else byLabel.set(key, [occurrence]);
    }
  }

  interface Divergence {
    label: string;
    occurrences: ParamOccurrence[];
    min: number;
    max: number;
    delta: number;
    isRateLike: boolean;
  }

  const divergences: Divergence[] = [];

  for (const [, occurrences] of byLabel) {
    const sheets = new Set(occurrences.map((o) => o.sheet));
    if (sheets.size < 2) continue;

    const values = occurrences.map((o) => o.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const scale = Math.max(Math.abs(min), Math.abs(max), 1e-12);
    if ((max - min) / scale < REL_TOLERANCE) continue;

    // Misma magnitud con signo opuesto: es convención de signo (salida vs
    // entrada), no dos supuestos distintos. El modelo Marco trae
    // `FJ Purchased` como -300.000MM en una hoja y +300.000MM en otra.
    if (Math.abs(Math.abs(max) - Math.abs(min)) / scale < SIGN_TOLERANCE && min < 0 && max > 0) {
      continue;
    }

    divergences.push({
      label: occurrences[0].label,
      occurrences,
      min,
      max,
      delta: max - min,
      isRateLike: Math.abs(max) < 1 && Math.abs(min) < 1,
    });
  }

  const fmt = (d: Divergence, value: number) =>
    d.isRateLike ? `${(value * 100).toFixed(3)}%` : Math.round(value).toLocaleString('es-CO');

  /**
   * Cuando muchas divergencias enfrentan al mismo par de hojas, no son N
   * problemas: es una hoja desactualizada frente a la otra. El modelo Marco
   * traia 16 parámetros distintos entre "Summary Scenarios" (69 valores
   * digitados, cero fórmulas) y "Nota Marco" (el motor vivo). Esa es UNA
   * historia y hay que contarla como tal.
   */
  const MIN_FOR_SHEET_STORY = 3;
  const bySheetPair = new Map<string, Divergence[]>();
  for (const d of divergences) {
    const pair = [...new Set(d.occurrences.map((o) => o.sheet))].sort().join(' ↔ ');
    const list = bySheetPair.get(pair);
    if (list) list.push(d);
    else bySheetPair.set(pair, [d]);
  }

  const out: Finding[] = [];
  const consumed = new Set<Divergence>();

  for (const [pair, group] of bySheetPair) {
    if (group.length < MIN_FOR_SHEET_STORY) continue;
    for (const d of group) consumed.add(d);

    const sheets = pair.split(' ↔ ');
    const money = group.filter((d) => !d.isRateLike);
    const worst = [...group].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
    // La cifra que se cita es la mayor divergencia individual, no la suma: los
    // parámetros miden cosas distintas y sumarlos da un número sin sentido.
    const worstMoney = [...money].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];

    const impact = worstMoney
      ? {
          metric: `Mayor divergencia: ${worstMoney.label}`,
          before: worstMoney.min,
          after: worstMoney.max,
          delta: worstMoney.delta,
          unit: 'COP' as const,
          basis: `diferencia de "${worstMoney.label}" entre las dos hojas; hay ${money.length} parámetro(s) en dinero que no coinciden`,
        }
      : undefined;

    const rows = group.map((d) => `${d.label}: ${fmt(d, d.min)} vs ${fmt(d, d.max)}`).slice(0, 20);

    out.push(
      makeFinding(
        {
          id: 'H7',
          sheet: sheets[0],
          cellRefs: group.flatMap((d) => d.occurrences.map((o) => o.ref)).slice(0, 40),
          title: `${group.length} cifras no coinciden entre "${sheets[0]}" y "${sheets[1]}"`,
          description: `${group.length} parámetros con la misma etiqueta toman valores distintos en "${sheets[0]}" y en "${sheets[1]}". La mayor diferencia es "${worst.label}" (${fmt(
            worst,
            worst.min,
          )} vs ${fmt(worst, worst.max)}). Cuando dos hojas del mismo archivo reportan cifras distintas para el mismo concepto, la que se lleve a una presentación puede no ser la que el modelo está calculando.`,
          evidence: rows.map(
            (r, i) =>
              `${r}  [${group[i].occurrences.map((o) => ref(o.sheet, o.ref)).join(' vs ')}]`,
          ),
          quantifiedImpact: impact,
          status: 'needs-review',
          severity: 'alta',
          ...boardFields({
            observation: `${group.length} cifras con la misma etiqueta difieren entre las hojas "${sheets[0]}" y "${sheets[1]}", de modo que el resumen y el motor de cálculo no están reportando lo mismo.`,
            location: `${sheets[0]} ↔ ${sheets[1]}`,
            suggestion:
              'determinar cuál de las dos hojas es la fuente de verdad y hacer que la otra la referencie por fórmula en vez de guardar los valores a mano, para que no puedan volver a separarse.',
            impact,
          }),
        },
        out.length,
      ),
    );
  }

  for (const d of divergences) {
    if (consumed.has(d)) continue;
    if (out.length >= ctx.config.maxRawPerCheck) return out;
    const { occurrences, label, min, max, delta, isRateLike } = d;
    const sheets = new Set(occurrences.map((o) => o.sheet));
    const impact = {
      metric: `Valor de "${label}" entre hojas`,
      before: isRateLike ? min * 10_000 : min,
      after: isRateLike ? max * 10_000 : max,
      delta: isRateLike ? delta * 10_000 : delta,
      unit: (isRateLike ? 'bp' : 'COP') as 'bp' | 'COP',
      basis: 'diferencia entre el valor máximo y mínimo del mismo parámetro en hojas distintas',
    };

    const locations = occurrences
      .map(
        (o) =>
          `${ref(o.sheet, o.ref)} = ${isRateLike ? `${(o.value * 100).toFixed(3)}%` : o.value}`,
      )
      .join('; ');

    out.push(
      makeFinding(
        {
          id: 'H7',
          sheet: occurrences[0].sheet,
          cellRefs: occurrences.map((o) => o.ref),
          title: `Mismo parámetro con valores distintos entre hojas — ${label}`,
          description: `El parámetro "${label}" aparece con valores diferentes en ${sheets.size} hojas: ${locations}. Cuando el resumen y el motor de cálculo leen números distintos para la misma variable, la cifra presentada deja de ser la que efectivamente corre en la cascada.`,
          evidence: occurrences.map((o) => `${ref(o.sheet, o.ref)} (${o.label}) = ${o.value}`),
          quantifiedImpact: impact,
          status: 'needs-review',
          severity: 'alta',
          ...boardFields({
            observation: `el parámetro "${label}" toma valores distintos según la hoja donde se consulte, de modo que la cifra del resumen no necesariamente es la que alimenta el motor de cálculo.`,
            location: locations,
            suggestion:
              'consolidar el parámetro en una única celda de supuestos y hacer que tanto el resumen como el motor de cascada la referencien, eliminando la copia manual.',
            impact,
          }),
        },
        out.length,
      ),
    );
  }

  return out;
}
