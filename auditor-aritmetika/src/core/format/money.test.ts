import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MONEY_FORMAT,
  formatAmount,
  formatAmountShort,
  formatImpactValue,
  isMoneyImpact,
  toRealValue,
  type MoneyFormat,
} from './money';

const enMillones: MoneyFormat = { scale: 'millones', currency: 'COP' };
const enUnidades: MoneyFormat = { scale: 'unidades', currency: 'COP' };

describe('escala de las cifras', () => {
  it('lleva el numero de la celda al valor real segun la escala', () => {
    expect(toRealValue(27_882, enUnidades)).toBe(27_882);
    expect(toRealValue(27_882, { scale: 'miles', currency: 'COP' })).toBe(27_882_000);
    expect(toRealValue(27_882, enMillones)).toBe(27_882_000_000);
  });

  it('el mismo numero se lee distinto segun la escala declarada', () => {
    // El caso real: una celda que dice 27.882 puede ser 27 mil pesos o 27 mil
    // millones. La app no lo adivina, lo pregunta.
    expect(formatAmount(27_882, enUnidades)).toBe('$27.882 COP');
    expect(formatAmount(27_882, enMillones)).toBe('$27.882 millones COP');
  });

  it('escribe siempre la unidad, nunca un numero suelto', () => {
    expect(formatAmount(6_631_000_000, enUnidades)).toBe('$6.631 millones COP');
    expect(formatAmount(1_500_000_000_000, enUnidades)).toBe('$1,50 billones COP');
    expect(formatAmount(200, { scale: 'unidades', currency: 'USD' })).toBe('US$200 USD');
  });

  it('usa un decimal cuando la cifra en millones es de un solo digito', () => {
    expect(formatAmount(6_400_000, enUnidades)).toBe('$6,4 millones COP');
    expect(formatAmount(64_000_000, enUnidades)).toBe('$64 millones COP');
  });

  it('marca el signo negativo con el menos tipografico', () => {
    expect(formatAmount(-3_000_000, enUnidades)).toBe('−$3,0 millones COP');
  });

  it('devuelve raya cuando no hay valor', () => {
    expect(formatAmount(null)).toBe('—');
    expect(formatAmount(Number.NaN)).toBe('—');
    expect(formatAmountShort(undefined)).toBe('—');
  });

  it('abrevia para los ejes de las graficas', () => {
    expect(formatAmountShort(6_631_000_000, enUnidades)).toBe('$6.631 M');
    expect(formatAmountShort(27_882, enUnidades)).toBe('$28 k');
  });
});

describe('unidades que no son dinero', () => {
  it('no reescala puntos básicos, porcentajes ni conteos', () => {
    expect(formatImpactValue(18.1, 'bp', enMillones)).toBe('18.1 puntos básicos');
    expect(formatImpactValue(0.3406, 'pct', enMillones)).toBe('34.06%');
    expect(formatImpactValue(-2, 'unidades', enMillones)).toBe('-2');
  });

  it('distingue el impacto en dinero del que no lo es', () => {
    const base = { metric: 'x', before: 0, after: 1, delta: 1 };
    expect(isMoneyImpact({ ...base, unit: 'COP' })).toBe(true);
    expect(isMoneyImpact({ ...base, unit: 'USD' })).toBe(true);
    expect(isMoneyImpact({ ...base })).toBe(true); // sin unidad = COP
    expect(isMoneyImpact({ ...base, unit: 'bp' })).toBe(false);
    expect(isMoneyImpact(undefined)).toBe(false);
  });

  it('el default no reescala nada', () => {
    expect(DEFAULT_MONEY_FORMAT.scale).toBe('unidades');
    expect(formatAmount(1_000_000)).toBe('$1,0 millones COP');
  });
});
