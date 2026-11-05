import { useMemo, useState } from 'react';
import { Check, ChevronDown, CircleSlash, ClipboardCopy, RotateCcw } from 'lucide-react';
import { Badge, Button, Card, CardContent, Select, Tabs } from '@/components/ui/primitives';
import type { Finding, FindingId, FindingStatus } from '@/core/types';
import { CHECKS, type AuditRunResult } from '@/core/findings';
import { formatImpact, renderBoardText } from '@/core/findings/boardLanguage';
import { formatImpactValue, type MoneyFormat } from '@/core/format/money';
import { MoneyScaleBar } from '@/features/shared/MoneyScaleBar';
import { applyStatusOverrides, useAuditStore } from '@/store/useAuditStore';
import { cn } from '@/lib/utils';

/**
 * Fase 2 — motor de hallazgos.
 *
 * La lista se lee de arriba abajo como un índice: una línea por hallazgo, con
 * lo que importa a primera vista (qué pasa, dónde, cuánto vale). El detalle
 * completo — evidencia, borrador de memo, acciones — vive dentro de cada fila y
 * solo aparece cuando se abre. Antes las tres cosas se mostraban a la vez y
 * veintitantos hallazgos se volvían un muro de texto imposible de recorrer.
 */

const SEVERITY_LABEL: Record<Finding['severity'], string> = {
  alta: 'Prioridad alta',
  media: 'Prioridad media',
  informativa: 'Higiene del modelo',
};

const SEVERITY_INTRO: Record<Finding['severity'], string> = {
  alta: 'Afectan una cifra que llega al consolidado o al memo. Conviene resolverlas antes de la próxima junta.',
  media: 'No cambian una cifra hoy, pero hacen frágil el modelo frente a la próxima actualización.',
  informativa: 'Orden y limpieza del archivo. No afectan resultados.',
};

const SEVERITY_DOT: Record<Finding['severity'], string> = {
  alta: 'bg-destructive',
  media: 'bg-warn',
  informativa: 'bg-muted-foreground',
};

const STATUS_LABEL: Record<FindingStatus, string> = {
  'auto-detected': 'detectado',
  'needs-review': 'por confirmar',
  confirmed: 'confirmado',
  dismissed: 'descartado',
};

const SEVERITY_ORDER: Finding['severity'][] = ['alta', 'media', 'informativa'];

export function FindingsPanel({ audit }: { audit: AuditRunResult }) {
  const { statusOverrides, setFindingStatus, resetFindingStatus, money } = useAuditStore();
  const [filter, setFilter] = useState<'todos' | 'automaticos' | 'candidatos' | 'confirmados'>(
    'todos',
  );
  const [checkFilter, setCheckFilter] = useState<'todos' | FindingId>('todos');

  const findings = useMemo(
    () => applyStatusOverrides(audit.findings, statusOverrides),
    [audit.findings, statusOverrides],
  );

  const visible = useMemo(
    () =>
      findings.filter((f) => {
        if (checkFilter !== 'todos' && f.id !== checkFilter) return false;
        if (filter === 'automaticos') return f.status === 'auto-detected';
        if (filter === 'candidatos') return f.status === 'needs-review';
        if (filter === 'confirmados') return f.status === 'confirmed';
        return true;
      }),
    [findings, filter, checkFilter],
  );

  const counts = useMemo(
    () => ({
      automaticos: findings.filter((f) => f.status === 'auto-detected').length,
      candidatos: findings.filter((f) => f.status === 'needs-review').length,
      confirmados: findings.filter((f) => f.status === 'confirmed').length,
    }),
    [findings],
  );

  return (
    <div className="space-y-4">
      <MoneyScaleBar />

      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          value={filter}
          onChange={(v) => setFilter(v as typeof filter)}
          items={[
            { value: 'todos', label: `Todos (${findings.length})` },
            { value: 'automaticos', label: `Automáticos (${counts.automaticos})` },
            { value: 'candidatos', label: `Por confirmar (${counts.candidatos})` },
            { value: 'confirmados', label: `Confirmados (${counts.confirmados})` },
          ]}
        />
        <Select
          value={checkFilter}
          onChange={(e) => setCheckFilter(e.target.value as typeof checkFilter)}
          // En móvil ocupa el ancho disponible: si se deja dimensionar por su
          // opción mas larga, empuja la página y aparece scroll horizontal.
          className="w-full max-w-full sm:w-auto"
        >
          <option value="todos">Todos los chequeos</option>
          {CHECKS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.id} — {c.name}
            </option>
          ))}
        </Select>
      </div>

      {visible.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Sin hallazgos para este filtro.
          </CardContent>
        </Card>
      ) : (
        SEVERITY_ORDER.map((severity) => {
          const group = visible.filter((f) => f.severity === severity);
          if (group.length === 0) return null;
          return (
            <section key={severity} className="space-y-2">
              <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 pt-2">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <span className={cn('h-2.5 w-2.5 rounded-full', SEVERITY_DOT[severity])} />
                  {SEVERITY_LABEL[severity]}
                  <span className="font-normal text-muted-foreground">({group.length})</span>
                </h2>
                <p className="text-xs text-muted-foreground">{SEVERITY_INTRO[severity]}</p>
              </header>

              <Card className="divide-y overflow-hidden p-0">
                {group.map((finding) => (
                  <FindingRow
                    key={finding.key}
                    finding={finding}
                    money={money}
                    onStatus={(status) => setFindingStatus(finding.key, status)}
                    onReset={() => resetFindingStatus(finding.key)}
                    overridden={Boolean(statusOverrides[finding.key])}
                  />
                ))}
              </Card>
            </section>
          );
        })
      )}

      <ChecklistSummary audit={audit} />
    </div>
  );
}

