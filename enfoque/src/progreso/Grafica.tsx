import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import { etiquetaFecha, type PuntoSerie } from './series'

interface Props {
  titulo: string
  serie: PuntoSerie[]
  /** Valor basal de septiembre de 2025, si el dominio tiene uno. */
  basal?: number | null
  unidad: string
  /** Color de la línea. Nunca rojo: no hay alarma en esta aplicación. */
  color?: string
  /** Contenedor identificable para poder rasterizar la gráfica al PDF. */
  idCaptura?: string
}

export function Grafica({
  titulo,
  serie,
  basal,
  unidad,
  color = 'var(--color-serie-1)',
  idCaptura,
}: Props) {
  if (serie.length === 0) {
    return (
      <div className="rounded-hondo border border-borde-suave bg-superficie p-6 shadow-[var(--shadow-tarjeta)]">
        <h3>{titulo}</h3>
        <p className="mt-2.5 text-[1.0625rem] text-texto-tenue">
          Todavía no hay datos de este ejercicio.
        </p>
      </div>
    )
  }

  const valores = serie.map((p) => p.valor)
  const referencias = basal === null || basal === undefined ? valores : [...valores, basal]
  const minimo = Math.max(0, Math.floor(Math.min(...referencias) - 1))
  const maximo = Math.ceil(Math.max(...referencias) + 1)

  return (
    <div
      className="rounded-hondo border border-borde-suave bg-superficie p-6 shadow-[var(--shadow-tarjeta)]"
      id={idCaptura}
    >
      <h3>{titulo}</h3>
      <p className="mb-4 text-[1.0625rem] text-texto-tenue">{unidad}</p>

      <div style={{ width: '100%', height: 240 }}>
        <ResponsiveContainer>
          <LineChart data={serie} margin={{ top: 8, right: 12, bottom: 4, left: -18 }}>
            <CartesianGrid stroke="var(--color-borde)" vertical={false} />
            <XAxis
              dataKey="fecha"
              tickFormatter={etiquetaFecha}
              tick={{ fontSize: 13, fill: 'var(--color-texto-tenue)' }}
              stroke="var(--color-borde)"
            />
            <YAxis
              domain={[minimo, maximo]}
              allowDecimals={false}
              tick={{ fontSize: 13, fill: 'var(--color-texto-tenue)' }}
              stroke="var(--color-borde)"
            />
            <Tooltip
              formatter={(valor) => [`${String(valor)} ${unidad}`, '']}
              labelFormatter={(fecha) => etiquetaFecha(String(fecha))}
              contentStyle={{
                borderRadius: 12,
                border: '1px solid var(--color-borde)',
                fontSize: 15,
              }}
            />
            {basal !== null && basal !== undefined && (
              <ReferenceLine
                y={basal}
                stroke="var(--color-referencia)"
                strokeDasharray="5 4"
                label={{
                  value: `Basal sep. 2025: ${basal}`,
                  position: 'insideTopLeft',
                  fontSize: 12,
                  fill: 'var(--color-texto-tenue)',
                }}
              />
            )}
            <Line
              type="monotone"
              dataKey="valor"
              stroke={color}
              strokeWidth={2}
              dot={{ r: 3, fill: color }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
