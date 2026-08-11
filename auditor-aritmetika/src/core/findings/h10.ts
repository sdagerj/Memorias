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

/**
 * Palabras que existen por derecho propio y que casualmente quedan a una
 * edición de otra. Sin esta lista el modelo Marco reportaba "RATE" vs "DATE" e
 * "IRR" vs "IBR" como el mismo concepto mal escrito: son conceptos distintos.
 */
const KNOWN_WORDS = new Set([
  'RATE',
  'DATE',
  'DATA',
  'CASH',
  'CASE',
  'COST',
  'COSTS',
  'CALL',
  'BALL',
  'FALL',
  'FEE',
  'FEES',
  'IRR',
  'IBR',
  'TIR',
  'NPV',
  'VPN',
  'MOIC',
  'COP',
  'USD',
  'EUR',
  'GP',
  'LP',
  'FJ',
  'TOTAL',
  'TOTALS',
  'NOTE',
  'NOTA',
  'NETO',
  'NET',
  'MES',
  'MESES',
  'MES.',
  'ANIO',
  'PAGO',
  'PAGOS',
  'PLAZO',
  'PLAZOS',
  'TASA',
  'TASAS',
  'BASE',
  'BASES',
  'FASE',
  'FASES',
  'MAYO',
  'MAYOR',
  'MENOR',
  'VALOR',
  'VALORES',
  'SALDO',
  'SALDOS',
  'SENIOR',
  'JUNIOR',
  'CARRY',
  'CARGO',
  'CARGOS',
]);

/**
 * Con menos de esto, una sola letra de diferencia es demasiado frecuente entre
 * palabras que no tienen nada que ver (IRR/IBR, CD1/CD2).
 */
const MIN_COMPARABLE_LENGTH = 4;

const MIN_TOKEN_LENGTH = 3;
/** El término raro debe aparecer al menos esta proporcion menos que el frecuente. */
const FREQUENCY_RATIO = 3;
/**
 * Un error de digitación es raro en términos absolutos. Un término que aparece
 * muchas veces es vocabulario del modelo, no un desliz: así se distinguen
 * "SORF" (2 apariciones, typo) de "NACIONAL" vs "NATIONAL" (un modelo bilingüe).
 */
const MAX_RARE_COUNT = 3;

