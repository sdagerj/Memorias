import type { Finding } from '../types';
import { AuditContext, makeFinding, ref } from './context';
import { boardParagraph } from './boardLanguage';
import { normalizeLabel } from '../parser/labels';

/**
 * H7 — Inconsistencia entre el valor mostrado en dashboard/resumen y el valor
 * que realmente corre en el motor/cascada.
 *
 * Caso real: SOFR en 3.82% en el dashboard mientras el waterfall usaba 3.62% —
 * 20 bp de diferencia silenciosa.
 *
 * Estrategia: agrupar por etiqueta normalizada las filas que se comportan como
 * parametro (pocas celdas numericas) y comparar el valor entre hojas distintas.
 */

/** Filas con mas celdas numericas que esto son series, no parametros. */
const MAX_NUMERIC_CELLS = 3;
const MIN_LABEL_LENGTH = 3;
const REL_TOLERANCE = 1e-9;

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
      const occurrence: ParamOccurrence = { sheet: sheet.name, ref: cell.ref, label: row.label, value };
      if (list) list.push(occurrence);
      else byLabel.set(key, [occurrence]);
    }
  }

  const out: Finding[] = [];

  for (const [, occurrences] of byLabel) {
    if (out.length >= ctx.config.maxPerCheck) return out;
    const sheets = new Set(occurrences.map((o) => o.sheet));
    if (sheets.size < 2) continue;

    const values = occurrences.map((o) => o.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const scale = Math.max(Math.abs(min), Math.abs(max), 1e-12);
    if ((max - min) / scale < REL_TOLERANCE) continue;

    const label = occurrences[0].label;
    const isRateLike = Math.abs(max) < 1 && Math.abs(min) < 1;
    const delta = max - min;
    const impact = {
      metric: `Valor de "${label}" entre hojas`,
      before: isRateLike ? min * 10_000 : min,
      after: isRateLike ? max * 10_000 : max,
      delta: isRateLike ? delta * 10_000 : delta,
      unit: (isRateLike ? 'bp' : 'COP') as 'bp' | 'COP',
      basis: 'diferencia entre el valor maximo y minimo del mismo parametro en hojas distintas',
    };

    const locations = occurrences
      .map((o) => `${ref(o.sheet, o.ref)} = ${isRateLike ? `${(o.value * 100).toFixed(3)}%` : o.value}`)
      .join('; ');

    out.push(
      makeFinding(
        {
          id: 'H7',
          sheet: occurrences[0].sheet,
          cellRefs: occurrences.map((o) => o.ref),
          title: `Mismo parametro con valores distintos entre hojas — ${label}`,
          description: `El parametro "${label}" aparece con valores diferentes en ${sheets.size} hojas: ${locations}. Cuando el resumen y el motor de calculo leen numeros distintos para la misma variable, la cifra presentada deja de ser la que efectivamente corre en la cascada.`,
          evidence: occurrences.map((o) => `${ref(o.sheet, o.ref)} (${o.label}) = ${o.value}`),
          quantifiedImpact: impact,
          status: 'needs-review',
          severity: 'alta',
          boardLanguage: boardParagraph({
            observation: `el parametro "${label}" toma valores distintos segun la hoja donde se consulte, de modo que la cifra del resumen no necesariamente es la que alimenta el motor de calculo.`,
            location: locations,
            suggestion:
              'consolidar el parametro en una unica celda de supuestos y hacer que tanto el resumen como el motor de cascada la referencien, eliminando la copia manual.',
            impact,
          }),
        },
        out.length,
      ),
    );
  }

  return out;
}
