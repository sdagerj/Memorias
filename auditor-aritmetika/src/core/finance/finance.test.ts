import { describe, expect, it } from 'vitest';
import {
  accruePreferredYield,
  composeRateAdditive,
  composeRateMultiplicative,
  conventionGapBp,
  monthlyRateCompounded,
  monthlyRateSimple,
  prefYieldFlat,
  rateCompositionGapBp,
} from './rates';
import { npvDiscountAll, npvValidated, yearFraction } from './npv';
import { irr, paidRightsIrr, totalPortfolioIrr, xirr, type Judgment } from './irr';
import { gpEconomics, runWaterfall, selectCarryTier } from './waterfall';
import { DEFAULT_CARRY_TIERS, DEFAULT_FUND_CONFIG } from '../types';

describe('convencion de preferred yield', () => {
  it('la tasa simple mensual de 15% EA es 1.25%', () => {
    expect(monthlyRateSimple(0.15)).toBeCloseTo(0.0125, 10);
  });

  it('la tasa compuesta mensual de 15% EA es 1.171%', () => {
    expect(monthlyRateCompounded(0.15)).toBeCloseTo(0.011715, 5);
  });

  it('la convencion simple siempre devenga mas que la compuesta', () => {
    expect(conventionGapBp(0.15)).toBeGreaterThan(0);
    for (const rate of [0.05, 0.1, 0.15, 0.2, 0.26]) {
      expect(monthlyRateSimple(rate)).toBeGreaterThan(monthlyRateCompounded(rate));
    }
  });

  it('devenga sobre una serie de saldos y expone la diferencia de convencion', () => {
    const result = accruePreferredYield(
      [
        { period: '2026-01', lpBalance: 100_000 },
        { period: '2026-02', lpBalance: 90_000 },
        { period: '2026-03', lpBalance: 80_000 },
      ],
      0.15,
    );
    expect(result.simple).toBeCloseTo((100_000 + 90_000 + 80_000) * 0.0125, 6);
    expect(result.delta).toBeCloseTo(result.simple - result.compounded, 12);
    expect(result.byPeriod).toHaveLength(3);
  });

  it('la diferencia de convencion escala con el saldo y el plazo', () => {
    const small = prefYieldFlat(1_000_000, 0.15, 12);
    const large = prefYieldFlat(10_000_000, 0.15, 12);
    expect(large.delta).toBeCloseTo(small.delta * 10, 6);
  });

  it('permite despejar el saldo-mes implicito en una brecha conocida', () => {
    // La brecha de convencion de C4 fue $6,631M COP. Sin el archivo original no
    // podemos reproducir el devengo mes a mes, pero si verificar que el motor es
    // consistente: la brecha es lineal en (saldo x meses), asi que el saldo-mes
    // implicito se despeja dividiendo por la brecha unitaria mensual.
    const gapPerPesoMonth = monthlyRateSimple(0.15) - monthlyRateCompounded(0.15);
    const impliedBalanceMonths = 6_631_000_000 / gapPerPesoMonth;
    const reconstructed = prefYieldFlat(impliedBalanceMonths / 12, 0.15, 12);
    expect(reconstructed.delta).toBeCloseTo(6_631_000_000, 0);
    expect(impliedBalanceMonths).toBeGreaterThan(0);
  });
});

describe('composicion de tasas (notas offshore)', () => {
  it('aditiva vs multiplicativa: la multiplicativa sobreestima', () => {
    expect(composeRateAdditive(0.0382, 0.05)).toBeCloseTo(0.0882, 10);
    expect(composeRateMultiplicative(0.0382, 0.05)).toBeGreaterThan(0.0882);
    expect(rateCompositionGapBp(0.0382, 0.05)).toBeCloseTo(0.0382 * 0.05 * 10_000, 6);
  });
});

