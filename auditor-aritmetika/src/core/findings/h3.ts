import type { Finding } from '../types';
import { AuditContext, makeFinding, ref } from './context';
import { boardFields } from './boardLanguage';
import { isObsoleteLabel } from '../parser/labels';
import { looksLikeVersionSheet } from '../parser/parseWorkbook';

/**
 * H3 — Bloques etiquetados como obsoletos ("VIEJO", "OLD", "backup") que siguen
 * en $0 pero deberían tener valor.
 *
 * Queda como candidato de revisión manual: la app no puede saber si el bloque
 * fue reemplazado por otro funcional o si simplemente se quedó sin reemplazo.
 */
export function detectH3(ctx: AuditContext): Finding[] {
  const out: Finding[] = [];

  for (const sheet of ctx.workbook.sheets) {
    for (const row of sheet.rows) {
      if (out.length >= ctx.config.maxPerCheck) return out;
      if (!isObsoleteLabel(row.label) && !looksLikeVersionSheet(row.label ?? '')) continue;

      const numericCells = row.cells.filter(
        (c) => c.ref !== row.labelRef && AuditContext.numeric(c) !== null,
      );
      if (numericCells.length < 2) continue;

      const allZero = numericCells.every((c) => AuditContext.numeric(c) === 0);
      if (!allZero) continue;

      const location = `${ref(sheet.name, row.labelRef ?? numericCells[0].ref)} (${numericCells.length} periodos)`;

      out.push(
        makeFinding(
          {
            id: 'H3',
            sheet: sheet.name,
            cellRefs: [row.labelRef ?? numericCells[0].ref, ...numericCells.map((c) => c.ref)],
            title: `Bloque marcado como obsoleto en cero — ${row.label}`,
            description: `La fila "${row.label}" esta rotulada como versión anterior/obsoleta y muestra cero en sus ${numericCells.length} periodos. Conviene confirmar si existe un bloque de reemplazo funcional o si el supuesto quedó sin reflejar (por ejemplo, un management fee declarado en la hoja de supuestos que dejó de alimentar esta línea).`,
            evidence: [
              `${ref(sheet.name, row.labelRef ?? numericCells[0].ref)} = "${row.label}"`,
              `Celdas en cero: ${numericCells.map((c) => c.ref).join(', ')}`,
            ],
            status: 'needs-review',
            severity: 'media',
            ...boardFields({
              observation:
                'existe un bloque rotulado como versión anterior que permanece en cero en todos los periodos; si el supuesto asociado sigue vigente, el rubro no estaría quedando reflejado en el consolidado.',
              location,
              suggestion:
                'confirmar si el bloque fue reemplazado por una versión activa; si no lo fue, reconectarlo con la hoja de supuestos o retirarlo del archivo para evitar lecturas ambiguas.',
            }),
          },
          out.length,
        ),
      );
    }
  }

  return out;
}
