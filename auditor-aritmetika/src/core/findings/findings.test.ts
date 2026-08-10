import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseWorkbook } from '../parser/parseWorkbook';
import { runAudit } from './index';
import { damerauLevenshtein } from './h10';
import type { Finding, FindingId, ParsedWorkbook } from '../types';

/**
 * Test de punta a punta del motor de hallazgos contra los fixtures sinteticos
 * generados por scripts/generate-fixtures.mjs, que replican los patrones H1-H12
 * a proposito.
 */

const FIXTURES = join(process.cwd(), 'fixtures');

function load(name: string): ParsedWorkbook {
  const buf = readFileSync(join(FIXTURES, name));
  return parseWorkbook(new Uint8Array(buf), name);
}

const dirty = load('modelo_demo_con_hallazgos.xlsx');
const clean = load('modelo_demo_limpio.xlsx');

const dirtyFindings = runAudit(dirty).findings;
const cleanResult = runAudit(clean);

function byId(findings: Finding[], id: FindingId): Finding[] {
  return findings.filter((f) => f.id === id);
}

describe('parseo estructural', () => {
  it('mapea todas las hojas y clasifica las celdas', () => {
    expect(dirty.sheets.map((s) => s.name)).toEqual([
      'Supuestos',
      'Pref Yield',
      'Ingresos',
      'Flujos',
      'Cascada',
      'Resumen',
      'Ingresos VIEJO',
      'Cascada v2 backup',
    ]);
    expect(dirty.totals.formulas).toBeGreaterThan(0);
    expect(dirty.totals.hardcoded).toBeGreaterThan(0);
  });

  it('detecta la columna C como columna de etiquetas', () => {
    for (const sheet of dirty.sheets) {
      expect(sheet.labelCol).toBe(2);
    }
  });

  it('construye el grafo de referencias entre hojas', () => {
    const cascada = dirty.sheets.find((s) => s.name === 'Cascada')!;
    expect(cascada.referencedBy).toContain('Resumen');
    expect(cascada.references).toContain('Flujos');
  });

  it('marca como huerfanas las hojas de version sin referencias', () => {
    const vieja = dirty.sheets.find((s) => s.name === 'Ingresos VIEJO')!;
    const backup = dirty.sheets.find((s) => s.name === 'Cascada v2 backup')!;
    const resumen = dirty.sheets.find((s) => s.name === 'Resumen')!;
    expect(vieja.isOrphan).toBe(true);
    expect(backup.isOrphan).toBe(true);
    expect(resumen.isOrphan).toBe(false);
  });

  it('detecta la fila de cabecera temporal en la hoja de ingresos', () => {
    const ingresos = dirty.sheets.find((s) => s.name === 'Ingresos')!;
    expect(ingresos.timeHeaderRow).toBe(3); // fila 4 de Excel: 2024..2028
    expect(ingresos.timeHeaderCols).toHaveLength(5);
  });

  it('preserva el string de la formula y el valor cacheado', () => {
    const ingresos = dirty.sheets.find((s) => s.name === 'Ingresos')!;
    const total = ingresos.cells.find((c) => c.ref === 'D8')!;
    expect(total.kind).toBe('formula');
    expect(total.formula).toBe('SUM(D6:D7)');
    expect(total.value).toBe(59_034); // el mismo patron del caso real de 2024
  });
});

describe('H1 — convencion de tasa', () => {
  const found = byId(dirtyFindings, 'H1');

  it('detecta la capitalizacion compuesta en el pref yield', () => {
    const compound = found.find((f) => f.sheet === 'Pref Yield');
    expect(compound).toBeDefined();
    expect(compound!.cellRefs).toContain('D4');
    expect(compound!.severity).toBe('alta');
  });

  it('cuantifica el impacto en pesos usando el saldo LP de la formula', () => {
    const compound = found.find((f) => f.sheet === 'Pref Yield')!;
    const impact = compound.quantifiedImpact!;
    // 200.000MM x (1.25% - 1.1715%) ~= 157MM en un mes
    expect(impact.delta).toBeGreaterThan(150_000_000);
    expect(impact.delta).toBeLessThan(165_000_000);
    expect(impact.after).toBeGreaterThan(impact.before);
  });

  it('detecta la composicion multiplicativa de SOFR + spread', () => {
    const multiplicative = found.find((f) => f.sheet === 'Cascada');
    expect(multiplicative).toBeDefined();
    expect(multiplicative!.title).toMatch(/multiplicativa/i);
    // (1+3.62%)(1+5%)-1 sobreestima en 3.62% x 5% = 18.1 bp
    expect(multiplicative!.quantifiedImpact!.delta).toBeCloseTo(18.1, 1);
  });

  it('no marca la convencion correcta del modelo limpio', () => {
    expect(byId(cleanResult.findings, 'H1')).toHaveLength(0);
  });
});

