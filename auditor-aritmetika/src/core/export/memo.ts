import type { Finding, ParsedWorkbook } from '../types';
import type { AuditRunResult } from '../findings';
import { CHECKS } from '../findings';
import { formatImpact, renderBoardText } from '../findings/boardLanguage';
import {
  DEFAULT_MONEY_FORMAT,
  formatAmount,
  isMoneyImpact,
  type MoneyFormat,
} from '../format/money';
import type { GpEconomicsRow } from '../finance/waterfall';

/**
 * Fase 4 — memo de junta.
 *
 * El memo se arma primero como documento estructurado (secciones y bloques) y
 * después se renderiza a texto plano, a HTML para Word o a la vista previa de
 * la app. Una sola fuente de verdad: si cambia el contenido, cambia en los tres
 * lados a la vez.
 */

export interface MemoInput {
  workbook: ParsedWorkbook;
  audit: AuditRunResult;
  findings: Finding[];
  gpEconomics?: GpEconomicsRow[];
  preparedBy?: string;
  fundName?: string;
  money?: MoneyFormat;
}

export type MemoBlock =
  | { kind: 'p'; text: string }
  | { kind: 'subheading'; text: string }
  | { kind: 'highlight'; label: string; value: string }
  | {
      kind: 'finding';
      index: number;
      id: string;
      title: string;
      meaning: string;
      paragraph: string;
      impact?: string;
      reference: string;
      status: string;
    }
  | { kind: 'table'; head: string[]; rows: string[][]; foot?: string[] };

export interface MemoSection {
  number: string;
  heading: string;
  blocks: MemoBlock[];
}

export interface MemoDocument {
  title: string;
  meta: { label: string; value: string }[];
  sections: MemoSection[];
}

const SEVERITY_TITLE: Record<Finding['severity'], string> = {
  alta: 'Prioridad alta',
  media: 'Prioridad media',
  informativa: 'Observaciones de higiene del modelo',
};

/** Suma del impacto cuantificado en dinero de los hallazgos no descartados. */
export function totalQuantifiedImpact(findings: Finding[]): number {
  return findings
    .filter((f) => f.status !== 'dismissed')
    .filter((f) => isMoneyImpact(f.quantifiedImpact))
    .reduce((acc, f) => acc + Math.abs(f.quantifiedImpact?.delta ?? 0), 0);
}

function statusLabel(status: Finding['status']): string {
  switch (status) {
    case 'confirmed':
      return 'confirmado';
    case 'needs-review':
      return 'pendiente de confirmación';
    case 'dismissed':
      return 'descartado';
    default:
      return 'detectado automáticamente';
  }
}

function reference(finding: Finding): string {
  const refs = finding.cellRefs.slice(0, 6).join(', ');
  return refs ? `${finding.sheet}!${refs}` : finding.sheet;
}

