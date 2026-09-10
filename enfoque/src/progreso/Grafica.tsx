import {
  AreaChart,
  Area,
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
  const marcas = calcularMarcas(Math.min(...referencias), Math.max(...referencias))
  const minimo = marcas[0] as number
  const maximo = marcas[marcas.length - 1] as number
  const idGradiente = `degradado-${idCaptura ?? titulo.replace(/\s/g, '')}`

  return (
    <div
      className="rounded-hondo border border-borde-suave bg-superficie p-6 shadow-[var(--shadow-tarjeta)]"
      id={idCaptura}
    >
      <h3>{titulo}</h3>
      <p className="mb-4 text-[1.0625rem] text-texto-tenue">{unidad}</p>

      <div style={{ width: '100%', height: 240 }}>
        <ResponsiveContainer>
          <AreaChart data={serie} margin={{ top: 10, right: 14, bottom: 4, left: -16 }}>
            <defs>
              <linearGradient id={idGradiente} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.16} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--color-borde-suave)" vertical={false} />
            <XAxis
              dataKey="fecha"
              tickFormatter={etiquetaFecha}
              tick={{ fontSize: 13, fill: 'var(--color-texto-tenue)' }}
              stroke="var(--color-borde)"
            />
            <YAxis
              domain={[minimo, maximo]}
              ticks={marcas}
              allowDecimals={false}
              width={38}
              tick={{ fontSize: 13, fill: 'var(--color-texto-tenue)' }}
              stroke="var(--color-borde)"
            />
            <Tooltip
              formatter={(valor) => [`${String(valor)} ${unidad}`, '']}
              labelFormatter={(fecha) => etiquetaFecha(String(fecha))}
              contentStyle={{
                borderRadius: 14,
                border: '1px solid var(--color-borde)',
                backgroundColor: 'var(--color-superficie)',
                boxShadow: 'var(--shadow-tarjeta)',
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
            <Area
              type="monotone"
              dataKey="valor"
              stroke={color}
              strokeWidth={2.25}
              fill={`url(#${idGradiente})`}
              dot={{ r: 3.5, fill: 'var(--color-superficie)', stroke: color, strokeWidth: 2 }}
              activeDot={{ r: 5.5, fill: color, stroke: 'var(--color-superficie)', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/**
 * Marcas del eje vertical en números redondos.
 *
 * Dejar que la librería elija, o repartir el rango sin más, produce escalas
 * como 2, 7, 12, 19: son correctas y no se leen. Aquí el paso se redondea a
 * 1, 2, 5, 10… y las marcas se alinean a múltiplos de ese paso, de modo que
 * el eje siempre cae en cifras que se reconocen de un vistazo.
 *
 * El eje empieza siempre en cero, aunque el dato más bajo esté lejos. Es una
 * decisión de honestidad, no de estética: recortando el eje por abajo, pasar
 * de tres a cuatro dígitos se dibuja como si el rendimiento se hubiera
 * duplicado. Estas gráficas van a un informe médico y no pueden exagerar la
 * pendiente.
 *
 * El rango incluye siempre el valor basal, porque la línea de referencia de
 * septiembre de 2025 tiene que quedar dentro de la gráfica y no fuera de
 * cuadro.
 */
export function calcularMarcas(_minimo: number, maximo: number): number[] {
  const PASOS = [1, 2, 5, 10, 20, 25, 50, 100]
  const OBJETIVO = 5

  const crudo = Math.max(1, maximo / OBJETIVO)
  const paso = PASOS.find((p) => p >= crudo) ?? PASOS[PASOS.length - 1] ?? 1
  const hasta = Math.max(paso, Math.ceil(maximo / paso) * paso)

  const marcas: number[] = []
  for (let valor = 0; valor <= hasta; valor += paso) marcas.push(valor)
  return marcas
}
