import type { Finding } from '../types';
import { AuditContext, makeFinding, ref } from './context';
import { boardFields } from './boardLanguage';
import { extractSingleRefs, stripStringLiterals } from '../parser/refs';
import { monthlyRateSimple, rateCompositionGapBp } from '../finance/rates';

/**
 * H1 — Preferred Yield con tasa EA compuesta en vez de simple.
 *
 * Por Side Letter el pref es 15% EA pero se liquida como tasa simple mensual
 * (r/12 = 1.25%). Escribirlo como (1+r)^(1/12)-1 da 1.171% y en C4 esa sola
 * convención valia $6,631M COP.
 *
 * Este detector también captura su primo hermano de las notas offshore: componer
 * SOFR + Spread de forma multiplicativa ((1+a)*(1+b)-1) en vez de aditiva.
 */

/** (1+X)^(1/N) y POWER(1+X, 1/N) */
const COMPOUND_CARET = /\(\s*1\s*\+\s*([^()]+?)\s*\)\s*\^\s*\(?\s*1\s*\/\s*(\d{1,3})\s*\)?/i;
const COMPOUND_POWER = /POWER\s*\(\s*1\s*\+\s*([^,]+?)\s*,\s*1\s*\/\s*(\d{1,3})\s*\)/i;
/** (1+A)*(1+B)-1 : composición multiplicativa de tasas */
const MULTIPLICATIVE = /\(\s*1\s*\+\s*([^()]+?)\s*\)\s*\*\s*\(\s*1\s*\+\s*([^()]+?)\s*\)/i;

const PERIODS_PER_YEAR = new Set([2, 3, 4, 6, 12, 24, 52, 360, 365]);

const RATE_CONTEXT_RE =
  /(pref|preferred|yield|rendimiento|tasa|rate|interes|usura|dtf|sofr|ea\b|efectiv)/i;

interface Operand {
  text: string;
  value: number | null;
}

function resolveOperand(ctx: AuditContext, sheetName: string, text: string): Operand {
  const trimmed = text.trim();
  const asNumber = Number(trimmed.replace('%', ''));
  if (trimmed !== '' && Number.isFinite(asNumber)) {
    return { text: trimmed, value: trimmed.includes('%') ? asNumber / 100 : asNumber };
  }
  const refs = extractSingleRefs(trimmed);
  if (refs.length === 1) {
    const cell = ctx.resolveRef(sheetName, refs[0].sheet, refs[0].raw.split('!').pop() ?? '');
    return { text: trimmed, value: AuditContext.numeric(cell) };
  }
  return { text: trimmed, value: null };
}

/**
 * Busca en la fórmula un operando que se vea como saldo (número grande) para
 * poder traducir la diferencia de tasa a pesos.
 */
function findBalanceOperand(
  ctx: AuditContext,
  sheetName: string,
  formula: string,
): { ref: string; value: number } | null {
  let best: { ref: string; value: number } | null = null;
  for (const single of extractSingleRefs(formula)) {
    const a1 = single.raw.split('!').pop() ?? '';
    const cell = ctx.resolveRef(sheetName, single.sheet, a1);
    const value = AuditContext.numeric(cell);
    if (value === null || Math.abs(value) < 1000) continue;
    if (!best || Math.abs(value) > Math.abs(best.value)) {
      best = { ref: single.sheet ? `${single.sheet}!${a1}` : a1, value };
    }
  }
  return best;
}

export function detectH1(ctx: AuditContext): Finding[] {
  const out: Finding[] = [];

  for (const sheet of ctx.workbook.sheets) {
    for (const cell of sheet.cells) {
      if (cell.kind !== 'formula' || !cell.formula) continue;
      if (out.length >= ctx.config.maxPerCheck) return out;

      const formula = stripStringLiterals(cell.formula);
      const label = ctx.labelForCell(cell) ?? '';

      const compound = COMPOUND_CARET.exec(formula) ?? COMPOUND_POWER.exec(formula);
      if (compound) {
        const periods = parseInt(compound[2], 10);
        if (PERIODS_PER_YEAR.has(periods)) {
          const rate = resolveOperand(ctx, sheet.name, compound[1]);
          const finding = buildCompoundFinding(ctx, {
            sheetName: sheet.name,
            cellRef: cell.ref,
            formula: cell.formula,
            label,
            periods,
            annualRate: rate.value,
            rateText: rate.text,
            index: out.length,
          });
          out.push(finding);
          continue;
        }
      }

      const multiplicative = MULTIPLICATIVE.exec(formula);
      if (multiplicative && /-\s*1/.test(formula)) {
        const a = resolveOperand(ctx, sheet.name, multiplicative[1]);
        const b = resolveOperand(ctx, sheet.name, multiplicative[2]);
        // Solo aplica si ambos operandos se ven como tasas (0 < x < 1) o el
        // contexto de la fila habla de tasas.
        const looksRate = (o: Operand) => o.value !== null && o.value > 0 && o.value < 1;
        if ((looksRate(a) && looksRate(b)) || RATE_CONTEXT_RE.test(label)) {
          out.push(
            buildMultiplicativeFinding(ctx, {
              sheetName: sheet.name,
              cellRef: cell.ref,
              formula: cell.formula,
              label,
              a: a.value,
              b: b.value,
              index: out.length,
            }),
          );
        }
      }
    }
  }

  return out;
}

