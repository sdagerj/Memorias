import type { Finding } from '../types';
import { AuditContext, labelMatches, makeFinding, ref } from './context';
import { boardFields } from './boardLanguage';

/**
 * H4 — Calculation Dates / umbrales de cobertura que no estan en el Side Letter.
 *
 * Los Side Letters definen típicamente cinco CDs en umbrales de 90%, 95%, 97.5%
 * y 100%. Los modelos a veces usan un 80% genérico que no esta soportado. Ojo:
 * los umbrales varían por fondo — esto se marca para verificar contra el Side
 * Letter de ESE fondo, no se "corrige" automáticamente.
 */

const CD_CONTEXT_RE =
  /(cobertura|coverage|calculation date|fecha de calculo|fechas de calculo|\bcd\b|cd\d|umbral|threshold|trigger)/;

const TOLERANCE = 1e-6;

function isCoverageLike(value: number): boolean {
  return value > 0.5 && value <= 1.5;
}

export function detectH4(ctx: AuditContext): Finding[] {
  const out: Finding[] = [];
  const allowed = ctx.config.cdThresholds;

  for (const sheet of ctx.workbook.sheets) {
    for (const row of sheet.rows) {
      if (!labelMatches(row.label, CD_CONTEXT_RE)) continue;

      for (const cell of row.cells) {
        if (out.length >= ctx.config.maxPerCheck) return out;
        if (cell.kind !== 'hardcoded' && cell.kind !== 'formula') continue;

        let value = AuditContext.numeric(cell);
        if (value === null) continue;
        // Un 80 escrito como entero con formato de porcentaje sigue siendo 80%.
        if (value > 1.5 && value <= 100) value = value / 100;
        if (!isCoverageLike(value)) continue;

        const matches = allowed.some((t) => Math.abs(t - value!) < TOLERANCE);
        if (matches) continue;

        const location = ref(sheet.name, cell.ref);
        const allowedTxt = allowed
          .map((t) => `${(t * 100).toFixed(t === 0.975 ? 1 : 0)}%`)
          .join(', ');

        out.push(
          makeFinding(
            {
              id: 'H4',
              sheet: sheet.name,
              cellRefs: [cell.ref],
              title: `Umbral de cobertura fuera de los CDs documentados — ${(value * 100).toFixed(1)}%`,
              description: `La fila "${row.label}" usa un umbral de ${(value * 100).toFixed(
                1,
              )}% en ${location}. Los umbrales de Calculation Date documentados son ${allowedTxt}. Verificar contra el Side Letter de este fondo específico antes de concluir — los umbrales pueden diferir por fondo.`,
              evidence: [
                `${location} = ${cell.formula ? `${cell.formula} → ${cell.value}` : cell.value}`,
                `Umbrales configurados en el auditor: ${allowedTxt}`,
              ],
              status: 'auto-detected',
              severity: 'media',
              ...boardFields({
                observation: `el modelo activa una fecha de cálculo en un umbral de cobertura de ${(
                  value * 100
                ).toFixed(1)}%, que no coincide con los umbrales documentados (${allowedTxt}).`,
                location,
                suggestion:
                  'contrastar el umbral con el Side Letter del fondo y, si difiere, alinear el modelo o documentar en el archivo la clausula que soporta ese umbral.',
              }),
            },
            out.length,
          ),
        );
      }
    }
  }

  return out;
}