/** El memo completo como documento estructurado. */
export function buildMemoDocument(input: MemoInput): MemoDocument {
  const { workbook, audit, findings } = input;
  const money = input.money ?? DEFAULT_MONEY_FORMAT;
  const active = findings.filter((f) => f.status !== 'dismissed');

  const meta: MemoDocument['meta'] = [{ label: 'Archivo revisado', value: workbook.fileName }];
  if (input.fundName) meta.push({ label: 'Vehículo', value: input.fundName });
  meta.push({ label: 'Fecha de revisión', value: new Date().toLocaleDateString('es-CO') });
  if (input.preparedBy) meta.push({ label: 'Preparado por', value: input.preparedBy });
  meta.push({
    label: 'Cifras expresadas en',
    value: `${money.scale} de ${money.currency}`,
  });

  const sections: MemoSection[] = [];

  sections.push({
    number: '1',
    heading: 'ALCANCE',
    blocks: [
      {
        kind: 'p',
        text: `Se mapeó la estructura completa del archivo (${workbook.totals.sheets} hojas, ${workbook.totals.formulas} fórmulas y ${workbook.totals.hardcoded} valores digitados) y se corrió el checklist de revisión de doce puntos sobre convenciones de tasa, integridad de agregaciones, umbrales contractuales, base de cálculo de la TIR y consistencia interna del archivo.`,
      },
    ],
  });

  const bySeverity = {
    alta: active.filter((f) => f.severity === 'alta').length,
    media: active.filter((f) => f.severity === 'media').length,
    informativa: active.filter((f) => f.severity === 'informativa').length,
  };
  const impact = totalQuantifiedImpact(active);
  const pendientes = active.filter((f) => f.status === 'needs-review').length;

  const resumen: MemoBlock[] = [
    {
      kind: 'p',
      text: `Se identificaron ${active.length} oportunidades de mejora: ${bySeverity.alta} de prioridad alta, ${bySeverity.media} de prioridad media y ${bySeverity.informativa} de higiene del modelo.`,
    },
  ];
  if (impact > 0) {
    resumen.push({
      kind: 'highlight',
      label: 'Efecto agregado de las observaciones cuantificables',
      value: formatAmount(impact, money),
    });
  }
  if (pendientes > 0) {
    resumen.push({
      kind: 'p',
      text: `${pendientes} de estas observaciones requieren confirmación contra el Side Letter o contra la intención de diseño del modelo antes de considerarse definitivas.`,
    });
  }
  sections.push({ number: '2', heading: 'RESUMEN', blocks: resumen });

  const detalle: MemoBlock[] = [];
  let index = 1;
  for (const severity of ['alta', 'media', 'informativa'] as const) {
    const group = active.filter((f) => f.severity === severity);
    if (group.length === 0) continue;
    detalle.push({ kind: 'subheading', text: SEVERITY_TITLE[severity] });
    for (const finding of group) {
      detalle.push({
        kind: 'finding',
        index,
        id: finding.id,
        title: finding.title,
        meaning: CHECKS.find((c) => c.id === finding.id)?.plain.risk ?? '',
        paragraph: renderBoardText(finding, money),
        impact: finding.quantifiedImpact
          ? formatImpact(finding.quantifiedImpact, money)
          : undefined,
        reference: reference(finding),
        status: statusLabel(finding.status),
      });
      index++;
    }
  }
  sections.push({
    number: '3',
    heading: 'OPORTUNIDADES DE MEJORA IDENTIFICADAS',
    blocks: detalle,
  });

  if (input.gpEconomics && input.gpEconomics.length > 0) {
    const total = input.gpEconomics.reduce((a, r) => a + r.total, 0);
    sections.push({
      number: '4',
      heading: 'ECONOMÍA DEL GP POR AÑO',
      blocks: [
        {
          kind: 'table',
          head: ['Año', 'Management Fee', 'Carry', 'Total'],
          rows: input.gpEconomics.map((row) => [
            String(row.year),
            formatAmount(row.managementFee, money),
            formatAmount(row.carry, money),
            formatAmount(row.total, money),
          ]),
          foot: ['Total periodo', '', '', formatAmount(total, money)],
        },
      ],
    });
  }

  sections.push({
    number: '',
    heading: 'TRAZABILIDAD',
    blocks: [
      {
        kind: 'p',
        text: `Cada observación referencia la hoja y celda de origen del archivo revisado. El checklist corrió en ${audit.runMs} ms sobre la versión parseada el ${new Date(
          workbook.parsedAt,
        ).toLocaleString(
          'es-CO',
        )}. Los chequeos marcados como "requiere confirmación" corresponden a criterios de negocio que deben validarse contra el Side Letter del vehículo antes de su inclusión definitiva.`,
      },
    ],
  });

  // La trazabilidad siempre cierra el memo: su numero depende de si la sección
  // de GP economics entro o no, para que la numeración nunca quede con huecos.
  sections[sections.length - 1].number = String(sections.length);

  return { title: 'MEMORANDO — REVISIÓN DE MODELO FINANCIERO', meta, sections };
}

