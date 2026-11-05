/**
 * Cascada de distribución (waterfall) y economía del GP.
 *
 * Orden típico:
 *   1. Retorno de capital al LP
 *   2. Preferred Yield acumulado al LP
 *   3. Catch-up al GP
 *   4. Split de carry entre LP y GP (escalonado por TIR)
 *
 * El tier de carry se decide con la TIR de SENTENCIAS PAGADAS. Usar la TIR del
 * portafolio completo baja el tier y le quita plata al GP — ese es H5.
 */

import type { CarryTier } from '../types';
import { DEFAULT_CARRY_TIERS } from '../types';

export interface WaterfallInput {
  /** Caja total disponible para distribuir */
  distributable: number;
  /** Capital aportado por el LP pendiente de retornar */
  lpContributedCapital: number;
  /** Preferred Yield acumulado a favor del LP */
  accruedPreferredYield: number;
  /** TIR que decide el tier de carry (debe venir de sentencias pagadas) */
  carryIrr: number | null;
  /** Fraccion de catch-up del GP sobre el pref pagado (0 = sin catch-up) */
  gpCatchUpRate?: number;
  tiers?: CarryTier[];
}

export interface WaterfallResult {
  returnOfCapital: number;
  preferredYieldPaid: number;
  gpCatchUp: number;
  residual: number;
  lpCarry: number;
  gpCarry: number;
  tier: CarryTier | null;
  lpTotal: number;
  gpTotal: number;
  /** Caja que sobra sin asignar (no debería pasar; se muestra si pasa) */
  unallocated: number;
  steps: { step: string; amount: number; toLp: number; toGp: number }[];
}

/** Tier aplicable según la TIR: el de mayor umbral que la TIR alcanza. */
export function selectCarryTier(
  irrValue: number | null,
  tiers: CarryTier[] = DEFAULT_CARRY_TIERS,
): CarryTier | null {
  if (irrValue === null || !Number.isFinite(irrValue)) return null;
  const sorted = [...tiers].sort((a, b) => a.minIrr - b.minIrr);
  let selected: CarryTier | null = null;
  for (const tier of sorted) if (irrValue >= tier.minIrr) selected = tier;
  return selected;
}

export function runWaterfall(input: WaterfallInput): WaterfallResult {
  const tiers = input.tiers ?? DEFAULT_CARRY_TIERS;
  const catchUpRate = input.gpCatchUpRate ?? 0;
  const steps: WaterfallResult['steps'] = [];
  let cash = Math.max(0, input.distributable);

  const returnOfCapital = Math.min(cash, Math.max(0, input.lpContributedCapital));
  cash -= returnOfCapital;
  steps.push({
    step: '1. Retorno de capital al LP',
    amount: returnOfCapital,
    toLp: returnOfCapital,
    toGp: 0,
  });

  const preferredYieldPaid = Math.min(cash, Math.max(0, input.accruedPreferredYield));
  cash -= preferredYieldPaid;
  steps.push({
    step: '2. Preferred Yield al LP',
    amount: preferredYieldPaid,
    toLp: preferredYieldPaid,
    toGp: 0,
  });

  const gpCatchUp = Math.min(cash, preferredYieldPaid * catchUpRate);
  cash -= gpCatchUp;
  steps.push({ step: '3. Catch-up al GP', amount: gpCatchUp, toLp: 0, toGp: gpCatchUp });

  const tier = selectCarryTier(input.carryIrr, tiers);
  const residual = cash;
  const lpShare = tier ? tier.lpShare : 1;
  const gpShare = tier ? tier.gpShare : 0;
  const lpCarry = residual * lpShare;
  const gpCarry = residual * gpShare;
  steps.push({
    step: `4. Split de carry${tier ? ` — ${tier.label} (${pct(lpShare)}/${pct(gpShare)})` : ' — sin tier aplicable'}`,
    amount: residual,
    toLp: lpCarry,
    toGp: gpCarry,
  });

  const lpTotal = returnOfCapital + preferredYieldPaid + lpCarry;
  const gpTotal = gpCatchUp + gpCarry;

  return {
    returnOfCapital,
    preferredYieldPaid,
    gpCatchUp,
    residual,
    lpCarry,
    gpCarry,
    tier,
    lpTotal,
    gpTotal,
    unallocated: Math.max(0, input.distributable) - lpTotal - gpTotal,
    steps,
  };
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

export interface GpEconomicsInput {
  /** Capital comprometido/aportado sobre el que corre el MF */
  aumByYear: { year: number; aum: number }[];
  managementFeeRate: number;
  /** Carry por año y tipo, ya calculado o mapeado desde el modelo */
  carryByYear: { year: number; carry: number; type?: string }[];
}

export interface GpEconomicsRow {
  year: number;
  managementFee: number;
  carry: number;
  total: number;
}

/** GP earnings por año: MF + carry. Es la vista que va a junta. */
export function gpEconomics(input: GpEconomicsInput): GpEconomicsRow[] {
  const years = new Set<number>([
    ...input.aumByYear.map((r) => r.year),
    ...input.carryByYear.map((r) => r.year),
  ]);
  return [...years]
    .sort((a, b) => a - b)
    .map((year) => {
      const aum = input.aumByYear.filter((r) => r.year === year).reduce((a, r) => a + r.aum, 0);
      const managementFee = aum * input.managementFeeRate;
      const carry = input.carryByYear
        .filter((r) => r.year === year)
        .reduce((a, r) => a + r.carry, 0);
      return { year, managementFee, carry, total: managementFee + carry };
    });
}
