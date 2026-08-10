import type { Finding, QuantifiedImpact } from '../types';

/**
 * Generador de lenguaje de junta.
 *
 * Regla de Stephanie: los hallazgos se presentan como "oportunidades de mejora
 * identificadas", nunca como errores de Nicolas. Este modulo es el unico lugar
 * donde se decide el tono, para que no se cuele lenguaje acusatorio desde los
 * detectores.
 */

const MILLION = 1e6;

export function formatMoney(value: number, unit: QuantifiedImpact['unit'] = 'COP'): string {
  if (unit === 'pct') return `${(value * 100).toFixed(2)}%`;
  if (unit === 'bp') return `${value.toFixed(1)} bp`;
  if (unit === 'unidades') return new Intl.NumberFormat('es-CO').format(Math.round(value));

  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  const symbol = unit === 'USD' ? 'USD ' : '$';
  if (abs >= MILLION) {
    return `${sign}${symbol}${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(
      abs / MILLION,
    )}MM`;
  }
  return `${sign}${symbol}${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(abs)}`;
}

export function formatImpact(impact: QuantifiedImpact): string {
  const unit = impact.unit ?? 'COP';
  return `${impact.metric}: ${formatMoney(impact.before, unit)} → ${formatMoney(
    impact.after,
    unit,
  )} (delta ${formatMoney(impact.delta, unit)})`;
}

export interface BoardTextInput {
  observation: string;
  location: string;
  suggestion: string;
  impact?: QuantifiedImpact;
}

/**
 * Arma el parrafo estandar: observacion → ubicacion → impacto → sugerencia.
 * Siempre en tono de oportunidad, siempre con la ubicacion para que sea
 * rastreable hasta la celda.
 */
export function boardParagraph(input: BoardTextInput): string {
  const parts: string[] = [];
  parts.push(`Oportunidad de mejora identificada: ${input.observation}`);
  parts.push(`Ubicacion: ${input.location}.`);
  if (input.impact) {
    parts.push(
      `Impacto cuantificado — ${formatImpact(input.impact)}${
        input.impact.basis ? ` (base de calculo: ${input.impact.basis})` : ''
      }.`,
    );
  }
  parts.push(`Recomendacion: ${input.suggestion}`);
  return parts.join(' ');
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
