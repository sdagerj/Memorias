import { useMemo, useState } from 'react';
import { Check, ClipboardCopy, CircleSlash, RotateCcw } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Select,
  Tabs,
} from '@/components/ui/primitives';
import type { Finding, FindingId, FindingStatus } from '@/core/types';
import { CHECKS, type AuditRunResult } from '@/core/findings';
import { formatImpact } from '@/core/findings/boardLanguage';
import { applyStatusOverrides, useAuditStore } from '@/store/useAuditStore';
import { cn } from '@/lib/utils';

/**
 * Fase 2 — motor de hallazgos.
 *
 * Cada hallazgo muestra: que se encontro, donde (hoja!celda), el impacto
 * cuantificado si aplica, y el borrador en tono "oportunidad de mejora" listo
 * para copiar al memo.
 */

const SEVERITY_BADGE: Record<Finding['severity'], 'destructive' | 'warn' | 'muted'> = {
  alta: 'destructive',
  media: 'warn',
  informativa: 'muted',
};

const STATUS_LABEL: Record<FindingStatus, string> = {
  'auto-detected': 'detectado',
  'needs-review': 'pendiente de confirmar',
  confirmed: 'confirmado',
  dismissed: 'descartado',
};

export function FindingsPanel({ audit }: { audit: AuditRunResult }) {
  const { statusOverrides, setFindingStatus, resetFindingStatus } = useAuditStore();
  const [filter, setFilter] = useState<'todos' | 'automaticos' | 'candidatos' | 'confirmados'>('todos');
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
      alta: findings.filter((f) => f.severity === 'alta' && f.status !== 'dismissed').length,
      cuantificados: findings.filter((f) => f.quantifiedImpact).length,
      candidatos: findings.filter((f) => f.status === 'needs-review').length,
    }),
    [findings],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          value={filter}
          onChange={(v) => setFilter(v as typeof filter)}
          items={[
            { value: 'todos', label: `Todos (${findings.length})` },
            { value: 'automaticos', label: 'Automaticos' },
            { value: 'candidatos', label: `Por confirmar (${counts.candidatos})` },
            { value: 'confirmados', label: 'Confirmados' },
          ]}
        />
        <Select
          value={checkFilter}
          onChange={(e) => setCheckFilter(e.target.value as typeof checkFilter)}
          // En movil ocupa el ancho disponible: si se deja dimensionar por su
          // opcion mas larga, empuja la pagina y aparece scroll horizontal.
          className="w-full max-w-full sm:w-auto"
        >
          <option value="todos">Todos los chequeos</option>
          {CHECKS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.id} — {c.name}
            </option>
          ))}
        </Select>
        <div className="ml-auto flex gap-2 text-xs text-muted-foreground">
          <Badge variant="destructive">{counts.alta} de severidad alta</Badge>
          <Badge variant="secondary">{counts.cuantificados} con impacto cuantificado</Badge>
          <span className="self-center">corrida en {audit.runMs} ms</span>
        </div>
      </div>

      <ChecklistSummary audit={audit} />

      {visible.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Sin hallazgos para este filtro.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map((finding) => (
            <FindingCard
              key={finding.key}
              finding={finding}
              onStatus={(status) => setFindingStatus(finding.key, status)}
              onReset={() => resetFindingStatus(finding.key)}
              overridden={Boolean(statusOverrides[finding.key])}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ChecklistSummary({ audit }: { audit: AuditRunResult }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Checklist del auditor</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2 pt-0">
        {audit.byCheck.map((check) => (
          <span
            key={check.id}
            title={CHECKS.find((c) => c.id === check.id)?.summary}
            className={cn(
              'flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px]',
              check.error && 'border-destructive text-destructive',
              !check.error && check.count === 0 && 'text-muted-foreground',
              !check.error && check.count > 0 && 'border-warn/50 bg-warn/10',
            )}
          >
            <strong>{check.id}</strong>
            <span>{check.name}</span>
            <Badge variant={check.count > 0 ? 'warn' : 'muted'}>{check.count}</Badge>
            {check.mode === 'candidato' && <Badge variant="outline">requiere confirmacion</Badge>}
            {check.error && <span>error: {check.error}</span>}
          </span>
        ))}
      </CardContent>
    </Card>
  );
}

function FindingCard({
  finding,
  onStatus,
  onReset,
  overridden,
}: {
  finding: Finding;
  onStatus: (status: FindingStatus) => void;
  onReset: () => void;
  overridden: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(finding.boardLanguage);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Card className={cn(finding.status === 'dismissed' && 'opacity-55')}>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{finding.id}</Badge>
          <Badge variant={SEVERITY_BADGE[finding.severity]}>{finding.severity}</Badge>
          <CardTitle className="text-sm">{finding.title}</CardTitle>
          <Badge variant="secondary" className="ml-auto">
            {STATUS_LABEL[finding.status]}
          </Badge>
        </div>
        <p className="cell-mono text-muted-foreground">
          {finding.sheet}
          {finding.cellRefs.length > 0 && `!${finding.cellRefs.slice(0, 8).join(', ')}`}
          {finding.cellRefs.length > 8 && ` (+${finding.cellRefs.length - 8})`}
        </p>
      </CardHeader>

      <CardContent className="space-y-3 pt-0">
        <p className="text-sm leading-relaxed">{finding.description}</p>

        {finding.quantifiedImpact && (
          <div className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2">
            <p className="text-xs font-semibold">Impacto cuantificado</p>
            <p className="text-sm tabular-nums">{formatImpact(finding.quantifiedImpact)}</p>
            {finding.quantifiedImpact.basis && (
              <p className="text-[11px] text-muted-foreground">
                Base de calculo: {finding.quantifiedImpact.basis}
              </p>
            )}
          </div>
        )}

        {finding.evidence.length > 0 && (
          <details className="rounded-md border bg-muted/40 px-3 py-2">
            <summary className="cursor-pointer text-xs font-medium">
              Evidencia ({finding.evidence.length})
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

        <div className="rounded-md border-l-4 border-primary bg-accent/50 px-3 py-2">
          <p className="text-xs font-semibold text-accent-foreground">Borrador para memo de junta</p>
          <p className="text-sm leading-relaxed">{finding.boardLanguage}</p>
        </div>

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
              Volver al estado automatico
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