describe('NPV con la convencion validada', () => {
  const cutoff = '2026-03-31';
  const flows = [
    { date: '2025-06-30', amount: 1_000, label: 'ya recibido' },
    { date: '2026-03-31', amount: 500, label: 'en el corte' },
    { date: '2027-03-31', amount: 1_000, label: 'futuro' },
  ];

  it('suma sin descontar lo recibido y descuenta solo lo futuro', () => {
    const result = npvValidated(flows, cutoff, 0.15);
    expect(result.receivedUndiscounted).toBe(1_500);
    expect(result.futureNominal).toBe(1_000);
    expect(result.futureDiscounted).toBeCloseTo(1_000 / 1.15, 6);
    expect(result.total).toBeCloseTo(1_500 + 1_000 / 1.15, 6);
  });

  it('el flujo en la fecha de corte no se descuenta', () => {
    const result = npvValidated(flows, cutoff, 0.15);
    const atCutoff = result.detail.find((d) => d.date === cutoff)!;
    expect(atCutoff.isFuture).toBe(false);
    expect(atCutoff.discountFactor).toBe(1);
  });

  it('difiere de descontar todo — esa diferencia es el hallazgo', () => {
    const validated = npvValidated(flows, cutoff, 0.15).total;
    const wrong = npvDiscountAll(flows, cutoff, 0.15);
    expect(validated).not.toBeCloseTo(wrong, 2);
    // Descontar todo capitaliza hacia atras lo ya recibido, subiendo el total.
    expect(wrong).toBeGreaterThan(validated);
  });

  it('la tasa de descuento es un parametro, no un hardcode', () => {
    const at15 = npvValidated(flows, cutoff, 0.15).total;
    const at26 = npvValidated(flows, cutoff, 0.26).total;
    expect(at26).toBeLessThan(at15);
  });

  it('calcula fracciones de anio base 365', () => {
    expect(yearFraction('2026-01-01', '2027-01-01')).toBeCloseTo(1, 2);
  });
});

describe('TIR', () => {
  it('resuelve una TIR periodica conocida', () => {
    expect(irr([-1000, 500, 500, 500])).toBeCloseTo(0.2337, 3);
  });

  it('devuelve null si no hay cambio de signo', () => {
    expect(irr([100, 200, 300])).toBeNull();
    expect(irr([-100, -200])).toBeNull();
  });

  it('XIRR maneja fechas irregulares', () => {
    const value = xirr([
      { date: '2024-01-01', amount: -1_000 },
      { date: '2025-01-01', amount: 1_200 },
    ]);
    expect(value).toBeCloseTo(0.2, 2);
  });

  it('la TIR de pagadas difiere de la del portafolio total', () => {
    const judgments: Judgment[] = [
      {
        id: 'S1',
        purchaseDate: '2023-01-01',
        purchaseValue: 100,
        maturityDate: '2024-01-01',
        maturityValue: 140,
        stage: 'Payed',
      },
      {
        id: 'S2',
        purchaseDate: '2023-01-01',
        purchaseValue: 100,
        maturityDate: '2028-01-01',
        maturityValue: 160,
        stage: 'Portfolio',
      },
    ];
    const paid = paidRightsIrr(judgments)!;
    const total = totalPortfolioIrr(judgments)!;
    expect(paid).toBeCloseTo(0.4, 2);
    expect(total).toBeLessThan(paid);
  });
});

