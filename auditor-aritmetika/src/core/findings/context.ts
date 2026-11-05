import type {
  Finding,
  FindingId,
  ParsedCell,
  ParsedSheet,
  ParsedWorkbook,
  Severity,
} from '../types';
import { normalizeLabel } from '../parser/labels';
import { decodeAddr } from '../parser/refs';

export interface AuditConfig {
  /** Umbrales de Calculation Date soportados por Side Letter */
  cdThresholds: number[];
  /** Tasa de preferred yield esperada (EA) */
  prefRateAnnual: number;
  /**
   * Máximo de hallazgos por chequeo DESPUES de agrupar por patrón. Antes de
   * agrupar el tope es mucho mas alto: una fórmula replicada en 217 columnas
   * debe llegar entera al agrupador para que el conteo sea real.
   */
  maxPerCheck: number;
  /** Tope crudo por chequeo, antes de agrupar. Defensa contra archivos patológicos. */
  maxRawPerCheck: number;
}

export const DEFAULT_AUDIT_CONFIG: AuditConfig = {
  cdThresholds: [0.9, 0.95, 0.975, 1.0],
  prefRateAnnual: 0.15,
  maxPerCheck: 40,
  maxRawPerCheck: 5000,
};

export class AuditContext {
  readonly workbook: ParsedWorkbook;
  readonly config: AuditConfig;
  private readonly sheetIndex = new Map<string, ParsedSheet>();
  private readonly cellIndex = new Map<string, ParsedCell>();

  constructor(workbook: ParsedWorkbook, config: AuditConfig = DEFAULT_AUDIT_CONFIG) {
    this.workbook = workbook;
    this.config = config;
    for (const sheet of workbook.sheets) {
      this.sheetIndex.set(sheet.name.toLowerCase(), sheet);
      for (const cell of sheet.cells) {
        this.cellIndex.set(`${sheet.name.toLowerCase()}|${cell.row}|${cell.col}`, cell);
      }
    }
  }

  sheet(name: string): ParsedSheet | undefined {
    return this.sheetIndex.get(name.toLowerCase());
  }

  cellAt(sheetName: string, row: number, col: number): ParsedCell | undefined {
    return this.cellIndex.get(`${sheetName.toLowerCase()}|${row}|${col}`);
  }

  /** Resuelve "Hoja!B12" o "B12" (relativo a `fromSheet`) a la celda parseada. */
  resolveRef(fromSheet: string, sheetName: string | null, a1: string): ParsedCell | undefined {
    const addr = decodeAddr(a1);
    if (!addr) return undefined;
    return this.cellAt(sheetName ?? fromSheet, addr.row, addr.col);
  }

  /** Valor numérico de una celda, o null si no es numérica. */
  static numeric(cell: ParsedCell | undefined): number | null {
    if (!cell) return null;
    if (typeof cell.value === 'number' && Number.isFinite(cell.value)) return cell.value;
    if (typeof cell.value === 'string') {
      const cleaned = cell.value.replace(/[\s$,]/g, '').replace('%', '');
      const n = Number(cleaned);
      if (Number.isFinite(n) && cleaned !== '') return cell.value.includes('%') ? n / 100 : n;
    }
    return null;
  }

  /** Etiqueta de la fila a la que pertenece una celda. */
  labelForCell(cell: ParsedCell): string | null {
    const sheet = this.sheet(cell.sheet);
    return sheet?.rows.find((r) => r.row === cell.row)?.label ?? null;
  }
}

export interface FindingSeed {
  id: FindingId;
  sheet: string;
  cellRefs: string[];
  title: string;
  description: string;
  evidence?: string[];
  quantifiedImpact?: Finding['quantifiedImpact'];
  status: Finding['status'];
  severity: Severity;
  boardLanguage: string;
  boardInput?: Finding['boardInput'];
}

export function makeFinding(seed: FindingSeed, index: number): Finding {
  return {
    key: `${seed.id}-${seed.sheet}-${seed.cellRefs[0] ?? 'x'}-${index}`,
    id: seed.id,
    sheet: seed.sheet,
    cellRefs: seed.cellRefs,
    title: seed.title,
    description: seed.description,
    evidence: seed.evidence ?? [],
    quantifiedImpact: seed.quantifiedImpact,
    status: seed.status,
    severity: seed.severity,
    boardLanguage: seed.boardLanguage,
    // Sin esto el párrafo de junta queda congelado con la escala por defecto y
    // cambiar de unidades a millones no se refleja en el texto.
    boardInput: seed.boardInput,
  };
}

export function labelMatches(label: string | null, re: RegExp): boolean {
  if (!label) return false;
  return re.test(normalizeLabel(label));
}

/** Referencia legible "Hoja!B12" para mostrar en la UI y en el memo. */
export function ref(sheet: string, cellRef: string): string {
  return `${sheet}!${cellRef}`;
}