function buildCompoundFinding(
  ctx: AuditContext,
  args: {
    sheetName: string;
    cellRef: string;
    formula: string;
    label: string;
    periods: number;
    annualRate: number | null;
    rateText: string;
    index: number;
  },
): Finding {
  const location = ref(args.sheetName, args.cellRef);
  const rate = args.annualRate ?? ctx.config.prefRateAnnual;
  const rateIsResolved = args.annualRate !== null;
  const simple = monthlyRateSimple(rate) * (12 / args.periods);
  const compounded = Math.pow(1 + rate, 1 / args.periods) - 1;
  const gapBp = (simple - compounded) * 10_000;

  const balance = findBalanceOperand(ctx, args.sheetName, args.formula);
  const periodicity = args.periods === 12 ? 'mensual' : `de 1/${args.periods} de año`;

  const impact = balance
    ? {
        metric: `Devengo ${periodicity} sobre ${balance.ref}`,
        before: balance.value * compounded,
        after: balance.value * simple,
        delta: balance.value * (simple - compounded),
        unit: 'COP' as const,
        basis: `saldo ${new Intl.NumberFormat('es-CO').format(
          Math.round(balance.value),
        )} x (${(simple * 100).toFixed(3)}% simple − ${(compounded * 100).toFixed(3)}% compuesta)`,
      }
    : {
        metric: `Tasa ${periodicity} aplicada`,
        before: compounded * 10_000,
        after: simple * 10_000,
        delta: gapBp,
        unit: 'bp' as const,
        basis: `${rateIsResolved ? 'tasa leida del modelo' : 'tasa asumida por default'} ${(
          rate * 100
        ).toFixed(2)}% EA`,
      };

  const observation = `la fórmula liquida el rendimiento con tasa efectiva anual compuesta ((1+r)^(1/${args.periods})−1) en lugar de la convención de tasa simple pactada en Side Letter (r/${args.periods}).`;

  return makeFinding(
    {
      id: 'H1',
      sheet: args.sheetName,
      cellRefs: [args.cellRef],
      title: `Convención de tasa compuesta donde corresponde tasa simple${
        args.label ? ` — ${args.label}` : ''
      }`,
      description: `La celda ${location} usa capitalización compuesta para llevar la tasa anual a periodo ${periodicity}. Con ${(
        rate * 100
      ).toFixed(2)}% EA la convención simple da ${(simple * 100).toFixed(
        3,
      )}% y la compuesta ${(compounded * 100).toFixed(3)}%: una diferencia de ${gapBp.toFixed(
        1,
      )} bp por periodo que se acumula sobre todo el saldo del LP.`,
      evidence: [`${location} = ${args.formula}`],
      quantifiedImpact: impact,
      status: 'auto-detected',
      severity: 'alta',
      ...boardFields({
        observation,
        location,
        suggestion: `homologar la fórmula a tasa simple (tasa_anual/${args.periods}) para alinear el devengo con la convención del Side Letter, y dejar la tasa anual como parámetro editable en una sola celda de supuestos.`,
        impact,
      }),
    },
    args.index,
  );
}

function buildMultiplicativeFinding(
  _ctx: AuditContext,
  args: {
    sheetName: string;
    cellRef: string;
    formula: string;
    label: string;
    a: number | null;
    b: number | null;
    index: number;
  },
): Finding {
  const location = ref(args.sheetName, args.cellRef);
  const a = args.a ?? 0.0382;
  const b = args.b ?? 0.05;
  const gapBp = rateCompositionGapBp(a, b);
  const impact = {
    metric: 'Tasa compuesta del tramo',
    before: (a + b) * 10_000,
    after: ((1 + a) * (1 + b) - 1) * 10_000,
    delta: gapBp,
    unit: 'bp' as const,
    basis: `componentes ${(a * 100).toFixed(2)}% y ${(b * 100).toFixed(2)}%${
      args.a === null || args.b === null ? ' (uno o ambos asumidos por no ser resolubles)' : ''
    }`,
  };

  return makeFinding(
    {
      id: 'H1',
      sheet: args.sheetName,
      cellRefs: [args.cellRef],
      title: `Composición multiplicativa de tasas${args.label ? ` — ${args.label}` : ''}`,
      description: `La celda ${location} compone dos tasas como (1+a)x(1+b)−1. La convención validada para tasa de referencia + spread (ej. SOFR + Spread) es aditiva; la multiplicativa sobreestima la tasa en ${gapBp.toFixed(
        1,
      )} bp.`,
      evidence: [`${location} = ${args.formula}`],
      quantifiedImpact: impact,
      status: 'auto-detected',
      severity: 'alta',
      ...boardFields({
        observation:
          'la tasa del tramo se compone de forma multiplicativa ((1+SOFR)x(1+Spread)−1) en lugar de aditiva (SOFR + Spread), lo que sobreestima el costo de la deuda.',
        location,
        suggestion:
          'ajustar la composición a formato aditivo y verificar que el dashboard y el motor de cascada consuman la misma celda de tasa.',
        impact,
      }),
    },
    args.index,
  );
}
