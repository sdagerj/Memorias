import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const COP = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });

/** Formatea montos grandes en millones, como se leen en los memos de junta. */
export function fmtMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1e6) return `$${COP.format(value / 1e6)}MM`;
  return `$${COP.format(value)}`;
}

export function fmtNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function fmtPct(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(digits)}%`;
}

/** Valor de celda listo para mostrar, sin perder la distincion de tipos. */
export function fmtCellValue(value: string | number | boolean | null): string {
  if (value === null) return '';
  if (typeof value === 'number') return fmtNumber(value, Number.isInteger(value) ? 0 : 4);
  return String(value);
}
