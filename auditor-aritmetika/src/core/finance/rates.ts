/**
 * Convenciones de tasa validadas con Stephanie.
 *
 * La regla que mas plata mueve en los modelos de Aritmetika: el Preferred Yield
 * es 15% EA por Side Letter, pero se liquida como TASA SIMPLE MENSUAL
 * (saldo x 15%/12 = saldo x 1.25%), NO como EA compuesta mensualmente
 * (saldo x ((1.15)^(1/12)-1) = saldo x 1.171%).
 */

/** Tasa mensual bajo la convención validada (simple): r / 12. */
export function monthlyRateSimple(annualRate: number): number {
  return annualRate / 12;
}

/** Tasa mensual bajo la convención equivocada (EA compuesta): (1+r)^(1/12) - 1. */
export function monthlyRateCompounded(annualRate: number): number {
  return Math.pow(1 + annualRate, 1 / 12) - 1;
}

/** Diferencia de convención en puntos basicos mensuales (simple - compuesta). */
export function conventionGapBp(annualRate: number): number {
  return (monthlyRateSimple(annualRate) - monthlyRateCompounded(annualRate)) * 10_000;
}

export interface PrefYieldPeriod {
  /** Etiqueta del periodo (ej. "2026-03") */
  period: string;
  /** Saldo del LP sobre el que se liquida el pref en ese periodo */
  lpBalance: number;
}

export interface PrefYieldResult {
  simple: number;
  compounded: number;
  /** simple - compounded: el hallazgo cuantificado de H1 */
  delta: number;
  monthlyRateSimple: number;
  monthlyRateCompounded: number;
  byPeriod: { period: string; simple: number; compounded: number }[];
}

/**
 * Preferred Yield devengado sobre una serie de saldos mensuales, calculado con
 * ambas convenciones para poder mostrar la diferencia lado a lado.
 */
export function accruePreferredYield(
  periods: PrefYieldPeriod[],
  annualRate: number,
): PrefYieldResult {
  const rs = monthlyRateSimple(annualRate);
  const rc = monthlyRateCompounded(annualRate);
  const byPeriod = periods.map((p) => ({
    period: p.period,
    simple: p.lpBalance * rs,
    compounded: p.lpBalance * rc,
  }));
  const simple = byPeriod.reduce((a, p) => a + p.simple, 0);
  const compounded = byPeriod.reduce((a, p) => a + p.compounded, 0);
  return {
    simple,
    compounded,
    delta: simple - compounded,
    monthlyRateSimple: rs,
    monthlyRateCompounded: rc,
    byPeriod,
  };
}

/**
 * Atajo: pref yield simple sobre un saldo constante durante N meses.
 * Util para cuantificar H1 cuando solo tenemos saldo y tasa de una fórmula.
 */
export function prefYieldFlat(
  lpBalance: number,
  annualRate: number,
  months: number,
): PrefYieldResult {
  const periods = Array.from({ length: months }, (_, i) => ({
    period: `M${i + 1}`,
    lpBalance,
  }));
  return accruePreferredYield(periods, annualRate);
}

/**
 * Composición de tasas de referencia (notas offshore: SOFR + Spread).
 * Debe ser ADITIVA. La multiplicativa sobreestima la tasa.
 */
export function composeRateAdditive(base: number, spread: number): number {
  return base + spread;
}

export function composeRateMultiplicative(base: number, spread: number): number {
  return (1 + base) * (1 + spread) - 1;
}

/** Sobreestimacion (en bp) de usar composición multiplicativa en vez de aditiva. */
export function rateCompositionGapBp(base: number, spread: number): number {
  return (composeRateMultiplicative(base, spread) - composeRateAdditive(base, spread)) * 10_000;
}
