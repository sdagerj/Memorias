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
  Textarea,
} from '@/components/ui/primitives';
import type { Finding, ParsedWorkbook } from '@/core/types';
import type { AuditRunResult } from '@/core/findings';
import { gpEconomics } from '@/core/finance/waterfall';
import { buildMemoHtml, buildMemoText, downloadFile, totalQuantifiedImpact } from '@/core/export/memo';
import { applyStatusOverrides, useAuditStore } from '@/store/useAuditStore';
import { cn, fmtMoney, fmtNumber } from '@/lib/utils';

/**
 * Fase 4 — vista resumen tipo memo de junta.
 *
 * Los hallazgos y su impacto salen del motor. La economia del GP por anio se
 * captura a mano aqui: extraerla automaticamente exige un mapeo por modelo que
 * varia demasiado entre vehiculos (ver PROGRESS.md).
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
  const { statusOverrides } = useAuditStore();
  const findings = useMemo(
    () => applyStatusOverrides(audit.findings, statusOverrides).filter((f) => f.status !== 'dismissed'),
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
  };
  const memoText = useMemo(() => buildMemoText(memoInput), [memoInput]);

  const byCheckData = audit.byCheck
    .filter((c) => c.count > 0)
    .map((c) => ({ name: c.id, hallazgos: c.count }));

  const impactData = findings
    .filter((f) => f.quantifiedImpact && (f.quantifiedImpact.unit ?? 'COP') === 'COP')
    .slice(0, 8)
    .map((f) => ({
      // Incluye la celda: sin ella, varios hallazgos del mismo chequeo y hoja
      // salen con la misma etiqueta y la grafica se vuelve ilegible.
      name: `${f.id} ${f.sheet}!${f.cellRefs[0] ?? ''}`,
      impacto: Math.abs(f.quantifiedImpact!.delta),
      severity: f.severity,
    }));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Hallazgos activos" value={fmtNumber(findings.length)} />
        <Stat
          label="Severidad alta"
          value={fmtNumber(findings.filter((f) => f.severity === 'alta').length)}
          tone="warn"
        />
        <Stat
          label="Por confirmar"
          value={fmtNumber(findings.filter((f) => f.status === 'needs-review').length)}
        />
        <Stat label="Impacto agregado" value={fmtMoney(totalQuantifiedImpact(findings))} tone="warn" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Hallazgos por chequeo</CardTitle>
          </CardHeader>
          <CardContent>
            {byCheckData.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Sin hallazgos.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={byCheckData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <YAxis allowDecimals={false} fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="hallazgos" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Impacto cuantificado por hallazgo</CardTitle>
            <CardDescription>Valor absoluto del delta, en COP</CardDescription>
          </CardHeader>
          <CardContent>
            {impactData.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Ningun hallazgo con impacto en COP.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={impactData} layout="vertical" margin={{ left: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    type="number"
                    fontSize={11}
                    stroke="hsl(var(--muted-foreground))"
                    tickFormatter={(v: number) => fmtMoney(v)}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={150}
                    fontSize={10}
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <Tooltip
                    formatter={(v: unknown) => fmtMoney(Number(v))}
                    contentStyle={{
                      background: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="impacto" radius={[0, 4, 4, 0]}>
                    {impactData.map((entry, i) => (
                      <Cell key={i} fill={SEVERITY_COLOR[entry.severity]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Economia del GP por anio</CardTitle>
          <CardDescription>
            Captura manual: management fee = AUM x tasa; el carry se ingresa por anio (ej. el flip de
            Coltefinanciera concentrado en 2026). Si se deja en cero, la seccion no entra al memo.
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
              Agregar anio
            </Button>
          </div>

          <Table>
            <thead>
              <tr>
                <Th>Anio</Th>
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
                      onChange={(e) => updateGpRow(setGpRows, i, { year: Number(e.target.value) })}
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
                      onChange={(e) => updateGpRow(setGpRows, i, { carry: Number(e.target.value) })}
                    />
                  </Td>
                  <Td className="text-right tabular-nums">{fmtMoney(row.aum * mfRate)}</Td>
                  <Td className="text-right font-semibold tabular-nums">
                    {fmtMoney(row.aum * mfRate + row.carry)}
                  </Td>
                  <Td>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setGpRows((rows) => rows.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>

          {hasGpData && (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={gpRowsComputed}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="year" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  formatter={(v: unknown) => fmtMoney(Number(v))}
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

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Memo de junta
          </CardTitle>
          <CardDescription>
            Todos los hallazgos activos, en el formato del memo. Los descartados no entran.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
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
            <Button onClick={() => void navigator.clipboard.writeText(memoText)}>
              <ClipboardCopy className="h-4 w-4" />
              Copiar memo
            </Button>
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
              Descargar Word
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                downloadFile(
                  memoText,
                  `Memo_${workbook.fileName.replace(/\.[^.]+$/, '')}.txt`,
                  'text/plain;charset=utf-8',
                )
              }
            >
              <Download className="h-4 w-4" />
              Descargar texto
            </Button>
          </div>
          <Textarea value={memoText} readOnly rows={20} className="cell-mono text-xs" />
        </CardContent>
      </Card>
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

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'warn' }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn('text-2xl font-semibold tabular-nums', tone === 'warn' && 'text-warn')}>
          {value}
        </p>
      </CardContent>
    </Card>
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
