import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FunctionSquare, Hash, Search, Type, TriangleAlert } from 'lucide-react';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Table,
  Td,
  Th,
} from '@/components/ui/primitives';
import type { ParsedSheet, ParsedWorkbook, SheetRow } from '@/core/types';
import { cn, fmtCellValue, fmtNumber } from '@/lib/utils';

/**
 * Fase 1 — inventario navegable: hojas → filas con etiqueta detectada →
 * valor/formula, con buscador. Todo cálculo debe poder rastrearse hasta su
 * celda, asi que la formula cruda siempre esta visible.
 */

export function StructureExplorer({ workbook }: { workbook: ParsedWorkbook }) {
  const [query, setQuery] = useState('');
  const [openSheets, setOpenSheets] = useState<Set<string>>(
    () => new Set(workbook.sheets.slice(0, 1).map((s) => s.name)),
  );

  const toggle = (name: string) =>
    setOpenSheets((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const normalizedQuery = query.trim().toLowerCase();

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Hojas" value={fmtNumber(workbook.totals.sheets)} />
        <Stat label="Formulas" value={fmtNumber(workbook.totals.formulas)} />
        <Stat label="Valores digitados" value={fmtNumber(workbook.totals.hardcoded)} />
        <Stat
          label="Celdas con error"
          value={fmtNumber(workbook.totals.errors)}
          tone={workbook.totals.errors > 0 ? 'warn' : 'ok'}
        />
        <Stat
          label="Hojas huerfanas"
          value={fmtNumber(workbook.totals.orphanSheets)}
          tone={workbook.totals.orphanSheets > 0 ? 'warn' : 'ok'}
        />
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar etiqueta, referencia (D8), formula o valor…"
          className="pl-9"
        />
      </div>

      <div className="space-y-2">
        {workbook.sheets.map((sheet) => (
          <SheetAccordion
            key={sheet.name}
            sheet={sheet}
            open={openSheets.has(sheet.name) || normalizedQuery.length > 0}
            onToggle={() => toggle(sheet.name)}
            query={normalizedQuery}
          />
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Parseo completado en {workbook.parseMs} ms · {workbook.fileName} ·{' '}
        {new Date(workbook.parsedAt).toLocaleString('es-CO')}
      </p>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'warn' | 'ok' }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={cn(
            'text-2xl font-semibold tabular-nums',
            tone === 'warn' && 'text-warn',
            tone === 'ok' && 'text-ok',
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function rowMatches(row: SheetRow, query: string): boolean {
  if (!query) return true;
  if (row.label?.toLowerCase().includes(query)) return true;
  return row.cells.some(
    (c) =>
      c.ref.toLowerCase().includes(query) ||
      c.formula?.toLowerCase().includes(query) ||
      String(c.value ?? '')
        .toLowerCase()
        .includes(query),
  );
}

function SheetAccordion({
  sheet,
  open,
  onToggle,
  query,
}: {
  sheet: ParsedSheet;
  open: boolean;
  onToggle: () => void;
  query: string;
}) {
  const rows = useMemo(() => sheet.rows.filter((r) => rowMatches(r, query)), [sheet.rows, query]);
  if (query && rows.length === 0) return null;

  return (
    <Card>
      <CardHeader className="cursor-pointer select-none p-3" onClick={onToggle}>
        <div className="flex flex-wrap items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <CardTitle className="text-sm">{sheet.name}</CardTitle>
          <Badge variant="muted" title="Formulas">
            <FunctionSquare className="mr-1 h-3 w-3" />
            {sheet.counts.formulas}
          </Badge>
          <Badge variant="muted" title="Valores digitados">
            <Hash className="mr-1 h-3 w-3" />
            {sheet.counts.hardcoded}
          </Badge>
          <Badge variant="muted" title="Etiquetas">
            <Type className="mr-1 h-3 w-3" />
            {sheet.counts.labels}
          </Badge>
          {sheet.counts.errors > 0 && (
            <Badge variant="destructive">
              <TriangleAlert className="mr-1 h-3 w-3" />
              {sheet.counts.errors} error(es)
            </Badge>
          )}
          {sheet.isOrphan && <Badge variant="warn">huerfana</Badge>}
          <span className="ml-auto text-[11px] text-muted-foreground">
            {sheet.referencedBy.length > 0
              ? `Referenciada por: ${sheet.referencedBy.join(', ')}`
              : 'No referenciada por otras hojas'}
            {sheet.labelCol !== null &&
              ` · etiquetas en columna ${String.fromCharCode(65 + sheet.labelCol)}`}
          </span>
        </div>
      </CardHeader>

      {open && (
        <CardContent className="p-0">
          <Table>
            <thead>
              <tr>
                <Th className="w-16">Fila</Th>
                <Th className="w-64">Etiqueta detectada</Th>
                <Th>Celdas</Th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 300).map((row) => (
                <tr key={row.row} className="hover:bg-muted/40">
                  <Td className="cell-mono text-muted-foreground">{row.row + 1}</Td>
                  <Td className="text-xs font-medium">{row.label ?? '—'}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1.5">
                      {row.cells
                        .filter((c) => c.ref !== row.labelRef)
                        .slice(0, 24)
                        .map((cell) => (
                          <span
                            key={cell.ref}
                            title={cell.formula ? `=${cell.formula}` : undefined}
                            className={cn(
                              'cell-mono rounded border px-1.5 py-0.5',
                              cell.kind === 'formula' && 'border-primary/40 bg-primary/5',
                              cell.kind === 'hardcoded' && 'border-warn/40 bg-warn/5',
                              cell.kind === 'error' && 'border-destructive bg-destructive/10',
                              cell.kind === 'label' && 'border-border bg-muted/60',
                            )}
                          >
                            <span className="text-muted-foreground">{cell.ref}</span>{' '}
                            {cell.kind === 'formula' ? (
                              <>
                                <span className="text-primary">={cell.formula}</span>
                                <span className="text-muted-foreground">
                                  {' '}
                                  → {fmtCellValue(cell.value)}
                                </span>
                              </>
                            ) : (
                              fmtCellValue(cell.value)
                            )}
                          </span>
                        ))}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {rows.length > 300 && (
            <p className="p-3 text-[11px] text-muted-foreground">
              Mostrando 300 de {rows.length} filas. Usa el buscador para acotar.
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}
