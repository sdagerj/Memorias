import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ClipboardCopy, Download, FileText, Plus, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Table,
  Td,
  Th,
} from '@/components/ui/primitives';
import type { Finding, ParsedWorkbook } from '@/core/types';
import type { AuditRunResult } from '@/core/findings';
import { CHECKS } from '@/core/findings';
import { gpEconomics } from '@/core/finance/waterfall';
import {
  buildMemoDocument,
  buildMemoHtml,
  buildMemoText,
  downloadFile,
  totalQuantifiedImpact,
} from '@/core/export/memo';
import { formatAmount, formatAmountShort, formatImpactValue } from '@/core/format/money';
import { MoneyScaleBar } from '@/features/shared/MoneyScaleBar';
import { MemoPreview } from './MemoPreview';
import { applyStatusOverrides, useAuditStore } from '@/store/useAuditStore';
import { cn, fmtNumber } from '@/lib/utils';

/**
 * Fase 4 — vista resumen.
 *
 * Abre con una frase que se pueda leer en voz alta en junta y con los tres
 * puntos que hay que mirar primero. Las gráficas y el detalle quedan después:
 * sirven para sustentar, no para entender. La economía del GP por año se
 * captura a mano aquí — extraerla automáticamente exige un mapeo por modelo que
 * varía demasiado entre vehículos (ver PROGRESS.md).
 */

const SEVERITY_COLOR: Record<Finding['severity'], string> = {
  alta: 'hsl(var(--destructive))',
  media: 'hsl(var(--warn))',
  informativa: 'hsl(var(--muted-foreground))',
};

interface GpRowInput {
  year: number;
  aum: number;
  carry: number;
}

