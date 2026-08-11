/**
 * Genera modelos .xlsx sinteticos que replican a proposito los patrones H1-H12.
 *
 * No hay archivos reales de Aritmetika en el repo (son datos no publicos de un
 * family office), asi que estos fixtures son los que permiten probar el motor
 * de hallazgos de punta a punta y sirven de regresion en los tests.
 *
 *   node scripts/generate-fixtures.mjs
 */
import * as XLSX from 'xlsx';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, '..', 'fixtures');

const num = (v, z) => (z ? { t: 'n', v, z } : { t: 'n', v });
const txt = (v) => ({ t: 's', v });
const formula = (f, cached) => ({ t: 'n', v: cached, f });
const err = (code, w) => ({ t: 'e', v: code, w });

/** Construye una hoja a partir de un mapa { A1: cell }. */
function sheetFrom(cells) {
  const ws = {};
  let maxRow = 0;
  let maxCol = 0;
  for (const [addr, cell] of Object.entries(cells)) {
    if (cell === undefined || cell === null) continue;
    ws[addr] = cell;
    const { r, c } = XLSX.utils.decode_cell(addr);
    maxRow = Math.max(maxRow, r);
    maxCol = Math.max(maxCol, c);
  }
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow, c: maxCol } });
  return ws;
}

/** Reparte una serie de valores en una fila desde la columna `startCol`. */
function series(row, startCol, values, factory = num) {
  const out = {};
  values.forEach((v, i) => {
    const addr = XLSX.utils.encode_cell({ r: row - 1, c: startCol + i });
    out[addr] = factory(v);
  });
  return out;
}

// ---------------------------------------------------------------------------
// Fixture 1: modelo "sucio" — contiene los 12 patrones a proposito
// ---------------------------------------------------------------------------

const LP_BALANCE = 200_000_000_000; // 200.000MM COP
const PREF_EA = 0.15;
const SOFR_DASHBOARD = 0.0382;
const SOFR_ENGINE = 0.0362; // H7: 20 bp de diferencia silenciosa
const SPREAD = 0.05;

