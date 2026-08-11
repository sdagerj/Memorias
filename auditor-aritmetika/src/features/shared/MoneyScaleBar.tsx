import { Coins } from 'lucide-react';
import { Select } from '@/components/ui/primitives';
import type { MoneyCurrency, MoneyScale } from '@/core/format/money';
import { formatAmount } from '@/core/format/money';
import { useAuditStore } from '@/store/useAuditStore';
import { cn } from '@/lib/utils';

/**
 * Escala de las cifras.
 *
 * El archivo no dice si un 27.882 son pesos o millones de pesos, y el auditor
 * no lo puede adivinar sin equivocarse. Se pregunta una vez, se recuerda, y
 * todas las cifras de la app y del memo quedan con la misma lectura.
 */
export function MoneyScaleBar({ className }: { className?: string }) {
  const { money, setMoneyFormat } = useAuditStore();

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm',
        className,
      )}
    >
      <Coins className="h-4 w-4 shrink-0 text-primary" />
      <span className="font-medium">Las cifras del Excel están en</span>

      <Select
        aria-label="Escala de las cifras"
        value={money.scale}
        onChange={(e) => setMoneyFormat({ scale: e.target.value as MoneyScale })}
        className="w-auto"
      >
        <option value="unidades">unidades</option>
        <option value="miles">miles</option>
        <option value="millones">millones</option>
      </Select>

      <Select
        aria-label="Moneda"
        value={money.currency}
        onChange={(e) => setMoneyFormat({ currency: e.target.value as MoneyCurrency })}
        className="w-auto"
      >
        <option value="COP">de pesos (COP)</option>
        <option value="USD">de dólares (USD)</option>
      </Select>

      <span className="text-xs text-muted-foreground">
        Una celda que dice <strong className="tabular-nums">27.882</strong> se lee{' '}
        <strong className="tabular-nums">{formatAmount(27_882, money)}</strong>
      </span>
    </div>
  );
}
