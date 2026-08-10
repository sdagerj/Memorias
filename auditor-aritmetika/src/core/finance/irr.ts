/**
 * TIR / XIRR reimplementadas en TypeScript.
 *
 * Necesarias porque la TIR alimenta la decision de split de carry, y esa TIR
 * debe calcularse sobre SENTENCIAS PAGADAS ("paid rights"), no sobre el
 * portafolio completo. Poder recalcular ambas es lo que convierte H5 en un
 * hallazgo cuantificado en vez de una sospecha.
 */

import type { DatedFlow } from './npv';
import { yearFraction } from './npv';

const MAX_ITER = 200;
const TOL = 1e-9;

/** NPV a tasa r de flujos periodicos (periodo 0, 1, 2, ...). */
export function npvAtRate(cashflows: number[], rate: number): number {
  return cashflows.reduce((acc, cf, i) => acc + cf / Math.pow(1 + rate, i), 0);
}

/**
 * TIR de flujos periodicos. Biseccion sobre un rango amplio: mas lenta que
 * Newton pero no diverge, y aqui la auditabilidad importa mas que los ms.
 */
export function irr(cashflows: number[], lo = -0.9999, hi = 10): number | null {
  if (cashflows.length < 2) return null;
  const hasPositive = cashflows.some((c) => c > 0);
  const hasNegative = cashflows.some((c) => c < 0);
  if (!hasPositive || !hasNegative) return null;

  let fLo = npvAtRate(cashflows, lo);
  const fHi = npvAtRate(cashflows, hi);
  if (fLo * fHi > 0) return null;

  let a = lo;
  let b = hi;
  for (let i = 0; i < MAX_ITER; i++) {
    const mid = (a + b) / 2;
    const fMid = npvAtRate(cashflows, mid);
    if (Math.abs(fMid) < TOL || (b - a) / 2 < TOL) return mid;
    if (fLo * fMid < 0) {
      b = mid;
    } else {
      a = mid;
      fLo = fMid;
    }
  }
  return (a + b) / 2;
}

/** NPV de flujos con fecha, base 365, anclado a la primera fecha. */
export function xnpvAtRate(flows: DatedFlow[], rate: number, anchorISO?: string): number {
  if (flows.length === 0) return 0;
  const anchor = anchorISO ?? flows[0].date;
  return flows.reduce(
    (acc, f) => acc + f.amount / Math.pow(1 + rate, yearFraction(anchor, f.date)),
    0,
  );
}

/** XIRR: TIR de flujos con fechas irregulares (lo normal en sentencias). */
export function xirr(flows: DatedFlow[], lo = -0.9999, hi = 10): number | null {
  if (flows.length < 2) return null;
  const sorted = [...flows].sort((a, b) => a.date.localeCompare(b.date));
  if (!sorted.some((f) => f.amount > 0) || !sorted.some((f) => f.amount < 0)) return null;

  const anchor = sorted[0].date;
  let fLo = xnpvAtRate(sorted, lo, anchor);
  if (fLo * xnpvAtRate(sorted, hi, anchor) > 0) return null;

  let a = lo;
  let b = hi;
  for (let i = 0; i < MAX_ITER; i++) {
    const mid = (a + b) / 2;
    const fMid = xnpvAtRate(sorted, mid, anchor);
    if (Math.abs(fMid) < TOL || (b - a) / 2 < TOL) return mid;
    if (fLo * fMid < 0) {
      b = mid;
    } else {
      a = mid;
      fLo = fMid;
    }
  }
  return (a + b) / 2;
}

export interface Judgment {
  id: string;
  purchaseDate: string;
  purchaseValue: number;
  maturityDate: string;
  maturityValue: number;
  /** 'Portfolio' = vigente, 'Payed' = ya pagada */
  stage: 'Portfolio' | 'Payed';
}

/**
 * TIR de sentencias PAGADAS — la base correcta para decidir el split de carry.
 * Solo entran las sentencias con stage === 'Payed'.
 */
export function paidRightsIrr(judgments: Judgment[]): number | null {
  const paid = judgments.filter((j) => j.stage === 'Payed');
  return xirr(judgmentsToFlows(paid));
}

/**
 * TIR de TODO el portafolio (incluye lo aun no cobrado). Se calcula solo para
 * contrastar: usar esta base para el split de carry es el error H5.
 */
export function totalPortfolioIrr(judgments: Judgment[]): number | null {
  return xirr(judgmentsToFlows(judgments));
}

export function judgmentsToFlows(judgments: Judgment[]): DatedFlow[] {
  const flows: DatedFlow[] = [];
  for (const j of judgments) {
    flows.push({ date: j.purchaseDate, amount: -Math.abs(j.purchaseValue), label: `${j.id} compra` });
    flows.push({ date: j.maturityDate, amount: Math.abs(j.maturityValue), label: `${j.id} pago` });
  }
  return flows.sort((a, b) => a.date.localeCompare(b.date));
}