describe('H2 — total que omite una fila', () => {
  const found = byId(dirtyFindings, 'H2');

  it('encuentra la omision en las cinco columnas de la serie', () => {
    expect(found).toHaveLength(5);
    expect(found.every((f) => f.sheet === 'Ingresos')).toBe(true);
  });

  it('identifica cual fila quedo por fuera', () => {
    const y2024 = found.find((f) => f.cellRefs[0] === 'D8')!;
    expect(y2024.description).toContain('C1/C2/C3');
    expect(y2024.cellRefs).toContain('D5');
  });

  it('cuantifica cuanto subestima el total', () => {
    const y2024 = found.find((f) => f.cellRefs[0] === 'D8')!;
    const impact = y2024.quantifiedImpact!;
    expect(impact.before).toBe(59_034);
    expect(impact.after).toBe(86_916);
    expect(impact.delta).toBe(27_882);
    // La misma subestimacion del ~32% sobre el valor real del caso de 2024.
    expect(y2024.description).toMatch(/subestima el valor real en 32\.1%/);
  });

  it('no reporta nada cuando el total cubre todo el bloque', () => {
    expect(byId(cleanResult.findings, 'H2')).toHaveLength(0);
  });
});

describe('H3 — bloques obsoletos en cero', () => {
  it('marca la fila rotulada VIEJO como candidato de revision', () => {
    const found = byId(dirtyFindings, 'H3');
    expect(found).toHaveLength(1);
    expect(found[0].description).toContain('Management fee VIEJO');
    expect(found[0].status).toBe('needs-review');
  });
});

describe('H4 — umbrales de Calculation Date', () => {
  it('marca el umbral de 80% que no esta en el Side Letter', () => {
    const found = byId(dirtyFindings, 'H4');
    expect(found.length).toBeGreaterThanOrEqual(1);
    expect(found[0].title).toContain('80.0%');
    expect(found[0].description).toMatch(/90%, 95%, 97\.5%, 100%/);
  });

  it('acepta el 95% del modelo limpio', () => {
    expect(byId(cleanResult.findings, 'H4')).toHaveLength(0);
  });
});

describe('H5 — base de la TIR para el split de carry', () => {
  it('marca la TIR que corre sobre el portafolio total', () => {
    const found = byId(dirtyFindings, 'H5');
    expect(found).toHaveLength(1);
    expect(found[0].severity).toBe('alta');
    expect(found[0].status).toBe('needs-review');
    expect(found[0].title).toContain('alimenta decision de carry');
    expect(found[0].description).toMatch(/34\.06%.*22\.63%/);
  });
});

describe('H6 — parametro plano en serie temporal', () => {
  it('detecta el SOFR replicado en los cinco periodos', () => {
    const found = byId(dirtyFindings, 'H6');
    const sofr = found.find((f) => f.title.includes('SOFR proyectado'));
    expect(sofr).toBeDefined();
    expect(sofr!.cellRefs).toHaveLength(5);
    expect(sofr!.severity).toBe('media');
  });
});

describe('H7 — dashboard vs motor de calculo', () => {
  it('detecta el SOFR con dos valores distintos entre hojas', () => {
    const found = byId(dirtyFindings, 'H7');
    const sofr = found.find((f) => f.title.includes('SOFR'));
    expect(sofr).toBeDefined();
    // 3.82% en Supuestos vs 3.62% en Cascada = 20 bp
    expect(sofr!.quantifiedImpact!.delta).toBeCloseTo(20, 1);
    expect(sofr!.quantifiedImpact!.unit).toBe('bp');
  });
});

describe('H8 — errores de formula', () => {
  const found = byId(dirtyFindings, 'H8');

  it('separa errores de produccion de ruido de hojas huerfanas', () => {
    expect(found).toHaveLength(2);
    const produccion = found.find((f) => f.title.includes('produccion'))!;
    const ruido = found.find((f) => f.title.includes('no referenciadas'))!;
    expect(produccion.severity).toBe('alta');
    expect(ruido.severity).toBe('informativa');
  });

  it('cuenta el #DIV/0! de la cascada como error de produccion', () => {
    const produccion = found.find((f) => f.title.includes('produccion'))!;
    expect(produccion.sheet).toBe('Cascada');
    expect(produccion.evidence.join(' ')).toContain('#DIV/0!');
  });

  it('cuenta el #REF! y el #N/A de la hoja abandonada como ruido', () => {
    const ruido = found.find((f) => f.title.includes('no referenciadas'))!;
    expect(ruido.evidence.join(' ')).toContain('#REF!');
    expect(ruido.evidence.join(' ')).toContain('#N/A');
  });

  it('el modelo limpio no tiene errores', () => {
    expect(byId(cleanResult.findings, 'H8')).toHaveLength(0);
  });
});

