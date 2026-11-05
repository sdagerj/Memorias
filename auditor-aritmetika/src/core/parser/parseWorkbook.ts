import * as XLSX from 'xlsx';
import type { ParsedCell, ParsedSheet, ParsedWorkbook, SheetRow } from '../types';
import { encodeAddr, extractSheetNames } from './refs';
import { detectLabelColumn, rowLabel } from './labels';

/** Codigos de error de Excel tal como SheetJS los entrega en cell.v cuando t === 'e'. */
const EXCEL_ERRORS: Record<number, string> = {
  0x00: '#NULL!',
  0x07: '#DIV/0!',
  0x0f: '#VALUE!',
  0x17: '#REF!',
  0x1d: '#NAME?',
  0x24: '#NUM!',
  0x2a: '#N/A',
  0x2b: '#GETTING_DATA',
};

const ORPHAN_NAME_RE =
  /(^|[\s_\-([])(v\d+|vieja?s?|viejo|old|bak|backup|copia|copy|test|prueba|borrador|draft|temp|tmp|antigu[oa]|no\s*usar|deprecad[oa]|análisis|analisis|scratch)(\b|[\s_\-)\]])/i;

export interface ParseOptions {
  /** Limite defensivo de celdas por hoja; evita colgar el navegador con archivos enormes. */
  maxCellsPerSheet?: number;
}

function errorText(v: unknown, w?: string): string {
  if (typeof v === 'number' && EXCEL_ERRORS[v]) return EXCEL_ERRORS[v];
  if (typeof v === 'string' && v.startsWith('#')) return v;
  if (w && w.startsWith('#')) return w;
  return '#ERROR';
}

/** Convierte una hoja de SheetJS a nuestro modelo plano de celdas. */
function parseSheet(
  name: string,
  ws: XLSX.WorkSheet,
  opts: Required<ParseOptions>,
): Omit<ParsedSheet, 'referencedBy' | 'isOrphan'> {
  const cells: ParsedCell[] = [];
  const refStr = ws['!ref'];
  const range = refStr ? XLSX.utils.decode_range(refStr) : null;
  const references = new Set<string>();

  let formulas = 0;
  let hardcoded = 0;
  let labels = 0;
  let errors = 0;

  if (range) {
    const rowCount = range.e.r - range.s.r + 1;
    const colCount = range.e.c - range.s.c + 1;
    const budget = Math.min(rowCount * colCount, opts.maxCellsPerSheet);
    let seen = 0;

    for (let r = range.s.r; r <= range.e.r && seen < budget; r++) {
      for (let c = range.s.c; c <= range.e.c && seen < budget; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr] as XLSX.CellObject | undefined;
        if (!cell) continue;
        seen++;

        const hasFormula = typeof cell.f === 'string' && cell.f.length > 0;
        const isError = cell.t === 'e';
        let kind: ParsedCell['kind'];
        let value: ParsedCell['value'];

        if (isError) {
          kind = 'error';
          value = errorText(cell.v, cell.w);
          errors++;
        } else if (hasFormula) {
          kind = 'formula';
          value = normalizeValue(cell.v);
          formulas++;
        } else if (cell.t === 's') {
          const txt = String(cell.v ?? '').trim();
          if (txt === '') continue;
          kind = 'label';
          value = txt;
          labels++;
        } else if (cell.v === undefined || cell.v === null) {
          continue;
        } else {
          kind = 'hardcoded';
          value = normalizeValue(cell.v);
          hardcoded++;
        }

        const parsed: ParsedCell = {
          ref: encodeAddr({ row: r, col: c }),
          sheet: name,
          row: r,
          col: c,
          kind,
          value,
          formatted: cell.w,
          numFmt: typeof cell.z === 'string' ? cell.z : undefined,
        };
        if (hasFormula) {
          parsed.formula = cell.f as string;
          for (const s of extractSheetNames(cell.f as string)) references.add(s);
          // Un #REF! puede vivir dentro del string de la fórmula aunque el
          // valor cacheado siga siendo numérico.
          if (!isError && /#REF!/.test(cell.f as string)) errors++;
        }
        cells.push(parsed);
      }
    }
  }

  const labelCol = detectLabelColumn(cells);
  const rows = buildRows(cells, labelCol);
  const { timeHeaderRow, timeHeaderCols } = detectTimeHeader(rows);

  return {
    name,
    cells,
    rows,
    labelCol,
    references: [...references],
    counts: { formulas, hardcoded, labels, errors, nonEmpty: cells.length },
    timeHeaderRow,
    timeHeaderCols,
  };
}

