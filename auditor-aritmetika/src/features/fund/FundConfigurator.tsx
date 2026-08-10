import { useMemo, useState } from 'react';
import { Save, Trash2, TriangleAlert } from 'lucide-react';
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
  Select,
  Table,
  Td,
  Th,
} from '@/components/ui/primitives';
import type { FundConfig, ParsedWorkbook } from '@/core/types';
import { evaluateFund } from '@/core/fund/evaluate';
import { activeFundConfig, useAuditStore } from '@/store/useAuditStore';
import { cn, fmtMoney, fmtPct } from '@/lib/utils';

/**
 * Fase 3 — configurador de fondo + calculadora GP economics / NPV.
 *
 * El mapeo de celdas se hace UNA vez por fondo y queda guardado: la proxima
 * version del mismo modelo se audita sin volver a mapear. Ningun parametro esta
 * hardcodeado — todos son editables aqui.
 */

const CELL_FIELDS: { key: keyof FundConfig['cellMap']; label: string; hint: string }[] = [
  { key: 'lpBalance', label: 'Saldo LP', hint: 'Hoja!D3 — saldo sobre el que corre el pref' },
  { key: 'cachedPrefYield', label: 'Pref Yield del Excel', hint: 'Hoja!D5 — valor cacheado a contrastar' },
  { key: 'flowsRange', label: 'Rango de flujos', hint: 'Hoja!D3:D30' },
  { key: 'flowDatesRange', label: 'Rango de fechas', hint: 'Hoja!C3:C30 — mismo tamano que los flujos' },
  { key: 'cachedNpv', label: 'NPV del Excel', hint: 'Hoja!D40 — valor cacheado a contrastar' },
  { key: 'paidRightsIrr', label: 'TIR sentencias pagadas', hint: 'Hoja!D6 — la base correcta' },
  { key: 'totalPortfolioIrr', label: 'TIR portafolio total', hint: 'Hoja!D7 — solo para contraste' },
];

