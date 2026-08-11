import type { ParsedCell } from '../types';

/**
 * Detección de la columna de etiquetas.
 *
 * Regla de Stephanie: probar primero la columna C (índice 2), que es donde casi
 * siempre estan en los archivos de Nicolas; si ahi no hay contenido suficiente,
 * expandir a A-E. Nunca asumir A o B por defecto.
 */

const CANDIDATE_COLS = [0, 1, 2, 3, 4]; // A..E
const PREFERRED_COL = 2; // C
const MIN_LABELS_PREFERRED = 3;

function isLabelish(cell: ParsedCell): boolean {
  if (cell.kind !== 'label') return false;
  const txt = String(cell.value ?? '').trim();
  if (txt.length < 2) return false;
  // Un número guardado como texto no es una etiqueta.
  if (/^[\d.,%$()\-\s]+$/.test(txt)) return false;
  return true;
}

/** Puntaje de una columna como columna de etiquetas: cuantas etiquetas reales tiene. */
function scoreColumn(cells: ParsedCell[], col: number): number {
  let score = 0;
  for (const cell of cells) {
    if (cell.col !== col) continue;
    if (isLabelish(cell)) score++;
  }
  return score;
}

export function detectLabelColumn(cells: ParsedCell[]): number | null {
  if (cells.length === 0) return null;

  const preferred = scoreColumn(cells, PREFERRED_COL);
  if (preferred >= MIN_LABELS_PREFERRED) return PREFERRED_COL;

  let bestCol: number | null = null;
  let bestScore = 0;
  for (const col of CANDIDATE_COLS) {
    const score = scoreColumn(cells, col);
    // Empate a favor de la columna mas a la izquierda ya evaluada; C gana empates
    // porque se evalua primero arriba solo si supera el mínimo.
    if (score > bestScore) {
      bestScore = score;
      bestCol = col;
    }
  }
  return bestScore > 0 ? bestCol : null;
}

/**
 * Etiqueta de una fila: primero la columna de etiquetas detectada; si esa celda
 * esta vacia, se cae a la primera celda de texto de A-E en esa misma fila.
 */
export function rowLabel(
  rowCells: ParsedCell[],
  labelCol: number | null,
): { label: string | null; labelRef: string | null } {
  if (labelCol !== null) {
    const primary = rowCells.find((c) => c.col === labelCol && isLabelish(c));
    if (primary) return { label: String(primary.value).trim(), labelRef: primary.ref };
  }
  for (const col of CANDIDATE_COLS) {
    const fallback = rowCells.find((c) => c.col === col && isLabelish(c));
    if (fallback) return { label: String(fallback.value).trim(), labelRef: fallback.ref };
  }
  return { label: null, labelRef: null };
}

/** Normaliza texto para comparaciones: minusculas, sin tildes, sin puntuacion extra. */
export function normalizeLabel(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9%\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const TOTAL_RE = /^(total|totales|suma|sumatoria|subtotal|gran total|consolidado|acumulado)\b/;

/** ¿La etiqueta corresponde a una fila de total/suma? */
export function isTotalLabel(label: string | null): boolean {
  if (!label) return false;
  const n = normalizeLabel(label);
  return TOTAL_RE.test(n) || /\btotal\b/.test(n);
}

const OBSOLETE_RE =
  /\b(viejo|vieja|old|backup|bak|obsoleto|obsoleta|no usar|deprecado|deprecada|antiguo|antigua|reemplazado|version anterior)\b/;

export function isObsoleteLabel(label: string | null): boolean {
  if (!label) return false;
  return OBSOLETE_RE.test(normalizeLabel(label));
}