export function buildMemoText(input: MemoInput): string {
  const doc = buildMemoDocument(input);
  const lines: string[] = [doc.title, ''];

  for (const item of doc.meta) lines.push(`${item.label}: ${item.value}`);
  lines.push('');

  for (const section of doc.sections) {
    lines.push(`${section.number}. ${section.heading}`);
    lines.push('');
    for (const block of section.blocks) {
      switch (block.kind) {
        case 'p':
          lines.push(block.text, '');
          break;
        case 'subheading':
          lines.push(`${block.text}`, '');
          break;
        case 'highlight':
          lines.push(`${block.label}: ${block.value}`, '');
          break;
        case 'finding':
          lines.push(`${block.index}. [${block.id}] ${block.title}`);
          lines.push(`   ${block.paragraph}`);
          if (block.impact) lines.push(`   Impacto: ${block.impact}`);
          lines.push(`   Referencia: ${block.reference}`);
          lines.push(`   Estado: ${block.status}`);
          lines.push('');
          break;
        case 'table':
          lines.push(block.head.join(' | '));
          for (const row of block.rows) lines.push(row.join(' | '));
          if (block.foot) lines.push(block.foot.join(' | '));
          lines.push('');
          break;
      }
    }
  }

  return lines.join('\n').replace(/\n+$/, '');
}

/** Documento HTML que Word abre como .doc conservando la estructura del memo. */
export function buildMemoHtml(input: MemoInput): string {
  const doc = buildMemoDocument(input);
  const out: string[] = [`<h1>${escapeHtml(doc.title)}</h1>`];

  out.push('<table class="meta">');
  for (const item of doc.meta) {
    out.push(
      `<tr><td class="k">${escapeHtml(item.label)}</td><td>${escapeHtml(item.value)}</td></tr>`,
    );
  }
  out.push('</table>');

  for (const section of doc.sections) {
    out.push(`<h2>${escapeHtml(`${section.number}. ${section.heading}`)}</h2>`);
    for (const block of section.blocks) {
      switch (block.kind) {
        case 'p':
          out.push(`<p>${escapeHtml(block.text)}</p>`);
          break;
        case 'subheading':
          out.push(`<h3>${escapeHtml(block.text)}</h3>`);
          break;
        case 'highlight':
          out.push(
            `<p class="hl"><strong>${escapeHtml(block.label)}:</strong> ${escapeHtml(block.value)}</p>`,
          );
          break;
        case 'finding':
          out.push(
            `<p><strong>${escapeHtml(`${block.index}. [${block.id}] ${block.title}`)}</strong></p>`,
          );
          out.push(`<p>${escapeHtml(block.paragraph)}</p>`);
          if (block.impact) out.push(`<p><em>Impacto:</em> ${escapeHtml(block.impact)}</p>`);
          out.push(
            `<p class="ref">Referencia: ${escapeHtml(block.reference)} · Estado: ${escapeHtml(
              block.status,
            )}</p>`,
          );
          break;
        case 'table': {
          out.push('<table class="data"><tr>');
          for (const h of block.head) out.push(`<th>${escapeHtml(h)}</th>`);
          out.push('</tr>');
          for (const row of block.rows) {
            out.push('<tr>');
            for (const cell of row) out.push(`<td>${escapeHtml(cell)}</td>`);
            out.push('</tr>');
          }
          if (block.foot) {
            out.push('<tr>');
            for (const cell of block.foot)
              out.push(`<td><strong>${escapeHtml(cell)}</strong></td>`);
            out.push('</tr>');
          }
          out.push('</table>');
          break;
        }
      }
    }
  }

  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta charset="utf-8"><title>Memorando de revisión</title>
<style>
body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; line-height: 1.45; }
h1 { font-size: 15pt; } h2 { font-size: 12pt; margin-top: 18pt; } h3 { font-size: 11pt; }
p { margin: 0 0 8pt 0; }
p.ref { font-size: 9pt; color: #555; }
p.hl { font-size: 12pt; }
table { border-collapse: collapse; margin-bottom: 10pt; }
table.data th, table.data td { border: 1px solid #999; padding: 3pt 6pt; }
table.meta td { padding: 1pt 8pt 1pt 0; }
table.meta td.k { color: #555; }
</style></head>
<body>${out.join('\n')}</body></html>`;
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