export function FundConfigurator({ workbook }: { workbook: ParsedWorkbook }) {
  const store = useAuditStore();
  const saved = activeFundConfig(store);
  const [draft, setDraft] = useState<FundConfig>(saved);
  const [months, setMonths] = useState(12);
  const [residual, setResidual] = useState(0);

  const evaluation = useMemo(
    () => evaluateFund(workbook, draft, { months, residualForCarry: residual }),
    [workbook, draft, months, residual],
  );

  const patch = (p: Partial<FundConfig>) => setDraft((d) => ({ ...d, ...p }));
  const patchCell = (key: keyof FundConfig['cellMap'], value: string) =>
    setDraft((d) => ({ ...d, cellMap: { ...d.cellMap, [key]: value } }));

  const savedNames = Object.keys(store.fundConfigs);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Configuracion del fondo</CardTitle>
          <CardDescription>
            Los parametros son editables y nunca se hardcodean en el calculo. El mapeo se guarda por
            nombre de fondo y se reutiliza con la proxima version del modelo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
            <Field label="Nombre del fondo">
              <Input value={draft.fundName} onChange={(e) => patch({ fundName: e.target.value })} />
            </Field>
            <Field label="Fecha de corte">
              <Input
                type="date"
                value={draft.cutoffDate}
                onChange={(e) => patch({ cutoffDate: e.target.value })}
              />
            </Field>
            <Field label="Tasa Preferred Yield (EA)">
              <Input
                type="number"
                step="0.0025"
                value={draft.prefRateAnnual}
                onChange={(e) => patch({ prefRateAnnual: Number(e.target.value) })}
              />
            </Field>
            <Field label="Tasa de descuento (EA)">
              <Input
                type="number"
                step="0.0025"
                value={draft.discountRateAnnual}
                onChange={(e) => patch({ discountRateAnnual: Number(e.target.value) })}
              />
            </Field>
            <Field label="Umbrales de Calculation Date">
              <Input
                value={draft.calculationDateThresholds.join(', ')}
                onChange={(e) =>
                  patch({
                    calculationDateThresholds: e.target.value
                      .split(',')
                      .map((t) => Number(t.trim()))
                      .filter((n) => Number.isFinite(n)),
                  })
                }
              />
            </Field>
            <Field label="Base de TIR para el carry">
              <Select
                value={draft.carryBaseIrr}
                onChange={(e) =>
                  patch({ carryBaseIrr: e.target.value as FundConfig['carryBaseIrr'] })
                }
              >
                <option value="paidRights">Sentencias pagadas (validada)</option>
                <option value="totalPortfolio">Portafolio total (contraste)</option>
              </Select>
            </Field>
            <Field label="Meses de devengo del pref">
              <Input
                type="number"
                min={1}
                value={months}
                onChange={(e) => setMonths(Math.max(1, Number(e.target.value)))}
              />
            </Field>
            <Field label="Residual para ilustrar el carry">
              <Input
                type="number"
                value={residual}
                onChange={(e) => setResidual(Number(e.target.value))}
              />
            </Field>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold">Tiers de carry (por TIR)</p>
            <div className="space-y-2">
              {draft.carryTiers.map((tier, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-4">
                  <Input
                    value={tier.label}
                    onChange={(e) => updateTier(setDraft, i, { label: e.target.value })}
                  />
                  <Input
                    type="number"
                    step="0.01"
                    value={tier.minIrr}
                    onChange={(e) => updateTier(setDraft, i, { minIrr: Number(e.target.value) })}
                  />
                  <Input
                    type="number"
                    step="0.01"
                    value={tier.lpShare}
                    onChange={(e) => updateTier(setDraft, i, { lpShare: Number(e.target.value) })}
                  />
                  <Input
                    type="number"
                    step="0.01"
                    value={tier.gpShare}
                    onChange={(e) => updateTier(setDraft, i, { gpShare: Number(e.target.value) })}
                  />
                </div>
              ))}
              <p className="text-[11px] text-muted-foreground">
                Columnas: etiqueta · TIR minima · share LP · share GP. Los defaults (75/25 y 72/28)
                salen del caso de C4 y deben validarse contra el Side Letter de cada fondo.
              </p>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold">Mapeo de celdas</p>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {CELL_FIELDS.map((field) => (
                <Field key={field.key} label={field.label} hint={field.hint}>
                  <Input
                    value={draft.cellMap[field.key] ?? ''}
                    placeholder={field.hint.split(' — ')[0]}
                    onChange={(e) => patchCell(field.key, e.target.value)}
                  />
                </Field>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => store.upsertFundConfig(draft)} disabled={!draft.fundName.trim()}>
              <Save className="h-4 w-4" />
              Guardar mapeo de "{draft.fundName || 'sin nombre'}"
            </Button>
            {savedNames.length > 0 && (
              <>
                <Label>Cargar guardado</Label>
                <Select
                  className="w-auto"
                  value={store.activeFundName ?? ''}
                  onChange={(e) => {
                    const name = e.target.value;
                    store.setActiveFund(name || null);
                    if (name && store.fundConfigs[name]) setDraft(store.fundConfigs[name]);
                  }}
                >
                  <option value="">—</option>
                  {savedNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </Select>
                {store.activeFundName && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => store.deleteFundConfig(store.activeFundName!)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Borrar
                  </Button>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <ComparisonTable evaluation={evaluation} />
      <EngineDetail evaluation={evaluation} config={draft} />
    </div>
  );
}

function updateTier(
  setDraft: React.Dispatch<React.SetStateAction<FundConfig>>,
  index: number,
  patch: Partial<FundConfig['carryTiers'][number]>,
) {
  setDraft((d) => ({
    ...d,
    carryTiers: d.carryTiers.map((t, i) => (i === index ? { ...t, ...patch } : t)),
  }));
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ComparisonTable({ evaluation }: { evaluation: ReturnType<typeof evaluateFund> }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Excel cacheado vs. motor con la convencion validada</CardTitle>
        <CardDescription>
          SheetJS lee el ultimo valor que Excel guardo, pero no re-ejecuta formulas. La diferencia
          entre esa cifra y la del motor es el hallazgo cuantificado.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <thead>
            <tr>
              <Th>Metrica</Th>
              <Th className="text-right">Excel / contraste</Th>
              <Th className="text-right">Motor (convencion validada)</Th>
              <Th className="text-right">Diferencia</Th>
              <Th>Nota</Th>
            </tr>
          </thead>
          <tbody>
            {evaluation.comparisons.map((row) => (
              <tr key={row.metric}>
                <Td className="text-xs font-medium">{row.metric}</Td>
                <Td className="text-right tabular-nums">{fmtMoney(row.excelCached)}</Td>
                <Td className="text-right tabular-nums">{fmtMoney(row.engine)}</Td>
                <Td
                  className={cn(
                    'text-right font-semibold tabular-nums',
                    row.delta !== null && row.delta > 0 && 'text-ok',
                    row.delta !== null && row.delta < 0 && 'text-destructive',
                  )}
                >
                  {fmtMoney(row.delta)}
                </Td>
                <Td className="text-[11px] text-muted-foreground">{row.note}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </CardContent>
    </Card>
  );
}

function EngineDetail({
  evaluation,
  config,
}: {
  evaluation: ReturnType<typeof evaluateFund>;
  config: FundConfig;
}) {
  const { prefYield, npv, carry } = evaluation;
  const problems = [...prefYield.problems, ...npv.problems, ...carry.problems];

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Preferred Yield</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <Line label="Saldo LP" value={fmtMoney(prefYield.lpBalance)} />
          <Line label="Tasa mensual simple" value={fmtPct(prefYield.monthlyRateSimple, 3)} />
          <Line
            label="Tasa mensual EA compuesta"
            value={fmtPct(prefYield.monthlyRateCompounded, 3)}
          />
          <Line label={`Devengado simple (${prefYield.months}m)`} value={fmtMoney(prefYield.simple)} />
          <Line label="Devengado EA compuesta" value={fmtMoney(prefYield.compounded)} />
          <Line
            label="Diferencia por convencion"
            value={fmtMoney(prefYield.conventionDelta)}
            strong
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>NPV — corte {config.cutoffDate}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <Line label="Flujos leidos" value={String(npv.flows.length)} />
          <Line
            label="Recibido (sin descontar)"
            value={fmtMoney(npv.breakdown?.receivedUndiscounted ?? null)}
          />
          <Line label="Futuro nominal" value={fmtMoney(npv.breakdown?.futureNominal ?? null)} />
          <Line
            label={`Futuro a VP (${fmtPct(config.discountRateAnnual)})`}
            value={fmtMoney(npv.breakdown?.futureDiscounted ?? null)}
          />
          <Line label="NPV total" value={fmtMoney(npv.breakdown?.total ?? null)} strong />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Split de carry</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <Line label="TIR sentencias pagadas" value={fmtPct(carry.paidRightsIrr)} />
          <Line label="TIR portafolio total" value={fmtPct(carry.totalPortfolioIrr)} />
          <Line
            label="Tier con base validada"
            value={
              carry.tierWithPaidRights
                ? `${carry.tierWithPaidRights.label} (${fmtPct(carry.tierWithPaidRights.lpShare, 0)}/${fmtPct(carry.tierWithPaidRights.gpShare, 0)})`
                : '—'
            }
          />
          <Line
            label="Tier con portafolio total"
            value={
              carry.tierWithPortfolio
                ? `${carry.tierWithPortfolio.label} (${fmtPct(carry.tierWithPortfolio.lpShare, 0)}/${fmtPct(carry.tierWithPortfolio.gpShare, 0)})`
                : '—'
            }
          />
          <Line label="Impacto en GP" value={fmtMoney(carry.gpDeltaOnResidual)} strong />
        </CardContent>
      </Card>

      {problems.length > 0 && (
        <Card className="lg:col-span-3 border-warn/50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <TriangleAlert className="h-4 w-4 text-warn" />
              Mapeos pendientes
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 pt-0">
            {problems.map((p, i) => (
              <Badge key={i} variant="warn">
                {p}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-dashed py-1 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn('tabular-nums', strong && 'font-semibold')}>{value}</span>
    </div>
  );
}
