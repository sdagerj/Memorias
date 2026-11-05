import { describe, expect, it } from 'vitest';
import { groupFindings } from './group';
import type { Finding, QuantifiedImpact } from '../types';

/**
 * El agrupador es lo que hace usable un modelo real: el archivo Marco producía
 * 837 hallazgos de los cuales ~27 eran distintos, porque la misma fórmula está
 * copiada a lo ancho de 217 columnas mensuales.
 */

function finding(over: Partial<Finding> & { cellRefs: string[]; title: string }): Finding {
  return {
    key: `k-${over.cellRefs[0]}`,
    id: 'H1',
    sheet: 'Nota Marco',
    description: 'descripción base.',
    evidence: [`${over.cellRefs[0]} = fórmula`],
    status: 'auto-detected',
    severity: 'alta',
    boardLanguage: 'texto',
    ...over,
  } as Finding;
}

function money(delta: number): QuantifiedImpact {
  return { metric: 'Total — 2024', before: 0, after: delta, delta, unit: 'COP' };
}

describe('agrupación por patrón de fila', () => {
  it('colapsa la misma fórmula replicada a lo ancho de la serie', () => {
    const cols = ['L', 'M', 'N', 'O', 'P'];
    const grouped = groupFindings(
      cols.map((c) => finding({ cellRefs: [`${c}144`], title: 'Composición multiplicativa' })),
    );
    expect(grouped).toHaveLength(1);
    expect(grouped[0].occurrences).toBe(5);
    expect(grouped[0].cellRefs).toHaveLength(5);
    expect(grouped[0].description).toMatch(/5 celdas de la fila 144/);
  });

  it('colapsa también la fórmula copiada hacia abajo por una columna', () => {
    // El buyout de C4 replica el descuento de cada sentencia en 35 filas de la
    // columna O: misma decisión de modelo, distinta dirección de copiado.
    const grouped = groupFindings(
      ['O5', 'O6', 'O7', 'O8'].map((r) => finding({ cellRefs: [r], title: 'Tasa compuesta' })),
    );
    expect(grouped).toHaveLength(1);
    expect(grouped[0].occurrences).toBe(4);
    expect(grouped[0].description).toMatch(/4 celdas de la columna O/);
  });

  it('separa patrones distintos aunque compartan hoja y chequeo', () => {
    const grouped = groupFindings([
      finding({ cellRefs: ['L144'], title: 'Composición multiplicativa' }),
      finding({ cellRefs: ['L145'], title: 'Capitalización compuesta' }),
    ]);
    expect(grouped).toHaveLength(2);
  });

  it('no mezcla hojas distintas', () => {
    const grouped = groupFindings([
      finding({ cellRefs: ['L144'], title: 'X' }),
      finding({ cellRefs: ['L144'], title: 'X', sheet: 'Otra hoja' }),
    ]);
    expect(grouped).toHaveLength(2);
  });

  it('convierte los años que varían en un rango dentro del título', () => {
    const grouped = groupFindings([
      finding({ cellRefs: ['D8'], title: '"Total" de 2024 no suma una fila' }),
      finding({ cellRefs: ['E8'], title: '"Total" de 2025 no suma una fila' }),
      finding({ cellRefs: ['F8'], title: '"Total" de 2028 no suma una fila' }),
    ]);
    expect(grouped[0].title).toBe('"Total" de 2024–2028 no suma una fila');
  });

  it('suma el dinero de todas las celdas del grupo', () => {
    const grouped = groupFindings([
      finding({ cellRefs: ['D8'], title: 'T de 2024', quantifiedImpact: money(100) }),
      finding({ cellRefs: ['E8'], title: 'T de 2025', quantifiedImpact: money(200) }),
    ]);
    expect(grouped[0].quantifiedImpact!.delta).toBe(300);
    expect(grouped[0].quantifiedImpact!.basis).toMatch(/2 celdas/);
  });

  it('no suma las tasas: repite la misma desviación en cada celda', () => {
    const bp = (delta: number): QuantifiedImpact => ({
      metric: 'Tasa',
      before: 0,
      after: delta,
      delta,
      unit: 'bp',
    });
    const grouped = groupFindings([
      finding({ cellRefs: ['L144'], title: 'Tasa', quantifiedImpact: bp(10.9) }),
      finding({ cellRefs: ['M144'], title: 'Tasa', quantifiedImpact: bp(10.9) }),
      finding({ cellRefs: ['N144'], title: 'Tasa', quantifiedImpact: bp(12.0) }),
    ]);
    // 32.8 bp seria absurdo: es la misma tasa, no una acumulación.
    expect(grouped[0].quantifiedImpact!.delta).toBe(12.0);
    expect(grouped[0].quantifiedImpact!.unit).toBe('bp');
  });

  it('marca con una sola ocurrencia lo que no se repite', () => {
    const grouped = groupFindings([finding({ cellRefs: ['F275'], title: 'Fórmula rota' })]);
    expect(grouped[0].occurrences).toBe(1);
  });

  it('rehace el texto de junta con la ubicación y el impacto del grupo', () => {
    const grouped = groupFindings([
      finding({
        cellRefs: ['D8'],
        title: 'T de 2024',
        quantifiedImpact: money(100),
        boardInput: { observation: 'algo pasa', location: 'Hoja!D8', suggestion: 'arreglarlo' },
      }),
      finding({
        cellRefs: ['E8'],
        title: 'T de 2025',
        quantifiedImpact: money(200),
        boardInput: { observation: 'algo pasa', location: 'Hoja!E8', suggestion: 'arreglarlo' },
      }),
    ]);
    // Con pocas celdas se listan; con muchas se resume como rango.
    expect(grouped[0].boardInput!.location).toBe('Nota Marco!D8, E8');
    expect(grouped[0].boardLanguage).toMatch(/Oportunidad de mejora identificada/);
    expect(grouped[0].boardLanguage).toContain('300');
  });
});
