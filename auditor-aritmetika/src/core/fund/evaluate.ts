import type { FundConfig, ParsedCell, ParsedWorkbook } from '../types';
import { AuditContext } from '../findings/context';
import { decodeAddr, splitSheetRef } from '../parser/refs';
import { accruePreferredYield, monthlyRateCompounded, monthlyRateSimple } from '../finance/rates';
import { npvValidated, type DatedFlow, type NpvBreakdown } from '../finance/npv';
import { runWaterfall, selectCarryTier } from '../finance/waterfall';

/**
 * Fase 3 — comparacion lado a lado.
 *
 * SheetJS lee el valor que Excel dejo cacheado, pero no re-ejecuta formulas. Por
 * eso el motor reimplementa la logica de negocio en TypeScript y la contrasta
 * contra lo cacheado: LA DIFERENCIA ES EL HALLAZGO CUANTIFICADO.
 */

export interface CellReadResult {
  ok: boolean;
  value: number | null;
  location: string;
  problem?: string;
}

/** Lee "Hoja!B12" del workbook parseado. */
export function readCell(wb: ParsedWorkbook, mapping: string | undefined): CellReadResult {
  if (!mapping || mapping.trim() === '') {
    return { ok: false, value: null, location: '—', problem: 'sin mapear' };
  }
  const { sheet, ref } = splitSheetRef(mapping);
  if (!sheet) {
    return { ok: false, value: null, location: mapping, problem: 'falta el nombre de la hoja (Hoja!Celda)' };
  }
  const ctx = new AuditContext(wb);
  const cell = ctx.resolveRef(sheet, sheet, ref);
  if (!cell) return { ok: false, value: null, location: mapping, problem: 'la celda no existe o esta vacia' };
  const value = AuditContext.numeric(cell);
  if (value === null) {
    return { ok: false, value: null, location: mapping, problem: `la celda no es numerica (${cell.value})` };
  }
  return { ok: true, value, location: mapping };
}

/** Lee "Hoja!B5:B40" y devuelve las celdas en orden de fila y columna. */
export function readRange(wb: ParsedWorkbook, mapping: string | undefined): ParsedCell[] {
  if (!mapping || !mapping.includes(':')) return [];
  const { sheet, ref } = splitSheetRef(mapping);
  if (!sheet) return [];
  const [startRef, endRef] = ref.split(':');
  const start = decodeAddr(startRef);
  const end = decodeAddr(endRef);
  if (!start || !end) return [];

  const target = wb.sheets.find((s) => s.name.toLowerCase() === sheet.toLowerCase());
  if (!target) return [];

  const minRow = Math.min(start.row, end.row);
  const maxRow = Math.max(start.row, end.row);
  const minCol = Math.min(start.col, end.col);
  const maxCol = Math.max(start.col, end.col);

  return target.cells
    .filter((c) => c.row >= minRow && c.row <= maxRow && c.col >= minCol && c.col <= maxCol)
    .sort((a, b) => a.row - b.row || a.col - b.col);
}

export interface Comparison {
  metric: string;
  /** Lo que el Excel trae cacheado, si esta mapeado */
  excelCached: number | null;
  /** Lo que calcula el motor con la convencion validada */
  engine: number | null;
  delta: number | null;
  unit: 'COP' | 'pct' | 'bp';
  note: string;
}

export interface PrefYieldEvaluation {
  lpBalance: number | null;
  months: number;
  simple: number | null;
  compounded: number | null;
  conventionDelta: number | null;
  monthlyRateSimple: number;
  monthlyRateCompounded: number;
  problems: string[];
}

export interface NpvEvaluation {
  breakdown: NpvBreakdown | null;
  flows: DatedFlow[];
  problems: string[];
}

export interface CarryEvaluation {
  paidRightsIrr: number | null;
  totalPortfolioIrr: number | null;
  tierWithPaidRights: ReturnType<typeof selectCarryTier>;
  tierWithPortfolio: ReturnType<typeof selectCarryTier>;
  /** Impacto en GP de usar una base u otra sobre el residual indicado */
  gpDeltaOnResidual: number | null;
  residualUsed: number;
  problems: string[];
}

export interface FundEvaluation {
  prefYield: PrefYieldEvaluation;
  npv: NpvEvaluation;
  carry: CarryEvaluation;
  comparisons: Comparison[];
}

export interface EvaluateOptions {
  /** Meses de devengo del pref yield (default 12) */
  months?: number;
  /** Residual sobre el que se ilustra el impacto del tier de carry */
  residualForCarry?: number;
}

