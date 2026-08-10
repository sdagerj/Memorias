import type { Finding, ParsedSheet } from '../types';
import { AuditContext, makeFinding } from './context';
import { boardParagraph } from './boardLanguage';
import { looksLikeVersionSheet } from '../parser/parseWorkbook';

/**
 * H9 — Bloat de versiones abandonadas dentro del mismo archivo.
 *
 * Cuenta hojas de produccion reales vs. ruido. Una hoja es candidata a bloat si
 * ninguna otra hoja la referencia Y su nombre sugiere version/prueba/backup.
 * Tambien se listan (con menor severidad) las hojas no referenciadas cuyo nombre
 * no delata nada: pueden ser hojas de entrada legitimas.
 */

interface SheetVerdict {
  sheet: ParsedSheet;
  bloat: boolean;
  unreferencedOnly: boolean;
}

function classify(sheet: ParsedSheet): SheetVerdict {
  const unreferenced = sheet.referencedBy.length === 0;
  const versionish = looksLikeVersionSheet(sheet.name);
  return {
    sheet,
    bloat: unreferenced && versionish,
    unreferencedOnly: unreferenced && !versionish,
  };
}

export function detectH9(ctx: AuditContext): Finding[] {
  const verdicts = ctx.workbook.sheets.map(classify);
  const bloat = verdicts.filter((v) => v.bloat);
  if (bloat.length === 0) return [];

  const total = ctx.workbook.sheets.length;
  const production = total - bloat.length;
  const names = bloat.map((v) => v.sheet.name);
  const detail = bloat.map(
    (v) =>
      `${v.sheet.name}: ${v.sheet.counts.formulas} formulas, ${v.sheet.counts.hardcoded} valores digitados, ${v.sheet.counts.errors} errores — no referenciada por ninguna otra hoja`,
  );

  const impact = {
    metric: 'Hojas del archivo',
    before: total,
    after: production,
    delta: -bloat.length,
    unit: 'unidades' as const,
    basis: 'hojas no referenciadas cuyo nombre sugiere version, prueba o respaldo',
  };

  return [
    makeFinding(
      {
        id: 'H9',
        sheet: bloat[0].sheet.name,
        cellRefs: [],
        title: `${bloat.length} de ${total} hojas parecen versiones abandonadas`,
        description: `El archivo tiene ${total} hojas, de las cuales ${production} participan en la cadena de calculo y ${
          bloat.length
        } aparentan ser versiones o pruebas sin uso: ${names.join(
          ', ',
        )}. Ninguna de estas es referenciada por otra hoja, y su nombre sugiere copia, prueba o respaldo.`,
        evidence: detail,
        quantifiedImpact: impact,
        status: 'auto-detected',
        severity: 'informativa',
        boardLanguage: boardParagraph({
          observation: `el archivo conserva ${bloat.length} hojas de versiones o pruebas anteriores que no alimentan ningun calculo, lo que dificulta identificar rapidamente cual es la version vigente.`,
          location: names.join(', '),
          suggestion:
            'consolidar el entregable en una version limpia con solo las hojas activas y mantener las versiones historicas en archivos aparte con fecha en el nombre.',
          impact,
        }),
      },
      0,
    ),
  ];
}
