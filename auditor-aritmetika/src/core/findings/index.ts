import type { Finding, FindingId, ParsedWorkbook } from '../types';
import { AuditContext, DEFAULT_AUDIT_CONFIG, type AuditConfig } from './context';
import { sortFindings } from './boardLanguage';
import { detectH1 } from './h1';
import { detectH2 } from './h2';
import { detectH3 } from './h3';
import { detectH4 } from './h4';
import { detectH5 } from './h5';
import { detectH6 } from './h6';
import { detectH7 } from './h7';
import { detectH8 } from './h8';
import { detectH9 } from './h9';
import { detectH10 } from './h10';
import { detectH11 } from './h11';
import { detectH12 } from './h12';

export { AuditContext, DEFAULT_AUDIT_CONFIG } from './context';
export type { AuditConfig } from './context';

export interface CheckDefinition {
  id: FindingId;
  name: string;
  /** 'automatico' corre solo; 'candidato' requiere confirmacion de negocio */
  mode: 'automatico' | 'candidato';
  summary: string;
  run: (ctx: AuditContext) => Finding[];
}

export const CHECKS: CheckDefinition[] = [
  {
    id: 'H1',
    name: 'Convencion de tasa (pref yield / composicion)',
    mode: 'automatico',
    summary:
      'Detecta tasa EA compuesta donde corresponde tasa simple, y composicion multiplicativa de tasas donde corresponde aditiva.',
    run: detectH1,
  },
  {
    id: 'H2',
    name: 'Totales que omiten filas',
    mode: 'automatico',
    summary: 'Compara el rango de cada formula de total contra el bloque de filas hermanas.',
    run: detectH2,
  },
  {
    id: 'H3',
    name: 'Bloques obsoletos en cero',
    mode: 'candidato',
    summary: 'Bloques rotulados como version anterior que muestran cero en todos los periodos.',
    run: detectH3,
  },
  {
    id: 'H4',
    name: 'Umbrales de Calculation Date',
    mode: 'automatico',
    summary: 'Umbrales de cobertura que no coinciden con los CDs documentados del Side Letter.',
    run: detectH4,
  },
  {
    id: 'H5',
    name: 'Base de la TIR para split de carry',
    mode: 'candidato',
    summary: 'Formulas de TIR que podrian estar corriendo sobre portafolio total en vez de pagadas.',
    run: detectH5,
  },
  {
    id: 'H6',
    name: 'Parametros planos en series temporales',
    mode: 'automatico',
    summary: 'Mismo valor digitado en todos los periodos de una serie que deberia tener curva.',
    run: detectH6,
  },
  {
    id: 'H7',
    name: 'Dashboard vs motor de calculo',
    mode: 'candidato',
    summary: 'El mismo parametro con valores distintos en hojas distintas.',
    run: detectH7,
  },
  {
    id: 'H8',
    name: 'Errores de formula',
    mode: 'automatico',
    summary: 'Conteo de #REF!, #VALUE!, #DIV/0!, separando hojas de produccion de hojas huerfanas.',
    run: detectH8,
  },
  {
    id: 'H9',
    name: 'Bloat de versiones abandonadas',
    mode: 'automatico',
    summary: 'Hojas no referenciadas cuyo nombre sugiere copia, prueba o respaldo.',
    run: detectH9,
  },
  {
    id: 'H10',
    name: 'Terminologia inconsistente',
    mode: 'automatico',
    summary: 'Siglas y terminos que difieren en una sola edicion (SOFR/SORF, CPACA/CPCA).',
    run: detectH10,
  },
  {
    id: 'H11',
    name: 'Inconsistencias logicas internas',
    mode: 'candidato',
    summary: 'Pares de celdas relacionadas que se contradicen (ej. modo deuda con tramo senior 0%).',
    run: detectH11,
  },
  {
    id: 'H12',
    name: 'Lineas de costo sin definir',
    mode: 'candidato',
    summary: 'Rubros genericos o en cero que quedan como preguntas pendientes.',
    run: detectH12,
  },
];

export interface AuditRunResult {
  findings: Finding[];
  /** Cuantos hallazgos aporto cada chequeo, incluso los que aportaron cero */
  byCheck: { id: FindingId; name: string; mode: CheckDefinition['mode']; count: number; error?: string }[];
  runMs: number;
}

/**
 * Corre todo el checklist sobre un workbook parseado.
 *
 * Un detector que falle no tumba la corrida completa: se reporta el error en
 * `byCheck` y los demas siguen. Auditar un archivo raro no puede dejar a
 * Stephanie sin ningun hallazgo.
 */
export function runAudit(
  workbook: ParsedWorkbook,
  config: AuditConfig = DEFAULT_AUDIT_CONFIG,
): AuditRunResult {
  const t0 = Date.now();
  const ctx = new AuditContext(workbook, config);
  const findings: Finding[] = [];
  const byCheck: AuditRunResult['byCheck'] = [];

  for (const check of CHECKS) {
    try {
      const result = check.run(ctx);
      findings.push(...result);
      byCheck.push({ id: check.id, name: check.name, mode: check.mode, count: result.length });
    } catch (err) {
      byCheck.push({
        id: check.id,
        name: check.name,
        mode: check.mode,
        count: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { findings: sortFindings(findings), byCheck, runMs: Date.now() - t0 };
}
