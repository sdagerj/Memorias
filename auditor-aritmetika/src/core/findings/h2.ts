import type { Finding, ParsedSheet, SheetRow } from '../types';
import { AuditContext, makeFinding, ref } from './context';
import { boardParagraph } from './boardLanguage';
import { cellsCoveredInSheet, extractFunctions } from '../parser/refs';
import { isTotalLabel } from '../parser/labels';

/**
 * H2 — Fila de "Total" que omite una fila de datos hermana.
 *
 * Asi encontramos que "Ingresos por entidad anual" omitia C1/C2/C3 y
 * subestimaba el ingreso 2024 en 46%. Es una omision silenciosa: el modelo no
 * arroja ningun error, simplemente suma de menos.
 *
 * Algoritmo: para cada fila etiquetada Total/Suma, se toma su formula de suma en
 * una columna, se calcula el conjunto de filas que esa formula referencia en esa
 * columna, y se compara contra el bloque de filas de datos hermanas que la
 * preceden. Lo que este en el bloque y no en la formula es la omision.
 */

const SUM_FUNCS = new Set(['SUM', 'SUMA', 'SUMIF', 'SUMIFS', 'SUBTOTAL', 'SUMPRODUCT']);
/** Cuantas filas sin datos toleramos antes de dar por cerrado el bloque hacia arriba */
const MAX_GAP = 2;
/** Minimo de filas referenciadas para considerar que la formula es un total de bloque */
const MIN_REFERENCED = 2;

interface BlockRow {
  row: number;
  label: string | null;
  value: number;
  ref: string;
  isSubtotalOfBlock: boolean;
}

/**
 * Bloque de filas de datos inmediatamente encima de la fila de total, en la
 * misma columna.
 */
function collectBlock(sheet: ParsedSheet, totalRow: number, col: number): BlockRow[] {
  const rowsByIndex = new Map<number, SheetRow>(sheet.rows.map((r) => [r.row, r]));
  const block: BlockRow[] = [];
  let gap = 0;

  for (let r = totalRow - 1; r >= 0; r--) {
    // La cabecera de anios/fechas no es una fila de datos: cierra el bloque.
    if (r === sheet.timeHeaderRow) break;
    const row = rowsByIndex.get(r);
    const cell = row?.cells.find((c) => c.col === col);
    const value = AuditContext.numeric(cell);

    if (!cell || value === null) {
      gap++;
      if (gap > MAX_GAP) break;
      // Una fila con etiqueta pero sin dato numerico suele ser el titulo del
      // bloque: ahi cortamos.
      if (row?.label && block.length > 0) break;
      continue;
    }
    gap = 0;

    // Otro total dentro del bloque cierra el bloque (es un bloque distinto).
    if (isTotalLabel(row?.label ?? null)) break;

    const isSubtotalOfBlock =
      cell.kind === 'formula' &&
      cell.formula !== undefined &&
      extractFunctions(cell.formula).some((f) => SUM_FUNCS.has(f));

    block.push({
      row: r,
      label: row?.label ?? null,
      value,
      ref: cell.ref,
      isSubtotalOfBlock,
    });
  }

  return block.reverse();
}

export function detectH2(ctx: AuditContext): Finding[] {
  const out: Finding[] = [];

  for (const sheet of ctx.workbook.sheets) {
    for (const row of sheet.rows) {
      if (!isTotalLabel(row.label)) continue;

      for (const cell of row.cells) {
        if (out.length >= ctx.config.maxPerCheck) return out;
        if (cell.kind !== 'formula' || !cell.formula) continue;

        const funcs = extractFunctions(cell.formula);
        const isSumLike =
          funcs.some((f) => SUM_FUNCS.has(f)) || (funcs.length === 0 && cell.formula.includes('+'));
        if (!isSumLike) continue;

        const covered = cellsCoveredInSheet(cell.formula, sheet.name, sheet.name);
        const coveredRows = new Set<number>();
        for (const key of covered) {
          const [r, c] = key.split(':').map(Number);
          if (c === cell.col) coveredRows.add(r);
        }
        if (coveredRows.size < MIN_REFERENCED) continue;

        const block = collectBlock(sheet, row.row, cell.col);
        if (block.length === 0) continue;

        const missing = block.filter(
          (b) => !coveredRows.has(b.row) && !b.isSubtotalOfBlock && Math.abs(b.value) > 0,
        );
        if (missing.length === 0) continue;

        // Si la formula no toca NINGUNA fila del bloque, probablemente suma otra
        // cosa (otro bloque, otra hoja): no es una omision, es otro total.
        const hits = block.filter((b) => coveredRows.has(b.row));
        if (hits.length === 0) continue;

        const totalShown = AuditContext.numeric(cell) ?? hits.reduce((a, b) => a + b.value, 0);
        const missingSum = missing.reduce((a, b) => a + b.value, 0);
        const corrected = totalShown + missingSum;
        const pctUnderstated = totalShown !== 0 ? Math.abs(missingSum / corrected) : 1;

        const location = ref(sheet.name, cell.ref);
        const missingDesc = missing
          .map((m) => `${m.label ?? '(sin etiqueta)'} [${ref(sheet.name, m.ref)}]`)
          .join(', ');

        const impact = {
          metric: `${row.label ?? 'Total'} — columna ${cell.ref.replace(/\d+/g, '')}`,
          before: totalShown,
          after: corrected,
          delta: missingSum,
          unit: 'COP' as const,
          basis: `suma de ${missing.length} fila(s) no referenciada(s) por la formula del total`,
        };

        out.push(
          makeFinding(
            {
              id: 'H2',
              sheet: sheet.name,
              cellRefs: [cell.ref, ...missing.map((m) => m.ref)],
              title: `Total omite ${missing.length} fila(s) del bloque — ${row.label ?? 'Total'}`,
              description: `La formula de total en ${location} referencia ${hits.length} de las ${
                block.length
              } filas de datos del bloque. Quedan por fuera: ${missingDesc}. El total mostrado subestima el valor real en ${(
                pctUnderstated * 100
              ).toFixed(1)}%.`,
              evidence: [
                `${location} = ${cell.formula}`,
                ...missing.map(
                  (m) =>
                    `Fila omitida ${ref(sheet.name, m.ref)} (${m.label ?? 'sin etiqueta'}) = ${m.value}`,
                ),
              ],
              quantifiedImpact: impact,
              status: 'auto-detected',
              severity: 'alta',
              boardLanguage: boardParagraph({
                observation: `la fila de total no incorpora todas las lineas del bloque que agrega (quedan por fuera: ${missingDesc}), por lo que la cifra consolidada queda subestimada.`,
                location,
                suggestion:
                  'extender el rango de la formula de total para que cubra el bloque completo y, cuando sea posible, anclar el rango a filas con nombre para que agregar un fondo nuevo no vuelva a dejar la suma incompleta.',
                impact,
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
