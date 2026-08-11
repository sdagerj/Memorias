import type { Finding } from '../types';
import { AuditContext, labelMatches, makeFinding, ref } from './context';
import { boardFields } from './boardLanguage';
import { isObsoleteLabel } from '../parser/labels';

/**
 * H12 — Líneas de costo sin definir o sospechosamente en cero.
 *
 * Ej: una línea "Otros" sin desglose, o una comisión comercial en 0% cuando se
 * esperaria un fee de colocación. No son errores: son huecos de información, y
 * se reportan como preguntas pendientes, no como hallazgos confirmados.
 */

const COST_LABEL_RE =
  /(otros|otras|other|comision|comisiones|fee|fees|honorarios|gasto|gastos|costo|costos|expense|servicing|colocacion|estructuracion|administracion|legal|auditoria)/;

/** Etiquetas genericas que además no dicen de que se trata. */
const VAGUE_RE = /^(otros|otras|other|others|varios|misc|miscelaneos|no definido|pendiente)\b/;

export function detectH12(ctx: AuditContext): Finding[] {
  const out: Finding[] = [];

  for (const sheet of ctx.workbook.sheets) {
    for (const row of sheet.rows) {
      if (out.length >= ctx.config.maxPerCheck) return out;
      if (!labelMatches(row.label, COST_LABEL_RE)) continue;
      // Un bloque rotulado como obsoleto ya lo reporta H3; no lo duplicamos aquí.
      if (isObsoleteLabel(row.label)) continue;

      const dataCells = row.cells.filter(
        (c) => c.ref !== row.labelRef && AuditContext.numeric(c) !== null,
      );
      if (dataCells.length === 0) continue;

      const allZero = dataCells.every((c) => AuditContext.numeric(c) === 0);
      const isVague = labelMatches(row.label, VAGUE_RE);
      if (!allZero && !isVague) continue;

      const location = `${ref(sheet.name, row.labelRef ?? dataCells[0].ref)}`;
      const reason = allZero
        ? `la línea esta en cero en sus ${dataCells.length} periodo(s)`
        : 'la línea no tiene desglose que permita identificar su composición';

      out.push(
        makeFinding(
          {
            id: 'H12',
            sheet: sheet.name,
            cellRefs: [row.labelRef ?? dataCells[0].ref, ...dataCells.map((c) => c.ref)],
            title: `Línea de costo por definir — ${row.label}`,
            description: `La línea "${row.label}" (${location}) queda como pregunta pendiente: ${reason}. Conviene confirmar si corresponde a una decisión de diseño (el rubro efectivamente no aplica) o a información aún por incorporar.`,
            evidence: [
              `${location} = "${row.label}"`,
              `Valores: ${dataCells.map((c) => `${c.ref}=${c.value}`).join(', ')}`,
            ],
            status: 'needs-review',
            severity: 'informativa',
            ...boardFields({
              observation: `la línea "${row.label}" ${reason}, por lo que no es posible verificar si el rubro esta completo.`,
              location,
              suggestion:
                'documentar el desglose del rubro o confirmar explícitamente que no aplica para este vehículo, dejando la nota en la hoja de supuestos.',
            }),
          },
          out.length,
        ),
      );
    }
  }

  return out;
}
