import type { Finding } from '../types';
import { AuditContext, makeFinding, ref } from './context';
import { boardFields } from './boardLanguage';
import { extractFunctions, extractRanges } from '../parser/refs';
import { normalizeLabel } from '../parser/labels';

/**
 * H5 — IRR para split de carry calculada sobre la base equivocada.
 *
 * Debe ser TIR de sentencias PAGADAS, nunca TIR del portafolio total. En C4:
 * TIR pagadas 34.06% activa "Higher Catch-Up" (72/28); usar la TIR del
 * portafolio completo (22.63%) llevaria al split "Discounted" (75/25).
 *
 * Queda como candidato de revisión: la app senala la fórmula y las etiquetas de
 * las filas que alimenta el rango, pero la confirmación de cual base usa es
 * juicio de negocio.
 */

const IRR_FUNCS = new Set(['IRR', 'XIRR', 'TIR', 'TIR.NO.PER', 'MIRR', 'TIRX', 'RATE']);

const PAID_RE = /(pagad|paid|cobrad|recaudad|liquidad)/;
const PORTFOLIO_RE = /(portafolio|portfolio|vigente|total|todas|completo|global)/;

/**
 * Solo interesan las TIR que pueden decidir el escalon de carry. Un modelo real
 * calcula decenas de TIR de activo por entidad (Fiscalía, Policía, Armada) que
 * no alimentan ninguna cascada: reportarlas todas ahogaba el hallazgo que si
 * importa. El modelo Marco traia 64 TIR y solo un punado eran relevantes.
 */
const CARRY_RE =
  /(carry|split|catch|cascada|waterfall|tier|escalon|participacion|hurdle|preferred|pref)/;
const DISTRIBUTION_RE =
  /(net irr|irr net|investor|inversionista|\blp\b|\bgp\b|junior|senior|fondo|fund)/;

export function detectH5(ctx: AuditContext): Finding[] {
  const out: Finding[] = [];

  for (const sheet of ctx.workbook.sheets) {
    for (const cell of sheet.cells) {
      if (out.length >= ctx.config.maxRawPerCheck) return out;
      if (cell.kind !== 'formula' || !cell.formula) continue;

      const funcs = extractFunctions(cell.formula);
      if (!funcs.some((f) => IRR_FUNCS.has(f))) continue;

      const rowLabel = ctx.labelForCell(cell) ?? '';
      // El haystack de abajo ya normaliza etiqueta + filas del rango.

      // Etiquetas de las filas que el rango de la TIR toca: la mejor pista
      // disponible sobre que base de flujos se esta usando.
      const touchedLabels = new Set<string>();
      for (const range of extractRanges(cell.formula)) {
        const targetSheet = ctx.sheet(range.sheet ?? sheet.name);
        if (!targetSheet) continue;
        for (const r of targetSheet.rows) {
          if (r.row < range.start.row || r.row > range.end.row) continue;
          if (r.label) touchedLabels.add(r.label);
        }
        if (range.sheet) touchedLabels.add(`[hoja ${range.sheet}]`);
      }

      const haystack = normalizeLabel([rowLabel, ...touchedLabels].join(' '));
      const looksPaid = PAID_RE.test(haystack);
      const looksPortfolio = PORTFOLIO_RE.test(haystack);

      let verdict: string;
      let severity: Finding['severity'];
      if (looksPaid && !looksPortfolio) {
        verdict =
          'Las etiquetas asociadas sugieren que la base son sentencias pagadas, que es la correcta. Confirmar visualmente el rango.';
        severity = 'informativa';
      } else if (looksPortfolio && !looksPaid) {
        verdict =
          'Las etiquetas asociadas apuntan al portafolio total, que NO es la base correcta para decidir el tier de carry.';
        severity = 'alta';
      } else {
        verdict =
          'No es posible determinar automáticamente si la base son sentencias pagadas o el portafolio completo.';
        severity = 'media';
      }

      const feedsCarry = CARRY_RE.test(haystack);
      const feedsDistribution = DISTRIBUTION_RE.test(haystack);

      // Una TIR de activo suelta, sin relación con la cascada ni con el reparto,
      // no es un hallazgo: es simplemente una TIR.
      if (!feedsCarry && !feedsDistribution && !looksPortfolio) continue;

      const location = ref(sheet.name, cell.ref);

      out.push(
        makeFinding(
          {
            id: 'H5',
            sheet: sheet.name,
            cellRefs: [cell.ref],
            title: `Verificar sobre qué flujos corre la TIR${rowLabel ? ` — ${rowLabel}` : ''}${
              feedsCarry ? ' (alimenta decisión de carry)' : ''
            }`,
            description: `${location} calcula una TIR${
              feedsCarry ? ' que parece alimentar la decisión de split de carry' : ''
            }. ${verdict} La convención validada exige TIR de sentencias pagadas ("paid rights"), no TIR del portafolio completo: en C4 la diferencia fue 34.06% vs 22.63%, lo que cambia el tier de "Higher Catch-Up" (72/28) a "Discounted" (75/25).`,
            evidence: [
              `${location} = ${cell.formula}`,
              touchedLabels.size > 0
                ? `Filas cubiertas por el rango: ${[...touchedLabels].slice(0, 12).join(' | ')}`
                : 'El rango no toca filas con etiqueta detectable.',
              `Valor cacheado: ${cell.value ?? 's/d'}`,
            ],
            status: 'needs-review',
            severity,
            ...boardFields({
              observation:
                'la tasa interna de retorno que determina el escalon de carry debe calcularse sobre las sentencias efectivamente pagadas; conviene dejar explícito en el modelo cual es la base de flujos que alimenta ese cálculo.',
              location,
              suggestion:
                'rotular el rango de flujos como "sentencias pagadas" y, si hoy incluye portafolio vigente, separarlo en dos cálculos para que el escalon de carry quede trazable.',
            }),
          },
          out.length,
        ),
      );
    }
  }

  return out;
}
