import type { Finding, ParsedSheet } from '../types';
import { AuditContext, makeFinding, ref } from './context';
import { boardParagraph } from './boardLanguage';

/**
 * H8 — Errores de formula (#REF!, #VALUE!, #DIV/0!, #N/A, #NAME?).
 *
 * Matiz importante de Stephanie: si los errores estan concentrados en hojas que
 * nadie referencia, es ruido de versiones abandonadas, no un error de
 * produccion. Por eso se reportan en dos hallazgos separados.
 */

interface ErrorHit {
  sheet: string;
  ref: string;
  error: string;
  formula?: string;
}

function collectErrors(sheet: ParsedSheet): ErrorHit[] {
  const hits: ErrorHit[] = [];
  for (const cell of sheet.cells) {
    if (cell.kind === 'error') {
      hits.push({
        sheet: sheet.name,
        ref: cell.ref,
        error: String(cell.value ?? '#ERROR'),
        formula: cell.formula,
      });
    } else if (cell.formula && /#REF!/.test(cell.formula)) {
      hits.push({ sheet: sheet.name, ref: cell.ref, error: '#REF! (en la formula)', formula: cell.formula });
    }
  }
  return hits;
}

function summarize(hits: ErrorHit[]): string {
  const byType = new Map<string, number>();
  for (const hit of hits) {
    const type = hit.error.split(' ')[0];
    byType.set(type, (byType.get(type) ?? 0) + 1);
  }
  return [...byType.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `${type} x${count}`)
    .join(', ');
}

function bySheetLine(hits: ErrorHit[]): string[] {
  const bySheet = new Map<string, ErrorHit[]>();
  for (const hit of hits) {
    const list = bySheet.get(hit.sheet);
    if (list) list.push(hit);
    else bySheet.set(hit.sheet, [hit]);
  }
  return [...bySheet.entries()].map(
    ([sheet, list]) =>
      `${sheet}: ${list.length} celda(s) — ${list
        .slice(0, 8)
        .map((h) => `${h.ref} ${h.error}`)
        .join(', ')}${list.length > 8 ? ', ...' : ''}`,
  );
}

export function detectH8(ctx: AuditContext): Finding[] {
  const production: ErrorHit[] = [];
  const noise: ErrorHit[] = [];

  for (const sheet of ctx.workbook.sheets) {
    const hits = collectErrors(sheet);
    if (hits.length === 0) continue;
    // "Huerfana" para efectos de H8: nadie la referencia desde otra hoja.
    const isUnreferenced = sheet.referencedBy.length === 0;
    if (isUnreferenced) noise.push(...hits);
    else production.push(...hits);
  }

  const out: Finding[] = [];

  if (production.length > 0) {
    const sheets = [...new Set(production.map((h) => h.sheet))];
    const location = bySheetLine(production).join(' | ');
    out.push(
      makeFinding(
        {
          id: 'H8',
          sheet: sheets[0],
          cellRefs: production.slice(0, 30).map((h) => h.ref),
          title: `${production.length} error(es) de formula en hojas de produccion`,
          description: `Se encontraron ${production.length} celdas con error de formula (${summarize(
            production,
          )}) en ${sheets.length} hoja(s) que si son referenciadas por otras hojas del modelo: ${sheets.join(
            ', ',
          )}. Al estar en la cadena de calculo, estos errores pueden propagarse a las cifras del consolidado.`,
          evidence: bySheetLine(production),
          quantifiedImpact: {
            metric: 'Celdas con error en cadena de calculo',
            before: production.length,
            after: 0,
            delta: -production.length,
            unit: 'unidades',
            basis: 'conteo de celdas en estado de error en hojas referenciadas',
          },
          status: 'auto-detected',
          severity: 'alta',
          boardLanguage: boardParagraph({
            observation: `el modelo presenta ${production.length} celdas en estado de error dentro de hojas que participan en la cadena de calculo, lo que puede propagarse a las cifras consolidadas.`,
            location,
            suggestion:
              'depurar las referencias rotas y los divisores en cero de esas celdas, priorizando las que alimentan el resumen ejecutivo.',
          }),
        },
        0,
      ),
    );
  }

  if (noise.length > 0) {
    const sheets = [...new Set(noise.map((h) => h.sheet))];
    out.push(
      makeFinding(
        {
          id: 'H8',
          sheet: sheets[0],
          cellRefs: noise.slice(0, 30).map((h) => h.ref),
          title: `${noise.length} error(es) de formula en hojas no referenciadas (ruido de versiones)`,
          description: `Hay ${noise.length} celdas con error (${summarize(noise)}) en ${
            sheets.length
          } hoja(s) que ninguna otra hoja referencia: ${sheets.join(
            ', ',
          )}. Al no estar en la cadena de calculo, no afectan las cifras de produccion; se reportan como higiene del archivo, no como riesgo de cifra.`,
          evidence: bySheetLine(noise),
          status: 'auto-detected',
          severity: 'informativa',
          boardLanguage: boardParagraph({
            observation: `existen celdas en estado de error concentradas en hojas que no alimentan ningun calculo del modelo, por lo que no comprometen las cifras presentadas.`,
            location: sheets.join(', '),
            suggestion:
              'archivar o retirar esas hojas del entregable para que la version que circula a junta contenga solo hojas activas.',
          }),
        },
        1,
      ),
    );
  }

  return out;
}

/** Ubicacion legible de un error, util en tests y en la UI. */
export function errorLocation(hit: { sheet: string; ref: string }): string {
  return ref(hit.sheet, hit.ref);
}
