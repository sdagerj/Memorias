import type { Finding, QuantifiedImpact } from '../types';
import { DEFAULT_MONEY_FORMAT, formatImpactValue, type MoneyFormat } from '../format/money';

/**
 * Generador de lenguaje de junta.
 *
 * Regla de Stephanie: los hallazgos se presentan como "oportunidades de mejora
 * identificadas", nunca como errores de Nicolas. Este módulo es el único lugar
 * donde se decide el tono, para que no se cuele lenguaje acusatorio desde los
 * detectores.
 *
 * El texto se guarda ademas en piezas (`boardInput`) para poder re-armarlo
 * cuando cambia la escala de las cifras, sin volver a correr el checklist.
 */

export function formatMoney(
  value: number,
  unit: QuantifiedImpact['unit'] = 'COP',
  money: MoneyFormat = DEFAULT_MONEY_FORMAT,
): string {
  return formatImpactValue(value, unit, money);
}

export function formatImpact(
  impact: QuantifiedImpact,
  money: MoneyFormat = DEFAULT_MONEY_FORMAT,
): string {
  const unit = impact.unit ?? 'COP';
  return `${impact.metric}: ${formatMoney(impact.before, unit, money)} → ${formatMoney(
    impact.after,
    unit,
    money,
  )} (diferencia ${formatMoney(impact.delta, unit, money)})`;
}

export interface BoardTextInput {
  observation: string;
  location: string;
  suggestion: string;
  impact?: QuantifiedImpact;
}

/**
 * Arma el párrafo estándar: observación → ubicación → impacto → sugerencia.
 * Siempre en tono de oportunidad, siempre con la ubicación para que sea
 * rastreable hasta la celda.
 */
export function boardParagraph(
  input: BoardTextInput,
  money: MoneyFormat = DEFAULT_MONEY_FORMAT,
): string {
  const parts: string[] = [];
  parts.push(`Oportunidad de mejora identificada: ${input.observation}`);
  parts.push(`Ubicación: ${input.location}.`);
  if (input.impact) {
    parts.push(
      `Impacto cuantificado — ${formatImpact(input.impact, money)}${
        input.impact.basis ? ` (base de cálculo: ${input.impact.basis})` : ''
      }.`,
    );
  }
  parts.push(`Recomendación: ${input.suggestion}`);
  return parts.join(' ');
}

/**
 * Campos de texto de junta listos para el objeto Finding: el párrafo ya armado
 * y las piezas que permiten re-armarlo con otra escala de cifras.
 */
export function boardFields(input: BoardTextInput): Pick<Finding, 'boardLanguage' | 'boardInput'> {
  return { boardLanguage: boardParagraph(input), boardInput: input };
}

/** Párrafo del hallazgo con la escala de cifras que eligió el usuario. */
export function renderBoardText(finding: Finding, money: MoneyFormat): string {
  if (!finding.boardInput) return finding.boardLanguage;
  return boardParagraph(finding.boardInput, money);
}

const SEVERITY_ORDER: Record<Finding['severity'], number> = {
  alta: 0,
  media: 1,
  informativa: 2,
};

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (bySeverity !== 0) return bySeverity;
    const impactA = Math.abs(a.quantifiedImpact?.delta ?? 0);
    const impactB = Math.abs(b.quantifiedImpact?.delta ?? 0);
    if (impactA !== impactB) return impactB - impactA;
    return a.id.localeCompare(b.id, undefined, { numeric: true });
  });
}