function buildDirtyWorkbook() {
  const wb = XLSX.utils.book_new();

  // --- Supuestos -----------------------------------------------------------
  const supuestos = sheetFrom({
    C2: txt('SUPUESTOS GENERALES'),
    C3: txt('Tasa Preferred Yield (EA)'),
    D3: num(PREF_EA, '0.00%'),
    C4: txt('Tasa de descuento (EA)'),
    D4: num(0.15, '0.00%'),
    C5: txt('Management Fee'),
    D5: num(0.05, '0.00%'),
    C6: txt('SOFR'),
    D6: num(SOFR_DASHBOARD, '0.00%'),
    C7: txt('Spread tramo senior'),
    D7: num(SPREAD, '0.00%'),
    C8: txt('Umbral de cobertura Calculation Date'),
    D8: num(0.8, '0.00%'), // H4: 80% no soportado por Side Letter
    C9: txt('Modo deuda'),
    D9: txt('SI'), // H11 con C10
    C10: txt('Tramo senior %'),
    D10: num(0, '0.00%'), // H11: dice que hay deuda pero el tramo es 0%
    C11: txt('Comision comercial de colocacion'),
    D11: num(0, '0.00%'), // H12
    C12: txt('Otros'),
    D12: num(0), // H12: rubro generico sin desglose
    C13: txt('Regimen aplicable CPCA'), // H10: deberia ser CPACA
    D13: num(304),
  });
  XLSX.utils.book_append_sheet(wb, supuestos, 'Supuestos');

  // --- Pref Yield (H1: EA compuesta donde va simple) ------------------------
  const monthlyCompounded = Math.pow(1 + PREF_EA, 1 / 12) - 1;
  const prefYield = sheetFrom({
    C2: txt('PREFERRED YIELD'),
    C3: txt('Saldo LP'),
    D3: num(LP_BALANCE),
    C4: txt('Pref Yield mensual'),
    D4: formula('D3*((1+Supuestos!D3)^(1/12)-1)', LP_BALANCE * monthlyCompounded),
    C5: txt('Pref Yield devengado 12 meses'),
    D5: formula('D4*12', LP_BALANCE * monthlyCompounded * 12),
  });
  XLSX.utils.book_append_sheet(wb, prefYield, 'Pref Yield');

  // --- Ingresos (H2: total omite C1/C2/C3; H6: SOFR plano; H3: bloque VIEJO) -
  const years = [2024, 2025, 2026, 2027, 2028];
  const c123 = [27_882, 30_100, 32_500, 35_000, 37_800];
  const c4 = [31_500, 34_200, 36_900, 39_800, 42_900];
  const c5 = [27_534, 29_600, 31_900, 34_400, 37_100];
  const totalSinC123 = c4.map((v, i) => v + c5[i]);

  const ingresos = sheetFrom({
    C2: txt('INGRESOS POR ENTIDAD ANUAL (COP MM)'),
    ...series(4, 3, years),
    C5: txt('C1/C2/C3'),
    ...series(5, 3, c123),
    C6: txt('C4'),
    ...series(6, 3, c4),
    C7: txt('C5'),
    ...series(7, 3, c5),
    C8: txt('Total ingresos'),
    // H2: el rango arranca en la fila 6 y deja C1/C2/C3 (fila 5) por fuera
    D8: formula('SUM(D6:D7)', totalSinC123[0]),
    E8: formula('SUM(E6:E7)', totalSinC123[1]),
    F8: formula('SUM(F6:F7)', totalSinC123[2]),
    G8: formula('SUM(G6:G7)', totalSinC123[3]),
    H8: formula('SUM(H6:H7)', totalSinC123[4]),
    C10: txt('SOFR proyectado'),
    ...series(10, 3, [SOFR_DASHBOARD, SOFR_DASHBOARD, SOFR_DASHBOARD, SOFR_DASHBOARD, SOFR_DASHBOARD]),
    C12: txt('Management fee VIEJO'),
    ...series(12, 3, [0, 0, 0, 0, 0]), // H3: bloque obsoleto en cero
  });
  XLSX.utils.book_append_sheet(wb, ingresos, 'Ingresos');

  // --- Flujos (base de la TIR) ---------------------------------------------
  const flujos = sheetFrom({
    C2: txt('FLUJOS DEL PORTAFOLIO'),
    C3: txt('Flujo portafolio vigente 2024'),
    D3: num(-45_000),
    C4: txt('Flujo portafolio vigente 2025'),
    D4: num(12_000),
    C5: txt('Flujo portafolio vigente 2026'),
    D5: num(18_500),
    C6: txt('Flujo portafolio vigente 2027'),
    D6: num(21_300),
    C7: txt('Flujo portafolio vigente 2028'),
    D7: num(24_800),
  });
  XLSX.utils.book_append_sheet(wb, flujos, 'Flujos');

  // --- Cascada (H1 multiplicativa, H5, H7, H8, H10) ------------------------
  const cascada = sheetFrom({
    C2: txt('CASCADA DE DISTRIBUCION'),
    C3: txt('SOFR'),
    D3: num(SOFR_ENGINE, '0.00%'), // H7: distinto del dashboard (Supuestos!D6)
    C4: txt('Spread'),
    D4: num(SPREAD, '0.00%'),
    C5: txt('Tasa total tramo senior'),
    D5: formula('(1+D3)*(1+D4)-1', (1 + SOFR_ENGINE) * (1 + SPREAD) - 1), // H1 multiplicativa
    C6: txt('TIR para split de carry'),
    D6: formula('IRR(Flujos!D3:D7)', 0.2263), // H5: base = portafolio total
    C7: txt('Split LP'),
    D7: num(0.75, '0.00%'),
    C8: txt('Split GP'),
    D8: num(0.25, '0.00%'),
    C10: txt('Tasa SORF de referencia'), // H10: typo de SOFR
    D10: num(SOFR_ENGINE, '0.00%'),
    C12: txt('Chequeo de cuadre'),
    D12: err(0x07, '#DIV/0!'), // H8 en hoja de produccion
    // H5: reparto de carry escrito a mano, en vez de derivarlo de la TIR.
    // Patron real del buyout de C4: `Carry PPF = -C50*0.75`.
    C14: txt('Residual repartible'),
    D14: num(1_000_000_000),
    C15: txt('Carry LP'),
    D15: formula('-D14*0.75', -750_000_000),
    C16: txt('Carry GP'),
    D16: formula('-D14*0.25', -250_000_000),
    // H1: descuento a valor presente con capitalizacion compuesta. Es
    // valoracion, no devengo: debe salir como candidato, no como alta.
    C18: txt('Valor presente sentencia'),
    D18: formula('D14/(1+((1+0.15)^(1/12)-1))^12', 869_565_217),
  });
  XLSX.utils.book_append_sheet(wb, cascada, 'Cascada');

  // --- Resumen (referencia a las demas: las vuelve "de produccion") --------
  const resumen = sheetFrom({
    C2: txt('RESUMEN EJECUTIVO'),
    C3: txt('Ingreso total 2024'),
    D3: formula('Ingresos!D8', totalSinC123[0]),
    C4: txt('Pref Yield devengado'),
    D4: formula("'Pref Yield'!D5", LP_BALANCE * monthlyCompounded * 12),
    C5: txt('Tasa tramo senior'),
    D5: formula('Cascada!D5', (1 + SOFR_ENGINE) * (1 + SPREAD) - 1),
    C6: txt('TIR carry'),
    D6: formula('Cascada!D6', 0.2263),
    C7: txt('Flujo 2024'),
    D7: formula('Flujos!D3', -45_000),
    C8: txt('Umbral CD'),
    D8: formula('Supuestos!D8', 0.8),
  });
  XLSX.utils.book_append_sheet(wb, resumen, 'Resumen');

  // --- Hoja abandonada (H9 + H8 ruido) -------------------------------------
  const vieja = sheetFrom({
    C2: txt('INGRESOS - VERSION ANTERIOR'),
    C3: txt('C4'),
    D3: num(31_500),
    C4: txt('Total'),
    D4: err(0x17, '#REF!'),
    C5: txt('Chequeo'),
    D5: err(0x2a, '#N/A'),
  });
  XLSX.utils.book_append_sheet(wb, vieja, 'Ingresos VIEJO');

  const backup = sheetFrom({
    C2: txt('Copia de trabajo'),
    C3: txt('Nota'),
    D3: txt('borrador de la sesion anterior'),
  });
  XLSX.utils.book_append_sheet(wb, backup, 'Cascada v2 backup');

  return wb;
}

