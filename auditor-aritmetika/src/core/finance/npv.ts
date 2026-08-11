/**
 * NPV / VPN — convención validada por Stephanie:
 *
 *  - Flujos YA RECIBIDOS (fecha <= corte) se suman SIN descontar.
 *  - Solo los flujos FUTUROS (fecha > corte) se traen a valor presente.
 *  - Nunca mezclar las dos convenciones dentro del mismo cálculo.
 *
 * La tasa de descuento es un parámetro (default 15% EA), nunca un hardcode.
 */

export interface DatedFlow {
  /** ISO yyyy-mm-dd */
  date: string;
  amount: number;
  label?: string;
}

export interface NpvBreakdown {
  /** Suma de flujos hasta el corte, a valor facial */
  receivedUndiscounted: number;
  /** Valor presente de los flujos posteriores al corte */
  futureDiscounted: number;
  /** Suma nominal de los flujos futuros, sin descontar (para contraste) */
  futureNominal: number;
  total: number;
  discountRateAnnual: number;
  cutoffDate: string;
  detail: {
    date: string;
    label?: string;
    amount: number;
    years: number;
    discountFactor: number;
    presentValue: number;
    isFuture: boolean;
  }[];
}

const MS_PER_DAY = 86_400_000;
const DAYS_PER_YEAR = 365;

export function yearFraction(fromISO: string, toISO: string): number {
  const from = Date.parse(fromISO);
  const to = Date.parse(toISO);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return NaN;
  return (to - from) / MS_PER_DAY / DAYS_PER_YEAR;
}

/**
 * NPV con la convención validada. `discountRateAnnual` es EA (efectivo anual),
 * el factor de descuento es (1+r)^(-t) con t en años/365.
 */
export function npvValidated(
  flows: DatedFlow[],
  cutoffDate: string,
  discountRateAnnual: number,
): NpvBreakdown {
  const detail: NpvBreakdown['detail'] = [];
  let receivedUndiscounted = 0;
  let futureDiscounted = 0;
  let futureNominal = 0;

  for (const flow of flows) {
    const years = yearFraction(cutoffDate, flow.date);
    const isFuture = Number.isFinite(years) && years > 0;
    if (!isFuture) {
      receivedUndiscounted += flow.amount;
      detail.push({
        date: flow.date,
        label: flow.label,
        amount: flow.amount,
        years: Number.isFinite(years) ? years : 0,
        discountFactor: 1,
        presentValue: flow.amount,
        isFuture: false,
      });
      continue;
    }
    const factor = Math.pow(1 + discountRateAnnual, -years);
    const pv = flow.amount * factor;
    futureDiscounted += pv;
    futureNominal += flow.amount;
    detail.push({
      date: flow.date,
      label: flow.label,
      amount: flow.amount,
      years,
      discountFactor: factor,
      presentValue: pv,
      isFuture: true,
    });
  }

  return {
    receivedUndiscounted,
    futureDiscounted,
    futureNominal,
    total: receivedUndiscounted + futureDiscounted,
    discountRateAnnual,
    cutoffDate,
    detail,
  };
}

/**
 * Convención INCORRECTA de contraste: descontar TODO desde el corte, incluidos
 * los flujos ya recibidos (que quedan capitalizados hacia atras). Se calcula
 * solo para poder mostrar la diferencia como hallazgo cuantificado.
 */
export function npvDiscountAll(
  flows: DatedFlow[],
  cutoffDate: string,
  discountRateAnnual: number,
): number {
  return flows.reduce((acc, flow) => {
    const years = yearFraction(cutoffDate, flow.date);
    if (!Number.isFinite(years)) return acc + flow.amount;
    return acc + flow.amount * Math.pow(1 + discountRateAnnual, -years);
  }, 0);
}