function normalizeValue(v: unknown): ParsedCell['value'] {
  if (v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
  return null;
}

function buildRows(cells: ParsedCell[], labelCol: number | null): SheetRow[] {
  const byRow = new Map<number, ParsedCell[]>();
  for (const cell of cells) {
    const list = byRow.get(cell.row);
    if (list) list.push(cell);
    else byRow.set(cell.row, [cell]);
  }
  const rows: SheetRow[] = [];
  for (const [row, rowCells] of [...byRow.entries()].sort((a, b) => a[0] - b[0])) {
    rowCells.sort((a, b) => a.col - b.col);
    const { label, labelRef } = rowLabel(rowCells, labelCol);
    rows.push({ row, label, labelRef, cells: rowCells });
  }
  return rows;
}

/**
 * Busca la fila de cabecera temporal (años o fechas en columnas contiguas).
 * Sirve para H6: un parámetro que debería tener curva pero esta plano.
 */
function detectTimeHeader(rows: SheetRow[]): {
  timeHeaderRow: number | null;
  timeHeaderCols: number[];
} {
  let best: { row: number; cols: number[] } | null = null;
  for (const row of rows) {
    const cols: number[] = [];
    for (const cell of row.cells) {
      if (isYearLike(cell.value) || isDateLike(cell)) cols.push(cell.col);
    }
    if (cols.length >= 4 && (!best || cols.length > best.cols.length)) {
      best = { row: row.row, cols };
    }
  }
  return best
    ? { timeHeaderRow: best.row, timeHeaderCols: best.cols }
    : { timeHeaderRow: null, timeHeaderCols: [] };
}

function isYearLike(v: ParsedCell['value']): boolean {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.trim()) : NaN;
  return Number.isInteger(n) && n >= 1990 && n <= 2100;
}

function isDateLike(cell: ParsedCell): boolean {
  if (typeof cell.value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(cell.value)) return true;
  return Boolean(cell.numFmt && /[ymd]/i.test(cell.numFmt) && typeof cell.value === 'number');
}

/**
 * Parsea un workbook completo. Corre en el navegador — sin backend, los datos
 * del family office no salen del cliente.
 */
export function parseWorkbook(
  data: ArrayBuffer | Uint8Array,
  fileName: string,
  options: ParseOptions = {},
): ParsedWorkbook {
  const opts: Required<ParseOptions> = { maxCellsPerSheet: options.maxCellsPerSheet ?? 400_000 };
  const t0 = Date.now();

  const wb = XLSX.read(data, {
    type: 'array',
    cellFormula: true,
    cellNF: true,
    cellDates: true,
    dense: false,
  });

  const partial = wb.SheetNames.map((name) => parseSheet(name, wb.Sheets[name], opts));

  // referencedBy: quien menciona a quien. La comparacion es case-insensitive
  // porque Excel no distingue mayusculas en nombres de hoja.
  const byLower = new Map(partial.map((s) => [s.name.toLowerCase(), s.name]));
  const referencedBy = new Map<string, Set<string>>(
    partial.map((s) => [s.name, new Set<string>()]),
  );
  for (const sheet of partial) {
    for (const target of sheet.references) {
      const real = byLower.get(target.toLowerCase());
      if (real && real !== sheet.name) referencedBy.get(real)!.add(sheet.name);
    }
  }

  const sheets: ParsedSheet[] = partial.map((s) => {
    const refs = [...(referencedBy.get(s.name) ?? [])];
    return {
      ...s,
      referencedBy: refs,
      isOrphan: refs.length === 0 && ORPHAN_NAME_RE.test(s.name),
    };
  });

  return {
    fileName,
    sheets,
    parsedAt: new Date().toISOString(),
    parseMs: Date.now() - t0,
    totals: {
      sheets: sheets.length,
      formulas: sheets.reduce((a, s) => a + s.counts.formulas, 0),
      hardcoded: sheets.reduce((a, s) => a + s.counts.hardcoded, 0),
      errors: sheets.reduce((a, s) => a + s.counts.errors, 0),
      orphanSheets: sheets.filter((s) => s.isOrphan).length,
    },
  };
}

/** Nombre de hoja "sospechoso de versión abandonada", independiente de si es huérfana. */
export function looksLikeVersionSheet(name: string): boolean {
  return ORPHAN_NAME_RE.test(name);
}

/** Busca una celda por "Hoja!Ref" en un workbook ya parseado. */
export function findCell(
  wb: ParsedWorkbook,
  sheetName: string,
  ref: string,
): ParsedCell | undefined {
  const sheet = wb.sheets.find((s) => s.name.toLowerCase() === sheetName.toLowerCase());
  if (!sheet) return undefined;
  const upper = ref.replace(/\$/g, '').toUpperCase();
  return sheet.cells.find((c) => c.ref === upper);
}
