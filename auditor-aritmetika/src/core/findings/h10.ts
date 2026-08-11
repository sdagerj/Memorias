import type { Finding } from '../types';
import { AuditContext, makeFinding, ref } from './context';
import { boardFields } from './boardLanguage';

/**
 * H10 — Terminología o siglas inconsistentes dentro del mismo archivo.
 *
 * Casos reales: "SOFR" en una hoja y "SORF" en otra; "CPACA" (el regimen
 * correcto) escrito como "CPCA". Se usa distancia de Damerau-Levenshtein para
 * que una transposición cuente como una sola edición.
 */

/** Términos de negocio cuya grafia correcta ya conocemos. */
const CANONICAL_TERMS = ['CPACA', 'CCA', 'SOFR', 'DTF', 'TRM', 'NDF', 'SBLC', 'IBR', 'APD'];

const MIN_TOKEN_LENGTH = 3;
/** El término raro debe aparecer al menos esta proporcion menos que el frecuente. */
const FREQUENCY_RATIO = 3;

interface TokenInfo {
  token: string;
  count: number;
  locations: { sheet: string; ref: string; label: string }[];
}

/** Distancia de edición con transposiciones (Damerau-Levenshtein). */
export function damerauLevenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const d: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + cost);
      }
    }
  }
  return d[m][n];
}

function tokenize(label: string): string[] {
  return label
    .split(/[^A-Za-z0-9ÁÉÍÓÚÑáéíóúñ]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= MIN_TOKEN_LENGTH && /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(t));
}

export function detectH10(ctx: AuditContext): Finding[] {
  const tokens = new Map<string, TokenInfo>();

  for (const sheet of ctx.workbook.sheets) {
    for (const row of sheet.rows) {
      const sources = row.cells.filter((c) => c.kind === 'label');
      for (const cell of sources) {
        const text = String(cell.value ?? '');
        for (const token of tokenize(text)) {
          const key = token.toUpperCase();
          const info = tokens.get(key);
          const location = { sheet: sheet.name, ref: cell.ref, label: text };
          if (info) {
            info.count++;
            if (info.locations.length < 10) info.locations.push(location);
          } else {
            tokens.set(key, { token: key, count: 1, locations: [location] });
          }
        }
      }
    }
  }

  const list = [...tokens.values()];
  const out: Finding[] = [];
  const reported = new Set<string>();

  for (const rare of list) {
    if (out.length >= ctx.config.maxPerCheck) return out;
    if (reported.has(rare.token)) continue;

    // Un término canonico bien escrito nunca se reporta como typo.
    if (CANONICAL_TERMS.includes(rare.token)) continue;

    const candidates = [
      ...list.filter(
        (other) =>
          other.token !== rare.token &&
          Math.abs(other.token.length - rare.token.length) <= 1 &&
          other.count >= rare.count * FREQUENCY_RATIO &&
          damerauLevenshtein(other.token, rare.token) === 1,
      ),
      ...CANONICAL_TERMS.filter(
        (term) =>
          term !== rare.token &&
          Math.abs(term.length - rare.token.length) <= 1 &&
          damerauLevenshtein(term, rare.token) === 1,
      ).map((term) => ({ token: term, count: 0, locations: [] as TokenInfo['locations'] })),
    ];

    if (candidates.length === 0) continue;
    const expected = candidates[0];

    const locations = rare.locations.map((l) => ref(l.sheet, l.ref)).join(', ');
    reported.add(rare.token);

    out.push(
      makeFinding(
        {
          id: 'H10',
          sheet: rare.locations[0].sheet,
          cellRefs: rare.locations.map((l) => l.ref),
          title: `"${rare.token}" y "${expected.token}" parecen el mismo concepto escrito de dos formas`,
          description: `El término "${rare.token}" aparece ${rare.count} vez(ces) en el archivo, mientras que "${
            expected.token
          }"${
            expected.count > 0
              ? ` aparece ${expected.count} vez(ces)`
              : ' es la grafia estandar del negocio'
          }. Se diferencian en una sola edición, lo que sugiere una variante tipográfica del mismo concepto.`,
          evidence: rare.locations.map((l) => `${ref(l.sheet, l.ref)}: "${l.label}"`),
          status: 'auto-detected',
          severity: 'informativa',
          ...boardFields({
            observation: `el archivo usa dos grafias para lo que parece el mismo concepto ("${rare.token}" y "${expected.token}"), lo que dificulta las busquedas y las referencias cruzadas.`,
            location: locations,
            suggestion:
              'unificar la nomenclatura en una sola grafia a lo largo del archivo y, cuando aplique, dejar la definicion de la sigla en la hoja de supuestos.',
          }),
        },
        out.length,
      ),
    );
  }

  return out;
}
