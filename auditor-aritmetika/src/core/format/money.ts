import type { QuantifiedImpact } from '../types';

/**
 * Formato de cifras.
 *
 * El auditor no puede adivinar si una celda que dice 27.882 son 27.882 pesos o
 * 27.882 millones: eso depende de como esta armado el modelo y solo lo sabe
 * quien lo escribio. Por eso la escala es un parametro explicito que se elige
 * una vez y se aplica a TODA la aplicacion — tarjetas, graficas y memo — para
 * que nunca haya dos cifras del mismo hallazgo con lecturas distintas.
 */

export type MoneyScale = 'unidades' | 'miles' | 'millones';
export type MoneyCurrency = 'COP' | 'USD';

export interface MoneyFormat {
  /** Como estan expresadas las cifras dentro del archivo de Excel */
  scale: MoneyScale;
  currency: MoneyCurrency;
}

export const DEFAULT_MONEY_FORMAT: MoneyFormat = { scale: 'unidades', currency: 'COP' };

export const SCALE_FACTOR: Record<MoneyScale, number> = {
  unidades: 1,
  miles: 1e3,
  millones: 1e6,
};

export const SCALE_LABEL: Record<MoneyScale, string> = {
  unidades: 'unidades (el numero es el peso)',
  miles: 'miles',
  millones: 'millones',
};

/** Convierte el numero tal como aparece en la celda al valor real. */
export function toRealValue(rawValue: number, money: MoneyFormat): number {
  return rawValue * SCALE_FACTOR[money.scale];
}

function decimals(value: number, digits: number): string {
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function symbol(currency: MoneyCurrency): string {
  return currency === 'USD' ? 'US$' : '$';
}

/**
 * Cifra en el formato de un memo de junta: "$6.631 millones COP".
 *
 * Siempre lleva la unidad escrita. Un numero suelto en pantalla obliga a
 * adivinar la escala, y adivinar es exactamente lo que esta herramienta existe
 * para evitar.
 */
export function formatAmount(
  rawValue: number | null | undefined,
  money: MoneyFormat = DEFAULT_MONEY_FORMAT,
): string {
  if (rawValue === null || rawValue === undefined || !Number.isFinite(rawValue)) return '—';
  const real = toRealValue(rawValue, money);
  const abs = Math.abs(real);
  const sign = real < 0 ? '−' : '';
  const sym = symbol(money.currency);

  if (abs >= 1e12) {
    return `${sign}${sym}${decimals(abs / 1e12, abs < 1e13 ? 2 : 1)} billones ${money.currency}`;
  }
  if (abs >= 1e6) {
    return `${sign}${sym}${decimals(abs / 1e6, abs < 1e7 ? 1 : 0)} millones ${money.currency}`;
  }
  return `${sign}${sym}${decimals(abs, 0)} ${money.currency}`;
}

/** Version corta para ejes de graficas, donde no cabe la unidad completa. */
export function formatAmountShort(
  rawValue: number | null | undefined,
  money: MoneyFormat = DEFAULT_MONEY_FORMAT,
): string {
  if (rawValue === null || rawValue === undefined || !Number.isFinite(rawValue)) return '—';
  const real = toRealValue(rawValue, money);
  const abs = Math.abs(real);
  const sign = real < 0 ? '−' : '';
  const sym = symbol(money.currency);
  if (abs >= 1e12) return `${sign}${sym}${decimals(abs / 1e12, 1)} B`;
  if (abs >= 1e6) return `${sign}${sym}${decimals(abs / 1e6, abs < 1e7 ? 1 : 0)} M`;
  if (abs >= 1e3) return `${sign}${sym}${decimals(abs / 1e3, 0)} k`;
  return `${sign}${sym}${decimals(abs, 0)}`;
}

/**
 * Cifra de un impacto respetando su unidad. Solo el dinero se reescala: los
 * puntos básicos, los porcentajes y los conteos son absolutos.
 */
export function formatImpactValue(
  value: number,
  unit: QuantifiedImpact['unit'],
  money: MoneyFormat = DEFAULT_MONEY_FORMAT,
): string {
  if (unit === 'pct') return `${(value * 100).toFixed(2)}%`;
  if (unit === 'bp') return `${value.toFixed(1)} puntos básicos`;
  if (unit === 'unidades') return new Intl.NumberFormat('es-CO').format(Math.round(value));
  if (unit === 'USD') return formatAmount(value, { ...money, currency: 'USD' });
  return formatAmount(value, money);
}

/** True si el impacto es dinero y por lo tanto depende de la escala elegida. */
export function isMoneyImpact(impact: QuantifiedImpact | undefined): boolean {
  if (!impact) return false;
  const unit = impact.unit ?? 'COP';
  return unit === 'COP' || unit === 'USD';
}
