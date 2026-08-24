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
      <p className="mb-2 font-medium">{etiqueta}</p>
      <div className="flex gap-2" role="radiogroup" aria-label={etiqueta}>
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
                'flex-1 rounded-suave border py-3 text-lg transition-colors',
                activo
                  ? 'border-acento bg-acento-suave font-semibold text-acento'
                  : 'border-borde bg-superficie text-texto-suave',
              ].join(' ')}
            >
              {n}
            </button>
          )
        })}
      </div>
      <div className="mt-1 flex justify-between text-sm text-texto-tenue">
        <span>{extremos[0]}</span>
        <span>{extremos[1]}</span>
      </div>
    </div>
  )
}
