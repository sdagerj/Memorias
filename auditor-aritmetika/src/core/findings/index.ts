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
  /** 'automático' corre solo; 'candidato' requiere confirmación de negocio */
  mode: 'automatico' | 'candidato';
  summary: string;
  /**
   * Explicación sin jerga, para que un hallazgo se entienda sin abrir el
   * Excel: qué pregunta responde el chequeo y qué se arriesga si la respuesta
   * es la incorrecta.
   */
  plain: { question: string; risk: string };
  run: (ctx: AuditContext) => Finding[];
}

export const CHECKS: CheckDefinition[] = [
  {
    id: 'H1',
    name: 'Convención de tasa (pref yield / composición)',
    mode: 'automatico',
    summary:
      'Detecta tasa EA compuesta donde corresponde tasa simple, y composición multiplicativa de tasas donde corresponde aditiva.',
    plain: {
      question: '¿La tasa se liquida como manda el contrato?',
      risk: 'Una tasa anual llevada a mes con capitalización compuesta rinde menos que la tasa simple pactada. La diferencia se acumula sobre todo el saldo del LP, mes a mes.',
    },
    run: detectH1,
  },
  {
    id: 'H2',
    name: 'Totales que omiten filas',
    mode: 'automatico',
    summary: 'Compara el rango de cada fórmula de total contra el bloque de filas hermanas.',
    plain: {
      question: '¿El total suma todas las filas que debería sumar?',
      risk: 'Un total que deja una fila por fuera reporta menos ingreso del que hay. La cifra viaja al consolidado y al memo sin que nadie la vuelva a revisar.',
    },
    run: detectH2,
  },
  {
    id: 'H3',
    name: 'Bloques obsoletos en cero',
    mode: 'candidato',
    summary: 'Bloques rotulados como versión anterior que muestran cero en todos los periodos.',
    plain: {
      question: '¿Hay rubros marcados como versión anterior que quedaron en cero?',
      risk: 'Si el supuesto sigue vigente pero el bloque que lo calculaba quedó apagado, ese costo o ingreso desaparece del modelo sin dejar rastro.',
    },
    run: detectH3,
  },
  {
    id: 'H4',
    name: 'Umbrales de Calculation Date',
    mode: 'automatico',
    summary: 'Umbrales de cobertura que no coinciden con los CDs documentados del Side Letter.',
    plain: {
      question: '¿Los umbrales de cobertura son los del Side Letter?',
      risk: 'Un umbral distinto al pactado cambia la fecha en que se dispara un Calculation Date, y con ella el calendario de pagos al LP.',
    },
    run: detectH4,
  },
  {
    id: 'H5',
    name: 'Base de la TIR para split de carry',
    mode: 'candidato',
    summary:
      'Fórmulas de TIR que podrían estar corriendo sobre portafolio total en vez de pagadas.',
    plain: {
      question: '¿La TIR que decide el carry es la de las sentencias pagadas?',
      risk: 'El split de carry cambia de tier según la TIR. Si se calcula sobre el portafolio total en vez de sobre lo efectivamente pagado, el GP puede quedar en el tier equivocado.',
    },
    run: detectH5,
  },
  {
    id: 'H6',
    name: 'Parámetros planos en series temporales',
    mode: 'automatico',
    summary: 'Mismo valor digitado en todos los periodos de una serie que debería tener curva.',
    plain: {
      question: '¿Hay variables de mercado congeladas en todos los años?',
      risk: 'Una tasa digitada igual en cada periodo no es una proyección: es un supuesto oculto. Al actualizarla hay que tocar cada celda, y basta olvidar una para desalinear el modelo.',
    },
    run: detectH6,
  },
  {
    id: 'H7',
    name: 'Dashboard vs motor de cálculo',
    mode: 'candidato',
    summary: 'El mismo parámetro con valores distintos en hojas distintas.',
    plain: {
      question: '¿El mismo dato dice lo mismo en todas las hojas?',
      risk: 'Cuando el tablero de supuestos y el motor de cálculo no coinciden, lo que se presenta en junta no es lo que el modelo está usando por dentro.',
    },
    run: detectH7,
  },
  {
    id: 'H8',
    name: 'Errores de fórmula',
    mode: 'automatico',
    summary: 'Conteo de #REF!, #VALUE!, #DIV/0!, separando hojas de producción de hojas huérfanas.',
    plain: {
      question: '¿Hay fórmulas rotas?',
      risk: 'Un #REF! o un #DIV/0! en una hoja viva contamina todo lo que dependa de ella. En una hoja abandonada es solo ruido, y por eso se reportan aparte.',
    },
    run: detectH8,
  },
  {
    id: 'H9',
    name: 'Bloat de versiones abandonadas',
    mode: 'automatico',
    summary: 'Hojas no referenciadas cuyo nombre sugiere copia, prueba o respaldo.',
    plain: {
      question: '¿Cuántas hojas del archivo ya no se usan?',
      risk: 'Las copias de respaldo conviven con las hojas vivas y se parecen. El riesgo no es el peso del archivo: es abrir la versión equivocada.',
    },
    run: detectH9,
  },
  {
    id: 'H10',
    name: 'Terminología inconsistente',
    mode: 'automatico',
    summary: 'Siglas y términos que difieren en una sola edición (SOFR/SORF, CPACA/CPCA).',
    plain: {
      question: '¿Los términos se escriben siempre igual?',
      risk: 'Dos grafías del mismo concepto (SOFR y SORF) rompen búsquedas, filtros y consolidados, y hacen dudar de la cifra a quien lee el modelo por primera vez.',
    },
    run: detectH10,
  },
  {
    id: 'H11',
    name: 'Inconsistencias lógicas internas',
    mode: 'candidato',
    summary:
      'Pares de celdas relacionadas que se contradicen (ej. modo deuda con tramo senior 0%).',
    plain: {
      question: '¿Hay supuestos que se contradicen entre sí?',
      risk: 'Un interruptor encendido con su parámetro en cero significa que el modelo dice una cosa y calcula otra. Conviene confirmar cuál de las dos es la intención.',
    },
    run: detectH11,
  },
  {
    id: 'H12',
    name: 'Líneas de costo sin definir',
    mode: 'candidato',
    summary: 'Rubros genéricos o en cero que quedan como preguntas pendientes.',
    plain: {
      question: '¿Qué rubros quedaron sin definir?',
      risk: 'Una línea llamada “Otros” o una comisión en cero es una pregunta abierta. Si el rubro sí aplica, el costo está subestimado.',
    },
    run: detectH12,
  },
];

export interface AuditRunResult {
  findings: Finding[];
  /** Cuantos hallazgos aporto cada chequeo, incluso los que aportaron cero */
  byCheck: {
    id: FindingId;
    name: string;
    mode: CheckDefinition['mode'];
    count: number;
    error?: string;
  }[];
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
