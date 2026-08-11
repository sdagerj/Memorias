import { DEFAULT_CARRY_TIERS, type Finding } from '../types';
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

  out.push(...detectHardcodedCarrySplit(ctx));
  return out;
}

/** Porcentajes de reparto que el Side Letter de C4 hace depender de la TIR. */
const TIER_SHARES = new Map<number, string>([
  [0.25, '75/25'],
  [0.75, '75/25'],
  [0.27, '73/27'],
  [0.73, '73/27'],
  [0.28, '72/28'],
  [0.72, '72/28'],
]);

const CARRY_LABEL_RE = /(carry|catch\s*up|participacion en ganancias|performance fee|profit share)/;

/**
 * Reparto de carry escrito como número dentro de una fórmula.
 *
 * El buyout de C4 calcula `Carry PPF = -C50*0.75` y `Carry ARTK = -C50*0.25`:
 * fija el escalón más bajo por adelantado, cuando el Side Letter lo hace
 * depender de la TIR (>=28% -> 72/28; 26-28% -> 73/27; <26% -> 75/25). Si la
 * TIR resultante supera 26%, el reparto que el modelo aplica no es el pactado.
 */
/** Escalón que le corresponde a una TIR según los umbrales del Side Letter. */
function tierFor(irr: number): string {
  const tier = [...DEFAULT_CARRY_TIERS].reverse().find((t) => irr >= t.minIrr);
  return tier ? `${Math.round(tier.lpShare * 100)}/${Math.round(tier.gpShare * 100)}` : '—';
}

const IRR_LABEL_RE = /\b(irr|tir)\b/i;

/**
 * Todas las TIR del archivo con el escalón que implicaría cada una.
 *
 * En el buyout de C4 conviven `IRR FJ` 27,00%, `IRR FJ − Expenses` 26,06%,
 * `IRR FJ − Mgmt. Fee` 25,30% e `IRR Investor` 24,37%. Las dos primeras caen en
 * 73/27 y las dos últimas en 75/25: cuál se tome cambia el escalón. Mostrarlas
 * juntas convierte una pregunta abstracta en una decisión concreta.
 */
function irrCandidates(ctx: AuditContext): { label: string; ref: string; irr: number }[] {
  const found: { label: string; ref: string; irr: number }[] = [];
  const seen = new Set<string>();
  for (const sheet of ctx.workbook.sheets) {
    for (const row of sheet.rows) {
      if (!row.label || !IRR_LABEL_RE.test(row.label)) continue;
      for (const cell of row.cells) {
        if (cell.ref === row.labelRef) continue;
        const value = AuditContext.numeric(cell);
        if (value === null || value <= 0 || value >= 1) continue;
        const key = `${row.label}|${value.toFixed(4)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        found.push({ label: row.label, ref: ref(sheet.name, cell.ref), irr: value });
        break;
      }
    }
  }
  return found.sort((a, b) => b.irr - a.irr).slice(0, 8);
}

function detectHardcodedCarrySplit(ctx: AuditContext): Finding[] {
  const out: Finding[] = [];
  const irrs = irrCandidates(ctx);

  for (const sheet of ctx.workbook.sheets) {
    for (const cell of sheet.cells) {
      if (out.length >= ctx.config.maxRawPerCheck) return out;
      if (cell.kind !== 'formula' || !cell.formula) continue;

      const label = ctx.labelForCell(cell) ?? '';
      if (!CARRY_LABEL_RE.test(normalizeLabel(label))) continue;

      const literals = [...cell.formula.matchAll(/(?<![\d.])0?\.(\d+)(?![\d])/g)]
        .map((m) => Number(`0.${m[1]}`))
        .filter((v) => TIER_SHARES.has(v));
      if (literals.length === 0) continue;

      const share = literals[0];
      const tier = TIER_SHARES.get(share)!;
      const location = ref(sheet.name, cell.ref);
      // El literal puede ser la parte del LP (0,75) o la del GP (0,25). Cada
      // fila se compara contra SU propia parte en el escalón más alto (72/28),
      // no contra la del otro lado: escalar el monto del LP por la razón del GP
      // daría una cifra sin sentido.
      const isGpSide = share < 0.5;
      const target = isGpSide ? 0.28 : 0.72;
      const amount = AuditContext.numeric(cell);
      // TIR del archivo cuyo escalón NO coincide con el que la fórmula aplica.
      const divergentes = irrs.filter((c) => tierFor(c.irr) !== tier);

      // Cuánto cambia si en realidad aplicara el escalón más alto (72/28).
      const impact =
        amount !== null && amount !== 0 && share !== target
          ? {
              metric: `"${label}" con reparto ${tier} frente a 72/28`,
              before: Math.abs(amount),
              after: Math.abs(amount) * (target / share),
              delta: Math.abs(amount) * (target / share - 1),
              unit: 'COP' as const,
              basis: `monto actual con ${(share * 100).toFixed(0)}%, llevado a ${(
                target * 100
              ).toFixed(0)}% (su parte en el escalón 72/28, el que aplica con TIR >= 28%)`,
            }
          : undefined;

      out.push(
        makeFinding(
          {
            id: 'H5',
            sheet: sheet.name,
            cellRefs: [cell.ref],
            title: `Reparto de carry ${tier} escrito a mano en la fórmula — ${label}`,
            description: `La celda ${location} aplica el reparto ${tier} como número dentro de la fórmula, en vez de derivarlo de la TIR. El Side Letter hace depender el escalón del resultado: 72/28 con TIR igual o mayor a 28%, 73/27 entre 26% y 28%, y 75/25 por debajo de 26%.${
              divergentes.length > 0
                ? ` En este archivo hay TIR que implicarían un escalón distinto del aplicado: ${divergentes
                    .map(
                      (c) =>
                        `"${c.label}" ${(c.irr * 100).toFixed(2)}% (escalón ${tierFor(c.irr)})`,
                    )
                    .join(', ')}. Cuál de ellas manda es la decisión que define el reparto.`
                : ''
            } Con el porcentaje fijo, el modelo entrega siempre el mismo reparto sin importar la TIR que arroje el escenario, y quien lo lea no tiene forma de ver que el escalón quedó decidido de antemano.`,
            evidence: [
              `${location} = ${cell.formula}`,
              'Escalones del Side Letter: TIR >= 28% -> 72/28; 26%-28% -> 73/27; < 26% -> 75/25',
              ...irrs.map(
                (c) =>
                  `${c.label} = ${(c.irr * 100).toFixed(2)}% (${c.ref}) -> escalón ${tierFor(c.irr)}`,
              ),
            ],
            quantifiedImpact: impact,
            status: 'needs-review',
            severity: 'alta',
            ...boardFields({
              observation: `el reparto de carry ${tier} está escrito como número dentro de la fórmula de "${label}", de modo que el escalón no responde a la TIR del escenario como lo prevé el Side Letter.`,
              location,
              suggestion:
                'calcular el escalón a partir de la TIR de sentencias pagadas en el momento de cálculo que corresponda (90%, 95%, 97,5% o 100% de sentencias pagadas) y dejar los tres umbrales en la hoja de supuestos, de modo que el reparto se mueva solo cuando cambie el escenario.',
              impact,
            }),
          },
          out.length,
        ),
      );
    }
  }

  return out;
}
