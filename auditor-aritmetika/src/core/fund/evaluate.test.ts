import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseWorkbook } from '../parser/parseWorkbook';
import { runAudit } from '../findings';
import { evaluateFund, readCell, readRange } from './evaluate';
import {
  buildMemoDocument,
  buildMemoHtml,
  buildMemoText,
  totalQuantifiedImpact,
} from '../export/memo';
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
    expect(readCell(wb, 'Supuestos!C3').problem).toMatch(/no es numérica/);
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
    expect(memo).toContain('MEMORANDO — REVISIÓN DE MODELO FINANCIERO');
    expect(memo).toContain('1. ALCANCE');
    // El memo abre por lo que se dice en junta, no por la lista completa.
    expect(memo).toContain('2. LO QUE HAY QUE PONER SOBRE LA MESA');
    expect(memo).toContain('3. DETALLE DE LAS OPORTUNIDADES');
    expect(memo).toContain('TRAZABILIDAD');
    expect(memo).toContain(wb.fileName);
  });

  it('pone adelante hasta tres puntos, con su cifra y qué hacer', () => {
    const doc = buildMemoDocument({ workbook: wb, audit, findings: audit.findings });
    const headlines = doc.sections[1].blocks.filter((b) => b.kind === 'headline');
    expect(headlines.length).toBeGreaterThan(0);
    expect(headlines.length).toBeLessThanOrEqual(3);
    for (const h of headlines) {
      if (h.kind !== 'headline') continue;
      expect(h.meaning.length).toBeGreaterThan(0);
      expect(h.ask.length).toBeGreaterThan(0);
      expect(h.location).toBeTruthy();
    }
  });

  it('manda la higiene a un anexo en vez de mezclarla con lo que mueve cifras', () => {
    const doc = buildMemoDocument({ workbook: wb, audit, findings: audit.findings });
    const detalle = doc.sections.find((s) => s.heading === 'DETALLE DE LAS OPORTUNIDADES')!;
    const anexo = doc.sections.find((s) => s.heading.startsWith('ANEXO'));
    expect(anexo).toBeDefined();
    // En el detalle no entra nada informativo, y el anexo es una lista de notas.
    expect(detalle.blocks.some((b) => b.kind === 'subheading' && /higiene/i.test(b.text))).toBe(
      false,
    );
    expect(anexo!.blocks.some((b) => b.kind === 'note')).toBe(true);
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
    expect(memo).not.toContain('ECONOMÍA DEL GP');
    const conGp = buildMemoText({
      workbook: wb,
      audit,
      findings: audit.findings,
      gpEconomics: [{ year: 2026, managementFee: 100, carry: 50, total: 150 }],
    });
    expect(conGp).toContain('4. ECONOMÍA DEL GP POR AÑO');
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

  it('arma el documento estructurado del que salen texto, Word y vista previa', () => {
    const doc = buildMemoDocument({ workbook: wb, audit, findings: audit.findings });
    expect(doc.sections.map((s) => `${s.number}. ${s.heading}`)).toEqual([
      '1. ALCANCE',
      '2. LO QUE HAY QUE PONER SOBRE LA MESA',
      '3. DETALLE DE LAS OPORTUNIDADES',
      '4. ANEXO — HIGIENE DEL MODELO',
      '5. TRAZABILIDAD',
    ]);
    const hallazgos = doc.sections[2].blocks.filter((b) => b.kind === 'finding');
    expect(hallazgos.length).toBeGreaterThan(0);
    // Cada hallazgo del memo trae la explicación sin jerga del chequeo.
    expect(hallazgos.every((b) => b.kind === 'finding' && b.meaning.length > 0)).toBe(true);
  });

  it('numera las secciones sin huecos, entren o no las opcionales', () => {
    const doc = buildMemoDocument({
      workbook: wb,
      audit,
      findings: audit.findings,
      gpEconomics: [{ year: 2026, managementFee: 100, carry: 50, total: 150 }],
    });
    expect(doc.sections.map((s) => s.number)).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(doc.sections[doc.sections.length - 1].heading).toBe('TRAZABILIDAD');
  });

  it('la escala elegida cambia como se leen las cifras del memo', () => {
    const base = { workbook: wb, audit, findings: audit.findings };
    const enUnidades = buildMemoText({ ...base, money: { scale: 'unidades', currency: 'COP' } });
    const enMillones = buildMemoText({ ...base, money: { scale: 'millones', currency: 'COP' } });
    expect(enUnidades).toContain('Cifras expresadas en: unidades de COP');
    expect(enMillones).toContain('Cifras expresadas en: millones de COP');
    expect(enUnidades).not.toBe(enMillones);
  });
});