/**
 * Cifra corta del hallazgo: la que se lee sin abrir la fila.
 *
 * Los conteos (hojas, celdas con error) no van aquí: el numero suelto no dice
 * nada que el titulo no diga ya, y ocupa el lugar de una cifra que si importa.
 */
function headlineImpact(finding: Finding, money: MoneyFormat): string | null {
  const impact = finding.quantifiedImpact;
  if (!impact || impact.unit === 'unidades') return null;
  return formatImpactValue(Math.abs(impact.delta), impact.unit ?? 'COP', money);
}

function FindingRow({
  finding,
  money,
  onStatus,
  onReset,
  overridden,
}: {
  finding: Finding;
  money: MoneyFormat;
  onStatus: (status: FindingStatus) => void;
  onReset: () => void;
  overridden: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const check = CHECKS.find((c) => c.id === finding.id);
  const boardText = renderBoardText(finding, money);
  const impact = headlineImpact(finding, money);
  const location = `${finding.sheet}${
    finding.cellRefs.length > 0 ? `!${finding.cellRefs.slice(0, 3).join(', ')}` : ''
  }${finding.cellRefs.length > 3 ? ` +${finding.cellRefs.length - 3}` : ''}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(boardText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className={cn(finding.status === 'dismissed' && 'opacity-55')}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
      >
        <ChevronDown
          className={cn(
            'mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug">{finding.title}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="cell-mono">{location}</span>
            <span aria-hidden>·</span>
            <span>{finding.id}</span>
            {(finding.occurrences ?? 1) > 1 && (
              <Badge variant="muted">se repite en {finding.occurrences} celdas</Badge>
            )}
            {finding.status === 'needs-review' ? (
              <Badge variant="outline">requiere confirmación</Badge>
            ) : (
              finding.status !== 'auto-detected' && (
                <Badge variant="secondary">{STATUS_LABEL[finding.status]}</Badge>
              )
            )}
          </p>
        </div>
        {impact && (
          <div className="shrink-0 text-right">
            <p className="text-sm font-semibold tabular-nums">{impact}</p>
            <p className="text-[11px] text-muted-foreground">de diferencia</p>
          </div>
        )}
      </button>

      {open && (
        <div className="space-y-4 border-t bg-muted/20 px-4 py-4 sm:pl-11">
          {check && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {check.plain.question}
              </h3>
              <p className="mt-1 text-sm leading-relaxed">{check.plain.risk}</p>
            </div>
          )}

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Qué encontró en este archivo
            </h3>
            <p className="mt-1 text-sm leading-relaxed">{finding.description}</p>
          </div>

          {finding.quantifiedImpact && (
            <div className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2">
              <p className="text-sm tabular-nums">
                {formatImpact(finding.quantifiedImpact, money)}
              </p>
              {finding.quantifiedImpact.basis && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Base de cálculo: {finding.quantifiedImpact.basis}
                </p>
              )}
            </div>
          )}

          {finding.evidence.length > 0 && (
            <details className="rounded-md border bg-card px-3 py-2">
              <summary className="cursor-pointer text-xs font-medium">
                Celdas y fórmulas de origen ({finding.evidence.length})
              </summary>
              <ul className="mt-2 space-y-1">
                {finding.evidence.map((item, i) => (
                  <li key={i} className="cell-mono break-all text-muted-foreground">
                    {item}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <details className="rounded-md border-l-4 border-primary bg-accent/40 px-3 py-2">
            <summary className="cursor-pointer text-xs font-semibold text-accent-foreground">
              Texto listo para el memo de junta
            </summary>
            <p className="mt-2 text-sm leading-relaxed">{boardText}</p>
          </details>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={copy}>
              <ClipboardCopy className="h-3.5 w-3.5" />
              {copied ? 'Copiado' : 'Copiar texto'}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onStatus('confirmed')}>
              <Check className="h-3.5 w-3.5" />
              Confirmar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onStatus('dismissed')}>
              <CircleSlash className="h-3.5 w-3.5" />
              Descartar
            </Button>
            {overridden && (
              <Button size="sm" variant="ghost" onClick={onReset}>
                <RotateCcw className="h-3.5 w-3.5" />
                Volver al estado automático
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ChecklistSummary({ audit }: { audit: AuditRunResult }) {
  return (
    <details className="rounded-lg border bg-card px-4 py-3">
      <summary className="cursor-pointer text-sm font-medium">
        Los doce puntos que se revisaron
      </summary>
      <ul className="mt-3 space-y-2">
        {audit.byCheck.map((check) => {
          const plain = CHECKS.find((c) => c.id === check.id)?.plain;
          return (
            <li key={check.id} className="flex items-start gap-3 text-sm">
              <Badge
                variant={check.error ? 'destructive' : check.count > 0 ? 'warn' : 'muted'}
                className="mt-0.5 shrink-0"
              >
                {check.error ? 'error' : check.count === 0 ? 'sin hallazgos' : `${check.count}`}
              </Badge>
              <div className="min-w-0">
                <p className="font-medium">{plain?.question ?? check.name}</p>
                <p className="text-xs text-muted-foreground">
                  {check.id} · {check.name}
                  {check.cells !== undefined && check.cells > check.count && (
                    <>
                      {' '}
                      · {check.cells} celdas agrupadas en {check.count}
                    </>
                  )}
                  {check.error && ` · error: ${check.error}`}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">Checklist corrido en {audit.runMs} ms.</p>
    </details>
  );
}
