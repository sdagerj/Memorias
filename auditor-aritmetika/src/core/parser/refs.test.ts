import { describe, expect, it } from 'vitest';
import {
  cellsCoveredInSheet,
  decodeAddr,
  encodeAddr,
  extractFunctions,
  extractLiteralNumbers,
  extractRanges,
  extractSheetNames,
  extractSingleRefs,
  splitSheetRef,
} from './refs';

describe('direcciones A1', () => {
  it('decodifica y recodifica', () => {
    expect(decodeAddr('B12')).toEqual({ row: 11, col: 1 });
    expect(decodeAddr('$AA$3')).toEqual({ row: 2, col: 26 });
    expect(encodeAddr({ row: 11, col: 1 })).toBe('B12');
    expect(encodeAddr({ row: 2, col: 26 })).toBe('AA3');
  });

  it('rechaza lo que no es una direccion', () => {
    expect(decodeAddr('SUM')).toBeNull();
    expect(decodeAddr('12B')).toBeNull();
  });

  it('separa hoja de referencia, incluso con comillas', () => {
    expect(splitSheetRef("'Pref Yield'!D5")).toEqual({ sheet: 'Pref Yield', ref: 'D5' });
    expect(splitSheetRef('D5')).toEqual({ sheet: null, ref: 'D5' });
  });
});

describe('diseccion de formulas', () => {
  it('extrae rangos con y sin hoja', () => {
    const ranges = extractRanges("SUM(D6:D7)+SUM('Flujos Sentencias'!B2:B10)");
    expect(ranges).toHaveLength(2);
    expect(ranges[0].sheet).toBeNull();
    expect(ranges[0].start).toEqual({ row: 5, col: 3 });
    expect(ranges[1].sheet).toBe('Flujos Sentencias');
  });

  it('no confunde extremos de rango con celdas sueltas', () => {
    const singles = extractSingleRefs('SUM(D6:D7)+E3');
    expect(singles.map((s) => s.raw)).toEqual(['E3']);
  });

  it('ignora referencias dentro de literales de texto', () => {
    expect(extractSingleRefs('IF(A1="ver B12","si","no")').map((s) => s.raw)).toEqual(['A1']);
  });

  it('lista las hojas mencionadas', () => {
    expect(extractSheetNames("Ingresos!D8+'Pref Yield'!D5")).toEqual(['Ingresos', 'Pref Yield']);
  });

  it('lista funciones y numeros literales', () => {
    expect(extractFunctions('SUM(A1:A3)+POWER(1+B1,1/12)')).toEqual(['SUM', 'POWER']);
    expect(extractLiteralNumbers('B3*((1+0.15)^(1/12)-1)')).toContain(0.15);
  });

  it('calcula las celdas cubiertas en la hoja objetivo', () => {
    const covered = cellsCoveredInSheet('SUM(D6:D7)', 'Ingresos', 'Ingresos');
    expect([...covered].sort()).toEqual(['5:3', '6:3']);
    expect(cellsCoveredInSheet('SUM(D6:D7)', 'Ingresos', 'Otra').size).toBe(0);
  });
});
