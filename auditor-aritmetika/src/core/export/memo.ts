import type { Finding, ParsedWorkbook } from '../types';
import type { AuditRunResult } from '../findings';
import { formatImpact, formatMoney } from '../findings/boardLanguage';
import type { GpEconomicsRow } from '../finance/waterfall';

/**
 * Fase 4 — memo de junta.
 *
 * Genera el texto en el formato que Stephanie ya usa: hallazgos agrupados por
 * severidad, cada uno con ubicacion, impacto cuantificado y el parrafo en tono
 * "oportunidad de mejora". Se exporta como texto plano (para pegar) o como .doc
 * que Word abre directamente.
 */

export interface MemoInput {
  workbook: ParsedWorkbook;
  audit: AuditRunResult;
  findings: Finding[];
  gpEconomics?: GpEconomicsRow[];
  preparedBy?: string;
  fundName?: string;
}

const SEVERITY_TITLE: Record<Finding['severity'], string> = {
  alta: 'Prioridad alta',
  media: 'Prioridad media',
  informativa: 'Observaciones de higiene del modelo',
};

/** Suma del impacto cuantificado en COP de los hallazgos no descartados. */
export function totalQuantifiedImpact(findings: Finding[]): number {
  return findings
    .filter((f) => f.status !== 'dismissed')
    .filter((f) => f.quantifiedImpact?.unit === 'COP' || f.quantifiedImpact?.unit === undefined)
    .reduce((acc, f) => acc + Math.abs(f.quantifiedImpact?.delta ?? 0), 0);
}

export function buildMemoText(input: MemoInput): string {
  const { workbook, audit, findings } = input;
  const active = findings.filter((f) => f.status !== 'dismissed');
  const lines: string[] = [];

  lines.push('MEMORANDO — REVISION DE MODELO FINANCIERO');
  lines.push('');
  lines.push(`Archivo revisado: ${workbook.fileName}`);
  if (input.fundName) lines.push(`Vehiculo: ${input.fundName}`);
  lines.push(`Fecha de revision: ${new Date().toLocaleDateString('es-CO')}`);
  if (input.preparedBy) lines.push(`Preparado por: ${input.preparedBy}`);
  lines.push('');

  lines.push('1. ALCANCE');
  lines.push('');
  lines.push(
    `Se mapeo la estructura completa del archivo (${workbook.totals.sheets} hojas, ${workbook.totals.formulas} formulas y ${workbook.totals.hardcoded} valores digitados) y se corrio el checklist de revision de doce puntos sobre convenciones de tasa, integridad de agregaciones, umbrales contractuales, base de calculo de la TIR y consistencia interna del archivo.`,
  );
  lines.push('');

  lines.push('2. RESUMEN');
  lines.push('');
  const bySeverity = {
    alta: active.filter((f) => f.severity === 'alta').length,
    media: active.filter((f) => f.severity === 'media').length,
    informativa: active.filter((f) => f.severity === 'informativa').length,
  };
  lines.push(
    `Se identificaron ${active.length} oportunidades de mejora: ${bySeverity.alta} de prioridad alta, ${bySeverity.media} de prioridad media y ${bySeverity.informativa} de higiene del modelo.`,
  );
  const impact = totalQuantifiedImpact(active);
  if (impact > 0) {
    lines.push(
      `El efecto agregado de las observaciones con impacto cuantificable asciende a ${formatMoney(
        impact,
      )} en valor absoluto.`,
    );
  }
  const pendientes = active.filter((f) => f.status === 'needs-review').length;
  if (pendientes > 0) {
    lines.push(
      `${pendientes} de estas observaciones requieren confirmacion contra el Side Letter o contra la intencion de diseno del modelo antes de considerarse definitivas.`,
    );
  }
  lines.push('');

  lines.push('3. OPORTUNIDADES DE MEJORA IDENTIFICADAS');
  lines.push('');
  let index = 1;
  for (const severity of ['alta', 'media', 'informativa'] as const) {
    const group = active.filter((f) => f.severity === severity);
    if (group.length === 0) continue;
    lines.push(`3.${severity === 'alta' ? 1 : severity === 'media' ? 2 : 3}. ${SEVERITY_TITLE[severity]}`);
    lines.push('');
    for (const finding of group) {
      lines.push(`${index}. [${finding.id}] ${finding.title}`);
      lines.push(`   ${finding.boardLanguage}`);
      if (finding.quantifiedImpact) {
        lines.push(`   Impacto: ${formatImpact(finding.quantifiedImpact)}`);
      }
      lines.push(
        `   Referencia: ${finding.sheet}${
          finding.cellRefs.length > 0 ? `!${finding.cellRefs.slice(0, 6).join(', ')}` : ''
        }`,
      );
      lines.push(`   Estado: ${statusLabel(finding.status)}`);
      lines.push('');
      index++;
    }
  }

  if (input.gpEconomics && input.gpEconomics.length > 0) {
    lines.push('4. ECONOMIA DEL GP POR ANIO');
    lines.push('');
    lines.push('Anio | Management Fee | Carry | Total');
    for (const row of input.gpEconomics) {
      lines.push(
        `${row.year} | ${formatMoney(row.managementFee)} | ${formatMoney(row.carry)} | ${formatMoney(row.total)}`,
      );
    }
    const total = input.gpEconomics.reduce((a, r) => a + r.total, 0);
    lines.push(`Total periodo | | | ${formatMoney(total)}`);
    lines.push('');
  }

  lines.push('5. TRAZABILIDAD');
  lines.push('');
  lines.push(
    `Cada observacion referencia la hoja y celda de origen del archivo revisado. El checklist corrio en ${audit.runMs} ms sobre la version parseada el ${new Date(
      workbook.parsedAt,
    ).toLocaleString('es-CO')}. Los chequeos marcados como "requiere confirmacion" corresponden a criterios de negocio que deben validarse contra el Side Letter del vehiculo antes de su inclusion definitiva.`,
  );

  return lines.join('\n');
}

function statusLabel(status: Finding['status']): string {
  switch (status) {
    case 'confirmed':
      return 'confirmado';
    case 'needs-review':
      return 'pendiente de confirmacion';
    case 'dismissed':
      return 'descartado';
    default:
      return 'detectado automaticamente';
  }
}

/** Documento HTML que Word abre como .doc conservando la estructura del memo. */
export function buildMemoHtml(input: MemoInput): string {
  const text = buildMemoText(input);
  const body = text
    .split('\n')
    .map((line) => {
      if (line.trim() === '') return '<p>&nbsp;</p>';
      if (/^\d\.\s[A-ZÁÉÍÓÚÑ]/.test(line)) return `<h2>${escapeHtml(line)}</h2>`;
      if (/^MEMORANDO/.test(line)) return `<h1>${escapeHtml(line)}</h1>`;
      if (/^\d+\.\s\[H\d+\]/.test(line)) return `<p><strong>${escapeHtml(line)}</strong></p>`;
      return `<p>${escapeHtml(line)}</p>`;
    })
    .join('\n');

  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta charset="utf-8"><title>Memorando de revision</title>
<style>
body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; line-height: 1.4; }
h1 { font-size: 15pt; } h2 { font-size: 12pt; margin-top: 16pt; }
p { margin: 0 0 6pt 0; }
</style></head>
<body>${body}</body></html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Dispara la descarga de un archivo generado en el navegador. */
export function downloadFile(content: string, fileName: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
