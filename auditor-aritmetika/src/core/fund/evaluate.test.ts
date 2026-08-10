import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseWorkbook } from '../parser/parseWorkbook';
import { runAudit } from '../findings';
import { evaluateFund, readCell, readRange } from './evaluate';
import { buildMemoHtml, buildMemoText, totalQuantifiedImpact } from '../export/memo';
import { DEFAULT_FUND_CONFIG, type FundConfig } from '../types';

const wb = parseWorkbook(
  new Uint8Array(readFileSync(join(process.cwd(), 'fixtures', 'modelo_demo_con_hallazgos.xlsx'))),
  'modelo_demo_con_hallazgos.xlsx',
);

const config: FundConfig = {
  ...DEFAULT_FUND_CONFIG,
  fundName: 'Demo',
  cellMap: {
    lpBalance: "'Pref Yield'!D3",
    cachedPrefYield: "'Pref Yield'!D5",
    paidRightsIrr: 'Cascada!D6',
    totalPortfolioIrr: 'Cascada!D6',
  },
};

describe('lectura de celdas y rangos mapeados', () => {
  it('lee una celda con nombre de hoja entrecomillado', () => {
    const result = readCell(wb, "'Pref Yield'!D3");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(200_000_000_000);
  });

  it('reporta el problema cuando el mapeo esta incompleto o mal escrito', () => {
    expect(readCell(wb, undefined).problem).toBe('sin mapear');
    expect(readCell(wb, 'D3').problem).toMatch(/falta el nombre de la hoja/);
    expect(readCell(wb, 'Cascada!Z99').problem).toMatch(/no existe/);
    expect(readCell(wb, 'Supuestos!C3').problem).toMatch(/no es numerica/);
  });

  it('lee un rango en orden de fila y columna', () => {
    const cells = readRange(wb, 'Flujos!D3:D7');
    expect(cells.map((c) => c.ref)).toEqual(['D3', 'D4', 'D5', 'D6', 'D7']);
  });

  it('devuelve vacio cuando el rango no es valido', () => {
    expect(readRange(wb, 'Flujos!D3')).toHaveLength(0);
    expect(readRange(wb, 'NoExiste!A1:A5')).toHaveLength(0);
  });
});

describe('evaluacion del fondo', () => {
  const evaluation = evaluateFund(wb, config, { months: 12, residualForCarry: 1_000_000 });

  it('calcula el pref yield con la convencion simple y expone la brecha', () => {
    expect(evaluation.prefYield.lpBalance).toBe(200_000_000_000);
    expect(evaluation.prefYield.simple).toBeCloseTo(200_000_000_000 * 0.0125 * 12, 0);
    expect(evaluation.prefYield.conventionDelta!).toBeGreaterThan(0);
  });

  it('contrasta el motor contra el valor cacheado del Excel', () => {
    const comparison = evaluation.comparisons.find((c) => c.metric.startsWith('Preferred Yield'))!;
    // El fixture cachea el devengo con la convencion compuesta, asi que el motor
    // debe salir por encima: esa diferencia ES el hallazgo.
    expect(comparison.excelCached).not.toBeNull();
    expect(comparison.delta!).toBeGreaterThan(0);
  });

  it('reporta los mapeos faltantes en vez de fallar en silencio', () => {
    const sinMapeo = evaluateFund(wb, { ...config, cellMap: {} });
    expect(sinMapeo.prefYield.problems.join(' ')).toMatch(/Saldo LP/);
    expect(sinMapeo.npv.breakdown).toBeNull();
  });

  it('selecciona el tier de carry a partir de la TIR mapeada', () => {
    // Cascada!D6 = 22.63% → tier Discounted (75/25)
    expect(evaluation.carry.tierWithPaidRights?.label).toBe('Discounted');
  });
});

describe('memo de junta', () => {
  const audit = runAudit(wb);
  const memo = buildMemoText({ workbook: wb, audit, findings: audit.findings });

  it('arma las secciones del memo', () => {
    expect(memo).toContain('MEMORANDO — REVISION DE MODELO FINANCIERO');
    expect(memo).toContain('1. ALCANCE');
    expect(memo).toContain('3. OPORTUNIDADES DE MEJORA IDENTIFICADAS');
    expect(memo).toContain('5. TRAZABILIDAD');
    expect(memo).toContain(wb.fileName);
  });

  it('excluye los hallazgos descartados', () => {
    const descartado = { ...audit.findings[0], status: 'dismissed' as const };
    const conDescarte = buildMemoText({
      workbook: wb,
      audit,
      findings: [descartado, ...audit.findings.slice(1)],
    });
    expect(conDescarte).not.toContain(descartado.title);
  });

  it('agrega la seccion de GP economics solo si hay datos', () => {
    expect(memo).not.toContain('ECONOMIA DEL GP');
    const conGp = buildMemoText({
      workbook: wb,
      audit,
      findings: audit.findings,
      gpEconomics: [{ year: 2026, managementFee: 100, carry: 50, total: 150 }],
    });
    expect(conGp).toContain('4. ECONOMIA DEL GP POR ANIO');
  });

  it('suma el impacto cuantificado en COP', () => {
    expect(totalQuantifiedImpact(audit.findings)).toBeGreaterThan(0);
  });

  it('genera HTML que Word puede abrir, con el contenido escapado', () => {
    const html = buildMemoHtml({ workbook: wb, audit, findings: audit.findings });
    expect(html).toContain('urn:schemas-microsoft-com:office:word');
    expect(html).toContain('<h1>MEMORANDO');
    expect(html).not.toMatch(/<script/i);
  });
});
