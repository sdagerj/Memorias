import type { Finding } from '../types';
import { AuditContext, makeFinding, ref } from './context';
import { boardParagraph } from './boardLanguage';
import { extractFunctions, extractRanges } from '../parser/refs';
import { normalizeLabel } from '../parser/labels';

/**
 * H5 — IRR para split de carry calculada sobre la base equivocada.
 *
 * Debe ser TIR de sentencias PAGADAS, nunca TIR del portafolio total. En C4:
 * TIR pagadas 34.06% activa "Higher Catch-Up" (72/28); usar la TIR del
 * portafolio completo (22.63%) llevaria al split "Discounted" (75/25).
 *
 * Queda como candidato de revision: la app senala la formula y las etiquetas de
 * las filas que alimenta el rango, pero la confirmacion de cual base usa es
 * juicio de negocio.
 */

const IRR_FUNCS = new Set(['IRR', 'XIRR', 'TIR', 'TIR.NO.PER', 'MIRR', 'TIRX', 'RATE']);

const PAID_RE = /(pagad|paid|cobrad|recaudad|liquidad)/;
const PORTFOLIO_RE = /(portafolio|portfolio|vigente|total|todas|completo|global)/;

export function detectH5(ctx: AuditContext): Finding[] {
  const out: Finding[] = [];

  for (const sheet of ctx.workbook.sheets) {
    for (const cell of sheet.cells) {
      if (out.length >= ctx.config.maxPerCheck) return out;
      if (cell.kind !== 'formula' || !cell.formula) continue;

      const funcs = extractFunctions(cell.formula);
      if (!funcs.some((f) => IRR_FUNCS.has(f))) continue;

      const rowLabel = ctx.labelForCell(cell) ?? '';
      const normalized = normalizeLabel(rowLabel);

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
          'No es posible determinar automaticamente si la base son sentencias pagadas o el portafolio completo.';
        severity = 'media';
      }

      const feedsCarry = /(carry|split|catch|cascada|waterfall|tier|participacion)/.test(normalized);
      const location = ref(sheet.name, cell.ref);

      out.push(
        makeFinding(
          {
            id: 'H5',
            sheet: sheet.name,
            cellRefs: [cell.ref],
            title: `Base de la TIR a verificar${rowLabel ? ` — ${rowLabel}` : ''}${
              feedsCarry ? ' (alimenta decision de carry)' : ''
            }`,
            description: `${location} calcula una TIR${
              feedsCarry ? ' que parece alimentar la decision de split de carry' : ''
            }. ${verdict} La convencion validada exige TIR de sentencias pagadas ("paid rights"), no TIR del portafolio completo: en C4 la diferencia fue 34.06% vs 22.63%, lo que cambia el tier de "Higher Catch-Up" (72/28) a "Discounted" (75/25).`,
            evidence: [
              `${location} = ${cell.formula}`,
              touchedLabels.size > 0
                ? `Filas cubiertas por el rango: ${[...touchedLabels].slice(0, 12).join(' | ')}`
                : 'El rango no toca filas con etiqueta detectable.',
              `Valor cacheado: ${cell.value ?? 's/d'}`,
            ],
            status: 'needs-review',
            severity,
            boardLanguage: boardParagraph({
              observation:
                'la tasa interna de retorno que determina el escalon de carry debe calcularse sobre las sentencias efectivamente pagadas; conviene dejar explicito en el modelo cual es la base de flujos que alimenta ese calculo.',
              location,
              suggestion:
                'rotular el rango de flujos como "sentencias pagadas" y, si hoy incluye portafolio vigente, separarlo en dos calculos para que el escalon de carry quede trazable.',
            }),
          },
          out.length,
        ),
      );
    }
  }

  return out;
}