// ---------------------------------------------------------------------------
// Fixture 2: modelo "limpio" — mismas estructuras, convenciones correctas.
// Sirve para medir falsos positivos del motor.
// ---------------------------------------------------------------------------

function buildCleanWorkbook() {
  const wb = XLSX.utils.book_new();

  const supuestos = sheetFrom({
    C2: txt('SUPUESTOS GENERALES'),
    C3: txt('Tasa Preferred Yield (EA)'),
    D3: num(PREF_EA, '0.00%'),
    C4: txt('Tasa de descuento (EA)'),
    D4: num(0.15, '0.00%'),
    C5: txt('Umbral de cobertura Calculation Date'),
    D5: num(0.95, '0.00%'),
    C6: txt('SOFR'),
    D6: num(SOFR_ENGINE, '0.00%'),
  });
  XLSX.utils.book_append_sheet(wb, supuestos, 'Supuestos');

  const monthlySimple = PREF_EA / 12;
  const prefYield = sheetFrom({
    C2: txt('PREFERRED YIELD'),
    C3: txt('Saldo LP'),
    D3: num(LP_BALANCE),
    C4: txt('Pref Yield mensual'),
    D4: formula('D3*(Supuestos!D3/12)', LP_BALANCE * monthlySimple),
  });
  XLSX.utils.book_append_sheet(wb, prefYield, 'Pref Yield');

  const years = [2024, 2025, 2026, 2027, 2028];
  const c123 = [27_882, 30_100, 32_500, 35_000, 37_800];
  const c4 = [31_500, 34_200, 36_900, 39_800, 42_900];
  const c5 = [27_534, 29_600, 31_900, 34_400, 37_100];
  const total = c4.map((v, i) => v + c5[i] + c123[i]);

  const ingresos = sheetFrom({
    C2: txt('INGRESOS POR ENTIDAD ANUAL (COP MM)'),
    ...series(4, 3, years),
    C5: txt('C1/C2/C3'),
    ...series(5, 3, c123),
    C6: txt('C4'),
    ...series(6, 3, c4),
    C7: txt('C5'),
    ...series(7, 3, c5),
    C8: txt('Total ingresos'),
    D8: formula('SUM(D5:D7)', total[0]),
    E8: formula('SUM(E5:E7)', total[1]),
    F8: formula('SUM(F5:F7)', total[2]),
    G8: formula('SUM(G5:G7)', total[3]),
    H8: formula('SUM(H5:H7)', total[4]),
  });
  XLSX.utils.book_append_sheet(wb, ingresos, 'Ingresos');

  const resumen = sheetFrom({
    C2: txt('RESUMEN EJECUTIVO'),
    C3: txt('Ingreso total 2024'),
    D3: formula('Ingresos!D8', total[0]),
    C4: txt('Pref Yield mensual'),
    D4: formula("'Pref Yield'!D4", LP_BALANCE * monthlySimple),
    C5: txt('Umbral CD'),
    D5: formula('Supuestos!D5', 0.95),
  });
  XLSX.utils.book_append_sheet(wb, resumen, 'Resumen');

  return wb;
}

function write(wb, name) {
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const path = join(OUT_DIR, name);
  writeFileSync(path, buf);
  console.log(`escrito ${path} (${buf.length} bytes)`);
}

mkdirSync(OUT_DIR, { recursive: true });
write(buildDirtyWorkbook(), 'modelo_demo_con_hallazgos.xlsx');
write(buildCleanWorkbook(), 'modelo_demo_limpio.xlsx');
