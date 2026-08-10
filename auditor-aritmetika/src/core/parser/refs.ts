/**
 * Utilidades de referencias A1 y de disección de formulas.
 *
 * Todo el motor de hallazgos se apoya aqui: no re-ejecutamos formulas (SheetJS
 * no lo hace), pero si necesitamos entender a QUE apunta cada formula para
 * poder decir "este total omite la fila de C1/C2/C3".
 */

export interface CellAddr {
  row: number; // 0-based
  col: number; // 0-based
}

export interface RangeRef {
  sheet: string | null;
  start: CellAddr;
  end: CellAddr;
  raw: string;
}

/** "B12" -> { row: 11, col: 1 }. Ignora los "$" de referencias absolutas. */
export function decodeAddr(a1: string): CellAddr | null {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})$/.exec(a1.trim());
  if (!m) return null;
  const letters = m[1].toUpperCase();
  let col = 0;
  for (let i = 0; i < letters.length; i++) col = col * 26 + (letters.charCodeAt(i) - 64);
  return { row: parseInt(m[2], 10) - 1, col: col - 1 };
}

/** { row: 11, col: 1 } -> "B12" */
export function encodeAddr(addr: CellAddr): string {
  let col = addr.col + 1;
  let letters = '';
  while (col > 0) {
    const rem = (col - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    col = Math.floor((col - 1) / 26);
  }
  return `${letters}${addr.row + 1}`;
}

/** Convierte "Hoja 1!B12" o "B12" en { sheet, ref }. */
export function splitSheetRef(full: string): { sheet: string | null; ref: string } {
  const idx = full.lastIndexOf('!');
  if (idx === -1) return { sheet: null, ref: full.trim() };
  let sheet = full.slice(0, idx).trim();
  if (sheet.startsWith("'") && sheet.endsWith("'")) sheet = sheet.slice(1, -1).replace(/''/g, "'");
  return { sheet, ref: full.slice(idx + 1).trim() };
}

const REF_TOKEN = String.raw`(?:'(?:[^']|'')+'|[A-Za-z0-9_À-ɏ.\-]+)!`;
const A1 = String.raw`\$?[A-Za-z]{1,3}\$?\d{1,7}`;

/** Todas las referencias de rango (A1:B9), con o sin hoja. */
const RANGE_RE = new RegExp(String.raw`(${REF_TOKEN})?(${A1}):(${A1})`, 'g');
/** Todas las referencias a celda individual, con o sin hoja. */
const SINGLE_RE = new RegExp(String.raw`(${REF_TOKEN})?(${A1})(?![:\d(])`, 'g');
/** Nombres de hoja mencionados en la formula. */
const SHEET_RE = new RegExp(REF_TOKEN, 'g');

function cleanSheetToken(token: string | undefined): string | null {
  if (!token) return null;
  let s = token.slice(0, -1); // quita el "!"
  if (s.startsWith("'") && s.endsWith("'")) s = s.slice(1, -1).replace(/''/g, "'");
  return s;
}

/**
 * Quita literales de texto de una formula para no confundir "A1" dentro de un
 * string con una referencia real.
 */
export function stripStringLiterals(formula: string): string {
  return formula.replace(/"(?:[^"]|"")*"/g, '""');
}

/** Rangos referenciados por la formula. */
export function extractRanges(formula: string): RangeRef[] {
  const f = stripStringLiterals(formula);
  const out: RangeRef[] = [];
  for (const m of f.matchAll(RANGE_RE)) {
    const start = decodeAddr(m[2]);
    const end = decodeAddr(m[3]);
    if (!start || !end) continue;
    out.push({
      sheet: cleanSheetToken(m[1]),
      start: { row: Math.min(start.row, end.row), col: Math.min(start.col, end.col) },
      end: { row: Math.max(start.row, end.row), col: Math.max(start.col, end.col) },
      raw: m[0],
    });
  }
  return out;
}

/** Referencias a celda individual (excluye las que forman parte de un rango). */
export function extractSingleRefs(formula: string): { sheet: string | null; addr: CellAddr; raw: string }[] {
  let f = stripStringLiterals(formula);
  // Neutraliza los rangos para que sus extremos no cuenten como celdas sueltas.
  f = f.replace(RANGE_RE, (match) => '#'.repeat(match.length));
  const out: { sheet: string | null; addr: CellAddr; raw: string }[] = [];
  for (const m of f.matchAll(SINGLE_RE)) {
    const addr = decodeAddr(m[2]);
    if (!addr) continue;
    out.push({ sheet: cleanSheetToken(m[1]), addr, raw: m[0] });
  }
  return out;
}

/** Nombres de hoja que la formula menciona. */
export function extractSheetNames(formula: string): string[] {
  const f = stripStringLiterals(formula);
  const names = new Set<string>();
  for (const m of f.matchAll(SHEET_RE)) {
    const name = cleanSheetToken(m[0]);
    if (name) names.add(name);
  }
  return [...names];
}

/** Todas las celdas (row,col) que un conjunto de rangos + refs sueltas cubre en una hoja dada. */
export function cellsCoveredInSheet(
  formula: string,
  ownSheet: string,
  targetSheet: string,
  opts: { maxCells?: number } = {},
): Set<string> {
  const maxCells = opts.maxCells ?? 20000;
  const covered = new Set<string>();
  const sameSheet = (s: string | null) => (s === null ? ownSheet === targetSheet : s === targetSheet);

  for (const r of extractRanges(formula)) {
    if (!sameSheet(r.sheet)) continue;
    const size = (r.end.row - r.start.row + 1) * (r.end.col - r.start.col + 1);
    if (size > maxCells) continue;
    for (let row = r.start.row; row <= r.end.row; row++)
      for (let col = r.start.col; col <= r.end.col; col++) covered.add(`${row}:${col}`);
  }
  for (const s of extractSingleRefs(formula)) {
    if (!sameSheet(s.sheet)) continue;
    covered.add(`${s.addr.row}:${s.addr.col}`);
  }
  return covered;
}

/** Nombres de funcion usados en la formula, en mayusculas. */
export function extractFunctions(formula: string): string[] {
  const f = stripStringLiterals(formula);
  const out = new Set<string>();
  for (const m of f.matchAll(/([A-Za-z][A-Za-z0-9_.]*)\s*\(/g)) out.add(m[1].toUpperCase());
  return [...out];
}

/** Numeros literales escritos directamente en la formula. */
export function extractLiteralNumbers(formula: string): number[] {
  const f = stripStringLiterals(formula)
    // no confundir la parte numerica de una referencia (B12) con un literal
    .replace(new RegExp(A1, 'g'), '#');
  const out: number[] = [];
  for (const m of f.matchAll(/(?<![\w.#])(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)%?/g)) {
    const isPct = m[0].endsWith('%');
    const n = parseFloat(m[1]);
    if (Number.isFinite(n)) out.push(isPct ? n / 100 : n);
  }
  return out;
}
