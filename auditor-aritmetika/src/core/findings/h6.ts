import type { Finding, ParsedCell, ParsedSheet, SheetRow } from '../types';
import { AuditContext, labelMatches, makeFinding, ref, type FindingSeed } from './context';
import { boardFields } from './boardLanguage';

/**
 * H6 — Parámetros que deberían variar en el tiempo pero estan hardcodeados
 * planos (ej. SOFR fijo en todos los meses de proyección cuando debería tener
 * curva).
 *
 * Se detecta buscando el mismo valor numérico repetido a lo largo de una fila
 * que representa una serie temporal.
 */

const RATE_LIKE_RE =
  /(tasa|rate|sofr|libor|ibr|dtf|trm|ipc|inflacion|devaluacion|usura|spread|curva|yield|descuento|discount|indice)/;

/** Mínimo de periodos planos para considerar que es una serie que debería moverse */
const MIN_FLAT_WITH_HEADER = 4;
const MIN_FLAT_WITHOUT_HEADER = 8;

interface FlatRun {
  cells: ParsedCell[];
  value: number;
}

/**
 * Corrida mas larga de hardcodes con el mismo valor.
 *
 * Cuando la hoja tiene cabecera temporal, la contiguidad se evalua sobre las
 * columnas de esa cabecera (una columna intermedia sin dato no rompe la serie).
 * Sin cabecera, se exige contiguidad estricta de columnas.
 */
function longestFlatRun(cells: ParsedCell[], allowedCols: Set<number> | null): FlatRun | null {
  const candidates = cells
    .filter((c) => c.kind === 'hardcoded' && AuditContext.numeric(c) !== null)
    .filter((c) => !allowedCols || allowedCols.has(c.col))
    .sort((a, b) => a.col - b.col);

  let best: FlatRun | null = null;
  let run: ParsedCell[] = [];

  const flush = () => {
    if (run.length >= 2) {
      const value = AuditContext.numeric(run[0])!;
      if (!best || run.length > best.cells.length) best = { cells: [...run], value };
    }
    run = [];
  };

  for (const cell of candidates) {
    if (run.length === 0) {
      run = [cell];
      continue;
    }
    const prev = run[run.length - 1];
    const sameValue = AuditContext.numeric(prev) === AuditContext.numeric(cell);
    const contiguous = allowedCols !== null || cell.col === prev.col + 1;
    if (sameValue && contiguous) {
      run.push(cell);
    } else {
      flush();
      run = [cell];
    }
  }
  flush();
  return best;
}

function analyzeRow(
  sheet: ParsedSheet,
  row: SheetRow,
  timeCols: Set<number> | null,
): FindingSeed | null {
  const isRateLike = labelMatches(row.label, RATE_LIKE_RE);
  const minFlat = timeCols ? MIN_FLAT_WITH_HEADER : MIN_FLAT_WITHOUT_HEADER;

  const run = longestFlatRun(
    row.cells.filter((c) => c.ref !== row.labelRef),
    timeCols,
  );
  if (!run || run.cells.length < minFlat) return null;
  if (run.value === 0) return null; // una fila en ceros es H3/H12, no H6
  // Sin contexto de tasa y sin cabecera temporal, el ruido supera la senal.
  if (!isRateLike && !timeCols) return null;

  const first = run.cells[0];
  const last = run.cells[run.cells.length - 1];
  const location = `${ref(sheet.name, first.ref)}:${last.ref}`;
  const valueTxt =
    run.value < 1 && run.value > -1 ? `${(run.value * 100).toFixed(3)}%` : String(run.value);
  const labelTxt = row.label ?? 'sin etiqueta';

  return {
    id: 'H6',
    sheet: sheet.name,
    cellRefs: run.cells.map((c) => c.ref),
    title: `Parámetro plano en serie temporal — ${labelTxt} (${valueTxt} x ${run.cells.length} periodos)`,
    description: `La fila "${labelTxt}" repite el valor ${valueTxt} de forma idéntica y hardcodeada en ${run.cells.length} periodos consecutivos (${location}). Un parámetro de este tipo normalmente debería venir de una curva o de una celda única de supuestos, no replicado como constante en cada periodo.`,
    evidence: [
      `${location} = ${valueTxt} en los ${run.cells.length} periodos`,
      'Todas las celdas del rango son valores digitados, no fórmulas.',
    ],
    status: 'auto-detected',
    severity: isRateLike ? 'media' : 'informativa',
    ...boardFields({
      observation: `el parámetro "${labelTxt}" se mantiene constante en ${run.cells.length} periodos de proyección con valor digitado en cada celda, sin una curva o fuente única que lo alimente.`,
      location,
      suggestion:
        'parametrizar la variable en una fila de supuestos (curva por periodo) y referenciarla desde el motor de cálculo, de modo que una actualización de mercado se refleje en un solo punto del modelo.',
    }),
  };
}

export function detectH6(ctx: AuditContext): Finding[] {
  const out: Finding[] = [];

  for (const sheet of ctx.workbook.sheets) {
    const timeCols =
      sheet.timeHeaderRow !== null && sheet.timeHeaderCols.length >= 4
        ? new Set(sheet.timeHeaderCols)
        : null;

    for (const row of sheet.rows) {
      if (out.length >= ctx.config.maxPerCheck) return out;
      if (sheet.timeHeaderRow !== null && row.row === sheet.timeHeaderRow) continue;
      const seed = analyzeRow(sheet, row, timeCols);
      if (seed) out.push(makeFinding(seed, out.length));
    }
  }

  return out;
}