export function Dashboard({
  workbook,
  audit,
}: {
  workbook: ParsedWorkbook;
  audit: AuditRunResult;
}) {
  const { statusOverrides, money } = useAuditStore();
  const findings = useMemo(
    () =>
      applyStatusOverrides(audit.findings, statusOverrides).filter((f) => f.status !== 'dismissed'),
    [audit.findings, statusOverrides],
  );

  const [mfRate, setMfRate] = useState(0.05);
  const [gpRows, setGpRows] = useState<GpRowInput[]>([
    { year: 2024, aum: 0, carry: 0 },
    { year: 2025, aum: 0, carry: 0 },
    { year: 2026, aum: 0, carry: 0 },
  ]);
  const [preparedBy, setPreparedBy] = useState('');

  const gpRowsComputed = useMemo(
    () =>
      gpEconomics({
        aumByYear: gpRows.map((r) => ({ year: r.year, aum: r.aum })),
        managementFeeRate: mfRate,
        carryByYear: gpRows.map((r) => ({ year: r.year, carry: r.carry })),
      }),
    [gpRows, mfRate],
  );

  const hasGpData = gpRows.some((r) => r.aum !== 0 || r.carry !== 0);

  const memoInput = {
    workbook,
    audit,
    findings,
    gpEconomics: hasGpData ? gpRowsComputed : undefined,
    preparedBy: preparedBy.trim() || undefined,
    money,
  };
  const memoDoc = useMemo(() => buildMemoDocument(memoInput), [memoInput]);

  const altas = findings.filter((f) => f.severity === 'alta');
  const pendientes = findings.filter((f) => f.status === 'needs-review');
  const impactoTotal = totalQuantifiedImpact(findings);
  // Los conteos no compiten por el podio: sin una cifra que dimensione el
  // efecto, "2 hojas abandonadas" no es lo primero que hay que mirar.
  const top = findings
    .filter((f) => f.quantifiedImpact && f.quantifiedImpact.unit !== 'unidades')
    .slice(0, 3);

  const byCheckData = audit.byCheck
    .filter((c) => c.count > 0)
    .map((c) => ({ name: c.id, etiqueta: c.name, hallazgos: c.count }));

  const impactData = findings
    .filter((f) => f.quantifiedImpact && (f.quantifiedImpact.unit ?? 'COP') === 'COP')
    .slice(0, 8)
    .map((f) => ({
      // Incluye la celda: sin ella, varios hallazgos del mismo chequeo y hoja
      // salen con la misma etiqueta y la gráfica se vuelve ilegible.
      name: `${f.sheet}!${f.cellRefs[0] ?? ''}`,
      impacto: Math.abs(f.quantifiedImpact!.delta),
      severity: f.severity,
    }));

  return (
    <div className="space-y-4">
      <MoneyScaleBar />

      <Card>
        <CardContent className="space-y-4 p-5 sm:p-6">
          <p className="text-base leading-relaxed sm:text-lg">
            Se revisaron <strong>{fmtNumber(workbook.totals.sheets)} hojas</strong> y{' '}
            <strong>{fmtNumber(workbook.totals.formulas)} fórmulas</strong> de{' '}
            <strong>{workbook.fileName}</strong>.{' '}
            {altas.length === 0 ? (
              <>No hay puntos de prioridad alta.</>
            ) : (
              <>
                Hay{' '}
                <strong className="text-destructive">
                  {altas.length} {altas.length === 1 ? 'punto' : 'puntos'} de prioridad alta
                </strong>
                {impactoTotal > 0 && (
                  <>
                    {' '}
                    y las diferencias cuantificables suman{' '}
                    <strong>{formatAmount(impactoTotal, money)}</strong>
                  </>
                )}
                .
              </>
            )}{' '}
            {pendientes.length > 0 && (
              <>
                {pendientes.length}{' '}
                {pendientes.length === 1 ? 'observación necesita' : 'observaciones necesitan'}{' '}
                confirmarse contra el Side Letter antes de darse por definitivas.
              </>
            )}
          </p>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Oportunidades activas" value={fmtNumber(findings.length)} />
            <Stat label="Prioridad alta" value={fmtNumber(altas.length)} tone="warn" />
            <Stat label="Por confirmar" value={fmtNumber(pendientes.length)} />
            <Stat
              label="Diferencia agregada"
              value={formatAmount(impactoTotal, money)}
              tone="warn"
              small
            />
          </div>
        </CardContent>
      </Card>

      {top.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Lo primero que hay que mirar</CardTitle>
            <CardDescription>
              Ordenado por prioridad y por el tamaño de la diferencia que produce.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {top.map((finding, i) => {
              const impact = finding.quantifiedImpact!;
              return (
                <div key={finding.key} className="flex items-start gap-3 rounded-md border p-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-snug">{finding.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {CHECKS.find((c) => c.id === finding.id)?.plain.risk}
                    </p>
                    <p className="cell-mono mt-1 text-muted-foreground">
                      {finding.sheet}
                      {finding.cellRefs[0] ? `!${finding.cellRefs[0]}` : ''}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-base font-semibold tabular-nums">
                      {formatImpactValue(Math.abs(impact.delta), impact.unit ?? 'COP', money)}
                    </p>
                    <Badge variant={finding.severity === 'alta' ? 'destructive' : 'warn'}>
                      {finding.severity}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Memo de junta
          </CardTitle>
          <CardDescription>
            Todas las oportunidades activas, en el formato del memo. Las descartadas no entran.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label>Preparado por</Label>
              <Input
                value={preparedBy}
                onChange={(e) => setPreparedBy(e.target.value)}
                placeholder="Opcional"
                className="w-64"
              />
            </div>
            <Button
              variant="secondary"
              onClick={() =>
                downloadFile(
                  buildMemoHtml(memoInput),
                  `Memo_${workbook.fileName.replace(/\.[^.]+$/, '')}.doc`,
                  'application/msword',
                )
              }
            >
              <Download className="h-4 w-4" />
              Descargar para Word
            </Button>
            <Button
              variant="outline"
              onClick={() => void navigator.clipboard.writeText(buildMemoText(memoInput))}
            >
              <ClipboardCopy className="h-4 w-4" />
              Copiar como texto
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                downloadFile(
                  buildMemoText(memoInput),
                  `Memo_${workbook.fileName.replace(/\.[^.]+$/, '')}.txt`,
                  'text/plain;charset=utf-8',
                )
              }
            >
              <Download className="h-4 w-4" />
              Descargar texto
            </Button>
          </div>

          <MemoPreview doc={memoDoc} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Economía del GP por año</CardTitle>
          <CardDescription>
            Captura manual: management fee = AUM × tasa; el carry se ingresa por año (ej. el flip de
            Coltefinanciera concentrado en 2026). Las cifras se digitan en{' '}
            <strong>{money.scale}</strong>, igual que el resto del modelo. Si se deja en cero, la
            sección no entra al memo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label>Tasa de Management Fee</Label>
              <Input
                type="number"
                step="0.005"
                value={mfRate}
                onChange={(e) => setMfRate(Number(e.target.value))}
                className="w-32"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setGpRows((rows) => [
                  ...rows,
                  { year: (rows[rows.length - 1]?.year ?? 2024) + 1, aum: 0, carry: 0 },
                ])
              }
            >
              <Plus className="h-3.5 w-3.5" />
              Agregar año
            </Button>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <thead>
                <tr>
                  <Th>Año</Th>
                  <Th>AUM / capital aportado</Th>
                  <Th>Carry</Th>
                  <Th className="text-right">Management Fee</Th>
                  <Th className="text-right">Total GP</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {gpRows.map((row, i) => (
                  <tr key={i}>
                    <Td>
                      <Input
                        type="number"
                        value={row.year}
                        className="w-24"
                        onChange={(e) =>
                          updateGpRow(setGpRows, i, { year: Number(e.target.value) })
                        }
                      />
                    </Td>
                    <Td>
                      <Input
                        type="number"
                        value={row.aum}
                        onChange={(e) => updateGpRow(setGpRows, i, { aum: Number(e.target.value) })}
                      />
                    </Td>
                    <Td>
                      <Input
                        type="number"
                        value={row.carry}
                        onChange={(e) =>
                          updateGpRow(setGpRows, i, { carry: Number(e.target.value) })
                        }
                      />
                    </Td>
                    <Td className="text-right tabular-nums">
                      {formatAmount(row.aum * mfRate, money)}
                    </Td>
                    <Td className="text-right font-semibold tabular-nums">
                      {formatAmount(row.aum * mfRate + row.carry, money)}
                    </Td>
                    <Td>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Quitar el año ${row.year}`}
                        onClick={() => setGpRows((rows) => rows.filter((_, idx) => idx !== i))}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>

          {hasGpData && (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={gpRowsComputed}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="year" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <YAxis
                  fontSize={11}
                  stroke="hsl(var(--muted-foreground))"
                  tickFormatter={(v: number) => formatAmountShort(v, money)}
                />
                <Tooltip
                  formatter={(v: unknown) => formatAmount(Number(v), money)}
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar
                  dataKey="managementFee"
                  name="Management Fee"
                  stackId="gp"
                  fill="hsl(var(--primary))"
                />
                <Bar dataKey="carry" name="Carry" stackId="gp" fill="hsl(var(--warn))" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <details className="rounded-lg border bg-card px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium">Gráficas de respaldo</summary>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-medium">Cuántas oportunidades aportó cada chequeo</p>
            {byCheckData.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Sin hallazgos.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={byCheckData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <YAxis
                    allowDecimals={false}
                    fontSize={11}
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <Tooltip
                    labelFormatter={(
                      _label: unknown,
                      payload: readonly { payload?: { etiqueta?: string } }[],
                    ) => payload?.[0]?.payload?.etiqueta ?? ''}
                    contentStyle={{
                      background: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      fontSize: 12,
                    }}
                  />
                  <Bar
                    dataKey="hallazgos"
                    name="oportunidades"
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">
              Tamaño de la diferencia, por celda ({money.currency})
            </p>
            {impactData.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Ninguna oportunidad con diferencia en dinero.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={impactData} layout="vertical" margin={{ left: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    type="number"
                    fontSize={11}
                    stroke="hsl(var(--muted-foreground))"
                    tickFormatter={(v: number) => formatAmountShort(v, money)}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={150}
                    fontSize={10}
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <Tooltip
                    formatter={(v: unknown) => formatAmount(Number(v), money)}
                    contentStyle={{
                      background: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="impacto" name="diferencia" radius={[0, 4, 4, 0]}>
                    {impactData.map((entry, i) => (
                      <Cell key={i} fill={SEVERITY_COLOR[entry.severity]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}

function updateGpRow(
  setRows: React.Dispatch<React.SetStateAction<GpRowInput[]>>,
  index: number,
  patch: Partial<GpRowInput>,
) {
  setRows((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
}

function Stat({
  label,
  value,
  tone,
  small,
}: {
  label: string;
  value: string;
  tone?: 'warn';
  small?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          'font-semibold tabular-nums',
          small ? 'text-lg leading-tight' : 'text-2xl',
          tone === 'warn' && 'text-warn',
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function SeverityLegend() {
  return (
    <div className="flex gap-2">
      <Badge variant="destructive">alta</Badge>
      <Badge variant="warn">media</Badge>
      <Badge variant="muted">informativa</Badge>
    </div>
  );
}