/** Plural del mismo término: "PAYMENT"/"PAYMENTS" no es una inconsistencia. */
function isPluralPair(a: string, b: string): boolean {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return long === `${short}S` || long === `${short}ES`;
}

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
  return (
    label
      .normalize('NFD')
      // Las tildes se ignoran al comparar: "INVÍAS" e "INVIAS" son el mismo
      // término escrito con y sin tilde, no dos conceptos distintos.
      .replace(/[\u0300-\u036f]/g, '')
      .split(/[^A-Za-z0-9Ññ]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= MIN_TOKEN_LENGTH && /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(t))
  );
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
  const pairs: { rare: TokenInfo; expected: string; expectedCount: number; canonical: boolean }[] =
    [];
  const reported = new Set<string>();

  for (const rare of list) {
    if (reported.has(rare.token)) continue;

    // Un término canonico bien escrito nunca se reporta como typo.
    if (CANONICAL_TERMS.includes(rare.token)) continue;
    // Una palabra que existe por si misma tampoco es el typo de otra.
    if (KNOWN_WORDS.has(rare.token)) continue;
    if (rare.token.length < MIN_COMPARABLE_LENGTH) continue;
    if (rare.count > MAX_RARE_COUNT) continue;

    const canonicalMatch = CANONICAL_TERMS.find(
      (term) =>
        term !== rare.token &&
        Math.abs(term.length - rare.token.length) <= 1 &&
        !isPluralPair(term, rare.token) &&
        damerauLevenshtein(term, rare.token) === 1,
    );
    const localMatch = list.find(
      (other) =>
        other.token !== rare.token &&
        other.token.length >= MIN_COMPARABLE_LENGTH &&
        Math.abs(other.token.length - rare.token.length) <= 1 &&
        other.count >= rare.count * FREQUENCY_RATIO &&
        !isPluralPair(other.token, rare.token) &&
        damerauLevenshtein(other.token, rare.token) === 1,
    );

    if (!canonicalMatch && !localMatch) continue;
    reported.add(rare.token);
    pairs.push({
      rare,
      expected: canonicalMatch ?? localMatch!.token,
      expectedCount: canonicalMatch ? 0 : (localMatch?.count ?? 0),
      canonical: Boolean(canonicalMatch),
    });
  }

  const out: Finding[] = [];

  // Un término del negocio mal escrito (SOFR -> SORF) es un hallazgo propio:
  // ensucia búsquedas sobre un concepto que sí importa.
  for (const pair of pairs.filter((p) => p.canonical)) {
    const locations = pair.rare.locations.map((l) => ref(l.sheet, l.ref)).join(', ');
    out.push(
      makeFinding(
        {
          id: 'H10',
          sheet: pair.rare.locations[0].sheet,
          cellRefs: pair.rare.locations.map((l) => l.ref),
          title: `"${pair.rare.token}" está escrito así donde el término del negocio es "${pair.expected}"`,
          description: `El término "${pair.rare.token}" aparece ${pair.rare.count} vez(ces) en el archivo donde la grafía estándar del negocio es "${pair.expected}". Se diferencian en una sola edición, y una sigla de mercado mal escrita rompe búsquedas y consolidados, además de restar credibilidad al archivo frente a quien lo lee por primera vez.`,
          evidence: pair.rare.locations.map((l) => `${ref(l.sheet, l.ref)}: "${l.label}"`),
          status: 'auto-detected',
          severity: 'media',
          ...boardFields({
            observation: `el archivo escribe "${pair.rare.token}" donde el término de mercado es "${pair.expected}".`,
            location: locations,
            suggestion: `unificar la grafía a "${pair.expected}" en todas las hojas y, si el término alimenta búsquedas o tablas dinámicas, verificar que ninguna quedó apuntando a la variante mal escrita.`,
          }),
        },
        out.length,
      ),
    );
  }

  // El resto es higiene de nomenclatura: un solo hallazgo con la lista. Antes
  // eran veintitantos hallazgos sueltos que desplazaban a los que sí mueven
  // una cifra.
  const rest = pairs.filter((p) => !p.canonical);
  if (rest.length > 0) {
    const detail = rest.map((p) => `"${p.rare.token}" / "${p.expected}"`);
    const locations = rest.flatMap((p) => p.rare.locations.slice(0, 2));
    out.push(
      makeFinding(
        {
          id: 'H10',
          sheet: locations[0]?.sheet ?? ctx.workbook.sheets[0].name,
          cellRefs: locations.map((l) => l.ref),
          title:
            rest.length === 1
              ? `Dos grafías para el mismo concepto: ${detail[0]}`
              : `${rest.length} pares de términos que parecen el mismo concepto escrito de dos formas`,
          description: `El archivo usa dos grafías para lo que parece un mismo concepto en ${rest.length} caso(s): ${detail.join(', ')}. Puede tratarse de erratas o de un modelo bilingüe; en cualquier caso conviene revisarlo de una sola pasada porque afecta búsquedas y referencias cruzadas, no cifras.`,
          evidence: rest.map(
            (p) =>
              `"${p.rare.token}" (${p.rare.count}) vs "${p.expected}"${p.expectedCount > 0 ? ` (${p.expectedCount})` : ''} — ${p.rare.locations
                .slice(0, 2)
                .map((l) => ref(l.sheet, l.ref))
                .join(', ')}`,
          ),
          status: 'needs-review',
          severity: 'informativa',
          ...boardFields({
            observation: `el archivo alterna grafías para ${rest.length} término(s), lo que dificulta búsquedas y referencias cruzadas.`,
            location: `${rest.length} pares de términos en varias hojas`,
            suggestion:
              'unificar la nomenclatura en una sola pasada y dejar la grafía elegida en la hoja de supuestos, para que las siguientes versiones del modelo la hereden.',
          }),
        },
        out.length,
      ),
    );
  }

  return out;
}
