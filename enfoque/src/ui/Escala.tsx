interface Props {
  etiqueta: string
  valor: number | null
  alCambiar: (valor: number) => void
  /** Texto bajo el 1 y bajo el 5, para no dejar la escala sin anclaje. */
  extremos: [string, string]
}

/** Selector de 1 a 5 con botones grandes, para el registro diario. */
export function Escala({ etiqueta, valor, alCambiar, extremos }: Props) {
  return (
    <div>
      <p className="mb-2.5 text-[1.0625rem] font-semibold">{etiqueta}</p>
      <div className="flex gap-2.5" role="radiogroup" aria-label={etiqueta}>
        {[1, 2, 3, 4, 5].map((n) => {
          const activo = valor === n
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={activo}
              onClick={() => alCambiar(n)}
              className={[
                'flex-1 rounded-suave border py-3.5 text-xl tabular-nums',
                'transition-all duration-150 active:scale-[0.96]',
                activo
                  ? 'border-acento bg-acento-suave font-bold text-acento shadow-[var(--shadow-tarjeta)]'
                  : 'border-borde bg-superficie font-medium text-texto-tenue',
              ].join(' ')}
            >
              {n}
            </button>
          )
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[0.9375rem] text-texto-tenue">
        <span>{extremos[0]}</span>
        <span>{extremos[1]}</span>
      </div>
    </div>
  )
}
