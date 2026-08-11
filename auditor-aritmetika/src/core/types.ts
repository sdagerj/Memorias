/**
 * Modelo de datos del auditor.
 *
 * Punto de partida tomado del prompt de Stephanie, extendido con lo mínimo que
 * el motor de hallazgos necesita para poder cuantificar impacto (índices por
 * fila/columna, etiquetas detectadas, y valores de error de Excel).
 */

export type CellKind = 'formula' | 'hardcoded' | 'label' | 'error' | 'empty';

export interface ParsedCell {
  /** Referencia A1 dentro de la hoja, ej. "B12" */
  ref: string;
  sheet: string;
  /** Índice de fila 0-based (fila 1 de Excel === 0) */
  row: number;
  /** Índice de columna 0-based (columna A === 0) */
  col: number;
  kind: CellKind;
  /** Valor cacheado por Excel. Para kind === 'error' es el texto del error (#REF!, ...) */
  value: string | number | boolean | null;
  /** String de la fórmula sin el "=" inicial, si kind === 'fórmula' */
  formula?: string;
  /** Texto formateado tal como Excel lo muestra (util para porcentajes) */
  formatted?: string;
  /** Formato numérico crudo (z) — permite distinguir 0.8 de "80%" */
  numFmt?: string;
}

export interface SheetRow {
  row: number;
  /** Etiqueta detectada para la fila (columna de etiquetas de la hoja) */
  label: string | null;
  /** Celda de donde salio la etiqueta */
  labelRef: string | null;
  cells: ParsedCell[];
}

export interface ParsedSheet {
  name: string;
  cells: ParsedCell[];
  /** Filas con etiqueta detectada, ordenadas por índice de fila */
  rows: SheetRow[];
  /** Columna (0-based) donde se detectaron las etiquetas de esta hoja */
  labelCol: number | null;
  /** Nombres de otras hojas que referencian esta hoja desde alguna fórmula */
  referencedBy: string[];
  /** Nombres de hojas que ESTA hoja referencia */
  references: string[];
  isOrphan: boolean;
  counts: {
    formulas: number;
    hardcoded: number;
    labels: number;
    errors: number;
    nonEmpty: number;
  };
  /** Fila (0-based) detectada como cabecera temporal (años o fechas), si existe */
  timeHeaderRow: number | null;
  /** Columnas que componen esa serie temporal */
  timeHeaderCols: number[];
}

export interface ParsedWorkbook {
  fileName: string;
  sheets: ParsedSheet[];
  parsedAt: string;
  /** Milisegundos que tomo el parseo — para documentar limites de tamanio */
  parseMs: number;
  totals: {
    sheets: number;
    formulas: number;
    hardcoded: number;
    errors: number;
    orphanSheets: number;
  };
}

export type FindingId =
  'H1' | 'H2' | 'H3' | 'H4' | 'H5' | 'H6' | 'H7' | 'H8' | 'H9' | 'H10' | 'H11' | 'H12';

export type FindingStatus = 'auto-detected' | 'needs-review' | 'confirmed' | 'dismissed';

export type Severity = 'alta' | 'media' | 'informativa';

export interface QuantifiedImpact {
  metric: string;
  before: number;
  after: number;
  delta: number;
  /** Unidad para formateo: 'COP' | 'USD' | 'pct' | 'bp' | 'unidades' */
  unit?: 'COP' | 'USD' | 'pct' | 'bp' | 'unidades';
  /** Como se cálculo — la auditabilidad manda: nada de cajas negras */
  basis?: string;
}

export interface Finding {
  /** id único de instancia (H2-Resumen-D14-0) */
  key: string;
  id: FindingId;
  sheet: string;
  cellRefs: string[];
  title: string;
  description: string;
  /** Evidencia cruda: fórmulas / valores encontrados, para poder rastrear todo */
  evidence: string[];
  quantifiedImpact?: QuantifiedImpact;
  status: FindingStatus;
  severity: Severity;
  /**
   * Celdas del mismo patrón que este hallazgo representa. Una fórmula copiada
   * a lo ancho de 217 columnas es UN hallazgo con 217 ocurrencias, no 217.
   */
  occurrences?: number;
  /** Texto en tono "oportunidad de mejora identificada", listo para memo */
  boardLanguage: string;
  /**
   * Piezas del texto anterior. Permiten re-armar el párrafo cuando cambia la
   * escala de las cifras sin volver a correr el checklist.
   */
  boardInput?: {
    observation: string;
    location: string;
    suggestion: string;
    impact?: QuantifiedImpact;
  };
}

export interface CarryTier {
  /** TIR minima (decimal) a partir de la cual aplica este tier */
  minIrr: number;
  label: string;
  lpShare: number;
  gpShare: number;
}

export interface FundConfig {
  fundName: string;
  /** ISO yyyy-mm-dd */
  cutoffDate: string;
  lpBalanceCell: string;
  prefRateAnnual: number;
  discountRateAnnual: number;
  calculationDateThresholds: number[];
  carryBaseIrr: 'paidRights' | 'totalPortfolio';
  carryTiers: CarryTier[];
  /** Mapeos celda -> concepto que Stephanie define una sola vez por fondo */
  cellMap: FundCellMap;
}

export interface FundCellMap {
  /** "Hoja!B12" con el saldo LP a la fecha de corte */
  lpBalance?: string;
  /** Rango "Hoja!B5:B40" con flujos y su rango de fechas paralelo */
  flowsRange?: string;
  flowDatesRange?: string;
  /** Celda con la TIR de sentencias pagadas que el modelo ya calcula */
  paidRightsIrr?: string;
  /** Celda con la TIR de todo el portafolio (para contrastar) */
  totalPortfolioIrr?: string;
  /** Celda con el pref yield que el Excel trae cacheado */
  cachedPrefYield?: string;
  /** Celda con el NPV que el Excel trae cacheado */
  cachedNpv?: string;
}

/**
 * Escalones de carry de C4, confirmados por Stephanie contra el Side Letter.
 *
 * La TIR que decide el escalón es la de las **sentencias pagadas a C4**, medida
 * en uno de los cuatro momentos de cálculo (90%, 95%, 97,5% y 100% de las
 * sentencias pagadas), nunca la del portafolio completo.
 *
 * No hay escalón 80/20: por debajo de 26% el reparto ya es 75/25.
 */
export const DEFAULT_CARRY_TIERS: CarryTier[] = [
  { minIrr: 0, label: 'Discounted', lpShare: 0.75, gpShare: 0.25 },
  { minIrr: 0.26, label: 'Intermedio', lpShare: 0.73, gpShare: 0.27 },
  { minIrr: 0.28, label: 'Higher Catch-Up', lpShare: 0.72, gpShare: 0.28 },
];

export const DEFAULT_FUND_CONFIG: FundConfig = {
  fundName: '',
  cutoffDate: '2026-03-31',
  lpBalanceCell: '',
  prefRateAnnual: 0.15,
  discountRateAnnual: 0.15,
  calculationDateThresholds: [0.9, 0.95, 0.975, 1.0],
  carryBaseIrr: 'paidRights',
  carryTiers: DEFAULT_CARRY_TIERS,
  cellMap: {},
};