describe('cascada y tiers de carry', () => {
  it('selecciona el tier por la TIR de pagadas', () => {
    // 34.06% (TIR pagadas de C4) activa Higher Catch-Up 72/28
    const high = selectCarryTier(0.3406, DEFAULT_CARRY_TIERS)!;
    expect(high.label).toBe('Higher Catch-Up');
    expect(high.gpShare).toBeCloseTo(0.28, 10);

    // 22.63% (TIR del portafolio completo) caeria en Discounted 75/25
    const low = selectCarryTier(0.2263, DEFAULT_CARRY_TIERS)!;
    expect(low.label).toBe('Discounted');
    expect(low.gpShare).toBeCloseTo(0.25, 10);
  });

  it('usar la base equivocada le quita carry al GP', () => {
    const base = {
      distributable: 1_000,
      lpContributedCapital: 400,
      accruedPreferredYield: 100,
      gpCatchUpRate: 0,
    };
    const correcto = runWaterfall({ ...base, carryIrr: 0.3406 });
    const incorrecto = runWaterfall({ ...base, carryIrr: 0.2263 });
    expect(correcto.gpTotal).toBeGreaterThan(incorrecto.gpTotal);
    expect(correcto.gpTotal - incorrecto.gpTotal).toBeCloseTo(500 * 0.03, 6);
  });

  it('respeta el orden de la cascada y no reparte de mas', () => {
    const result = runWaterfall({
      distributable: 300,
      lpContributedCapital: 400,
      accruedPreferredYield: 100,
      carryIrr: 0.35,
    });
    expect(result.returnOfCapital).toBe(300);
    expect(result.preferredYieldPaid).toBe(0);
    expect(result.residual).toBe(0);
    expect(result.unallocated).toBeCloseTo(0, 10);
  });

  it('sin tier aplicable no asigna carry al GP', () => {
    const result = runWaterfall({
      distributable: 1_000,
      lpContributedCapital: 0,
      accruedPreferredYield: 0,
      carryIrr: null,
    });
    expect(result.gpCarry).toBe(0);
    expect(result.lpCarry).toBe(1_000);
  });

  it('GP economics suma management fee y carry por anio', () => {
    const rows = gpEconomics({
      aumByYear: [
        { year: 2024, aum: 1_000 },
        { year: 2025, aum: 2_000 },
      ],
      managementFeeRate: 0.05,
      carryByYear: [{ year: 2025, carry: 300, type: 'Colte flip' }],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ year: 2024, managementFee: 50, carry: 0, total: 50 });
    expect(rows[1]).toEqual({ year: 2025, managementFee: 100, carry: 300, total: 400 });
  });
});

describe('escalones de carry de C4 (confirmados contra el Side Letter)', () => {
  // Regla que dio Stephanie: >=28% -> 72/28; 26%-28% -> 73/27; <26% -> 75/25.
  // No hay escalon 80/20. Si esto cambia, tiene que cambiar con el contrato en
  // la mano, no por un ajuste de codigo.
  const tier = (irr: number) => selectCarryTier(irr, DEFAULT_CARRY_TIERS)!;

  it('reparte 75/25 por debajo de 26%', () => {
    expect(tier(0).gpShare).toBe(0.25);
    expect(tier(0.2263).gpShare).toBe(0.25); // el caso real de C4
    expect(tier(0.2599).gpShare).toBe(0.25);
  });

  it('reparte 73/27 entre 26% y 28%', () => {
    expect(tier(0.26).gpShare).toBe(0.27);
    expect(tier(0.27).gpShare).toBe(0.27);
    expect(tier(0.2799).gpShare).toBe(0.27);
  });

  it('reparte 72/28 desde 28%', () => {
    expect(tier(0.28).gpShare).toBe(0.28);
    expect(tier(0.3406).gpShare).toBe(0.28); // el caso real de C4
  });

  it('los dos casos reales de C4 caen en escalones distintos', () => {
    // 34.06% (sentencias pagadas) vs 22.63% (portafolio completo): usar la base
    // equivocada cuesta 3 puntos de carry.
    expect(tier(0.3406).label).toBe('Higher Catch-Up');
    expect(tier(0.2263).label).toBe('Discounted');
    expect(tier(0.3406).gpShare - tier(0.2263).gpShare).toBeCloseTo(0.03, 10);
  });

  it('los cuatro momentos de cálculo son 90%, 95%, 97,5% y 100%', () => {
    expect(DEFAULT_FUND_CONFIG.calculationDateThresholds).toEqual([0.9, 0.95, 0.975, 1.0]);
  });
});