describe('H9 — bloat de versiones', () => {
  it('cuenta hojas de produccion vs hojas abandonadas', () => {
    const found = byId(dirtyFindings, 'H9');
    expect(found).toHaveLength(1);
    expect(found[0].title).toBe('2 de 8 hojas parecen versiones abandonadas');
    expect(found[0].quantifiedImpact!.delta).toBe(-2);
  });

  it('no reporta bloat en un archivo limpio', () => {
    expect(byId(cleanResult.findings, 'H9')).toHaveLength(0);
  });
});

describe('H10 — terminologia inconsistente', () => {
  it('la distancia con transposicion trata SORF como una sola edicion', () => {
    expect(damerauLevenshtein('SOFR', 'SORF')).toBe(1);
    expect(damerauLevenshtein('CPACA', 'CPCA')).toBe(1);
  });

  it('detecta SORF y CPCA en el modelo sucio', () => {
    const titles = byId(dirtyFindings, 'H10').map((f) => f.title);
    expect(titles.some((t) => t.includes('SORF'))).toBe(true);
    expect(titles.some((t) => t.includes('CPCA'))).toBe(true);
  });

  it('no marca la grafia correcta como typo', () => {
    const titles = byId(dirtyFindings, 'H10').map((f) => f.title);
    expect(titles.some((t) => t.startsWith('Posible inconsistencia de terminologia — "SOFR"'))).toBe(
      false,
    );
  });
});

describe('H11 — inconsistencias logicas internas', () => {
  it('empareja el modo deuda activo con el tramo senior en 0%', () => {
    const found = byId(dirtyFindings, 'H11');
    expect(found.length).toBeGreaterThanOrEqual(1);
    const deuda = found.find((f) => f.title.includes('Modo deuda'))!;
    expect(deuda.cellRefs).toHaveLength(2);
    expect(deuda.status).toBe('needs-review');
  });
});

describe('H12 — lineas de costo por definir', () => {
  it('marca la comision en cero y el rubro "Otros"', () => {
    const titles = byId(dirtyFindings, 'H12').map((f) => f.title);
    expect(titles.some((t) => t.includes('Comision comercial'))).toBe(true);
    expect(titles.some((t) => t.includes('Otros'))).toBe(true);
  });

  it('no duplica el bloque obsoleto que ya reporta H3', () => {
    const titles = byId(dirtyFindings, 'H12').map((f) => f.title);
    expect(titles.some((t) => t.includes('VIEJO'))).toBe(false);
  });
});

describe('corrida completa', () => {
  it('cubre los 12 chequeos sin que ninguno falle', () => {
    const result = runAudit(dirty);
    expect(result.byCheck).toHaveLength(12);
    expect(result.byCheck.filter((c) => c.error)).toHaveLength(0);
  });

  it('ordena los hallazgos por severidad y luego por impacto', () => {
    const severities = dirtyFindings.map((f) => f.severity);
    const firstMedia = severities.indexOf('media');
    const lastAlta = severities.lastIndexOf('alta');
    if (firstMedia !== -1 && lastAlta !== -1) expect(lastAlta).toBeLessThan(firstMedia);
  });

  it('todo hallazgo trae ubicacion y texto para memo de junta', () => {
    for (const finding of dirtyFindings) {
      expect(finding.boardLanguage).toMatch(/^Oportunidad de mejora identificada:/);
      expect(finding.boardLanguage).toContain('Recomendacion:');
      expect(finding.sheet).toBeTruthy();
    }
  });

  it('nunca usa lenguaje que senale a una persona', () => {
    const prohibidas = /\b(error de nicolas|culpa|equivocacion de|negligen|descuido)\b/i;
    for (const finding of dirtyFindings) {
      expect(finding.boardLanguage).not.toMatch(prohibidas);
    }
  });

  it('el modelo limpio produce pocos falsos positivos', () => {
    const altas = cleanResult.findings.filter((f) => f.severity === 'alta');
    expect(altas).toHaveLength(0);
    expect(cleanResult.findings.length).toBeLessThanOrEqual(2);
  });
});