export function evaluateFund(
  wb: ParsedWorkbook,
  config: FundConfig,
  options: EvaluateOptions = {},
): FundEvaluation {
  const months = options.months ?? 12;
  const residual = options.residualForCarry ?? 0;

  // --- Preferred Yield ------------------------------------------------------
  const lpRead = readCell(wb, config.cellMap.lpBalance);
  const prefProblems: string[] = [];
  if (!lpRead.ok && lpRead.problem) prefProblems.push(`Saldo LP: ${lpRead.problem}`);

  const accrual =
    lpRead.value !== null
      ? accruePreferredYield(
          Array.from({ length: months }, (_, i) => ({
            period: `M${i + 1}`,
            lpBalance: lpRead.value!,
          })),
          config.prefRateAnnual,
        )
      : null;

  const prefYield: PrefYieldEvaluation = {
    lpBalance: lpRead.value,
    months,
    simple: accrual?.simple ?? null,
    compounded: accrual?.compounded ?? null,
    conventionDelta: accrual?.delta ?? null,
    monthlyRateSimple: monthlyRateSimple(config.prefRateAnnual),
    monthlyRateCompounded: monthlyRateCompounded(config.prefRateAnnual),
    problems: prefProblems,
  };

  // --- NPV ------------------------------------------------------------------
  const npvProblems: string[] = [];
  const amountCells = readRange(wb, config.cellMap.flowsRange);
  const dateCells = readRange(wb, config.cellMap.flowDatesRange);

  if (config.cellMap.flowsRange && amountCells.length === 0)
    npvProblems.push('El rango de flujos no devolvio celdas.');
  if (config.cellMap.flowDatesRange && dateCells.length === 0)
    npvProblems.push('El rango de fechas no devolvio celdas.');
  if (amountCells.length > 0 && dateCells.length > 0 && amountCells.length !== dateCells.length) {
    npvProblems.push(
      `Los rangos no tienen el mismo tamano: ${amountCells.length} flujos vs ${dateCells.length} fechas.`,
    );
  }

  const flows: DatedFlow[] = [];
  const pairs = Math.min(amountCells.length, dateCells.length);
  for (let i = 0; i < pairs; i++) {
    const amount = AuditContext.numeric(amountCells[i]);
    const date = toIsoDate(dateCells[i]);
    if (amount === null || date === null) continue;
    flows.push({ date, amount, label: `${dateCells[i].ref}/${amountCells[i].ref}` });
  }
  if (pairs > 0 && flows.length === 0)
    npvProblems.push('No fue posible interpretar ningun par (fecha, monto).');

  const npv: NpvEvaluation = {
    breakdown:
      flows.length > 0 ? npvValidated(flows, config.cutoffDate, config.discountRateAnnual) : null,
    flows,
    problems: npvProblems,
  };

  // --- Carry ----------------------------------------------------------------
  const paidRead = readCell(wb, config.cellMap.paidRightsIrr);
  const portfolioRead = readCell(wb, config.cellMap.totalPortfolioIrr);
  const carryProblems: string[] = [];
  if (!paidRead.ok && paidRead.problem) carryProblems.push(`TIR pagadas: ${paidRead.problem}`);
  if (!portfolioRead.ok && portfolioRead.problem)
    carryProblems.push(`TIR portafolio: ${portfolioRead.problem}`);

  const tierPaid = selectCarryTier(paidRead.value, config.carryTiers);
  const tierPortfolio = selectCarryTier(portfolioRead.value, config.carryTiers);

  const gpDelta =
    tierPaid && tierPortfolio && residual > 0
      ? runWaterfall({
          distributable: residual,
          lpContributedCapital: 0,
          accruedPreferredYield: 0,
          carryIrr: paidRead.value,
          tiers: config.carryTiers,
        }).gpTotal -
        runWaterfall({
          distributable: residual,
          lpContributedCapital: 0,
          accruedPreferredYield: 0,
          carryIrr: portfolioRead.value,
          tiers: config.carryTiers,
        }).gpTotal
      : null;

  const carry: CarryEvaluation = {
    paidRightsIrr: paidRead.value,
    totalPortfolioIrr: portfolioRead.value,
    tierWithPaidRights: tierPaid,
    tierWithPortfolio: tierPortfolio,
    gpDeltaOnResidual: gpDelta,
    residualUsed: residual,
    problems: carryProblems,
  };

  // --- Comparaciones lado a lado -------------------------------------------
  const cachedPref = readCell(wb, config.cellMap.cachedPrefYield);
  const cachedNpv = readCell(wb, config.cellMap.cachedNpv);

  const comparisons: Comparison[] = [
    {
      metric: `Preferred Yield devengado (${months} meses)`,
      excelCached: cachedPref.value,
      engine: prefYield.simple,
      delta: cachedPref.value !== null && prefYield.simple !== null ? prefYield.simple - cachedPref.value : null,
      unit: 'COP',
      note: 'Motor: tasa simple mensual (r/12) segun Side Letter.',
    },
    {
      metric: 'Efecto de convencion (simple − EA compuesta)',
      excelCached: prefYield.compounded,
      engine: prefYield.simple,
      delta: prefYield.conventionDelta,
      unit: 'COP',
      note: 'Cuanto cambia el devengo solo por la convencion de tasa.',
    },
    {
      metric: 'NPV con convencion validada',
      excelCached: cachedNpv.value,
      engine: npv.breakdown?.total ?? null,
      delta:
        cachedNpv.value !== null && npv.breakdown ? npv.breakdown.total - cachedNpv.value : null,
      unit: 'COP',
      note: 'Recibido sin descontar + futuro traido a valor presente.',
    },
    {
      metric: 'Carry del GP por base de TIR',
      excelCached:
        tierPortfolio && residual > 0 ? residual * tierPortfolio.gpShare : null,
      engine: tierPaid && residual > 0 ? residual * tierPaid.gpShare : null,
      delta: gpDelta,
      unit: 'COP',
      note: 'Motor: tier por TIR de sentencias pagadas. Contraste: tier por TIR de portafolio total.',
    },
  ];

  return { prefYield, npv, carry, comparisons };
}

/** Interpreta una celda como fecha ISO, aceptando serial de Excel y texto. */
export function toIsoDate(cell: ParsedCell | undefined): string | null {
  if (!cell) return null;
  if (typeof cell.value === 'string') {
    const trimmed = cell.value.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
    const parsed = Date.parse(trimmed);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString().slice(0, 10);
    return null;
  }
  if (typeof cell.value === 'number') {
    // Serial de Excel (base 1899-12-30). Solo se interpreta asi cuando el
    // formato numerico de la celda indica fecha, para no convertir un monto.
    if (!cell.numFmt || !/[ymd]/i.test(cell.numFmt)) return null;
    const ms = (cell.value - 25569) * 86_400_000;
    if (!Number.isFinite(ms)) return null;
    return new Date(ms).toISOString().slice(0, 10);
  }
  return null;
}
