import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pantalla } from '../ui/Pantalla'
import { Tarjeta } from '../ui/Tarjeta'
import { Boton } from '../ui/Boton'
import { Grafica } from '../progreso/Grafica'
import { serieDe, rangoDeFechas, type PuntoSerie } from '../progreso/series'
import { resumenConDatos, type FilaResumen } from '../progreso/resumen'
import { csvDeResultados, csvDeDiario, csvDeFluidez, conMarcaUTF8 } from '../progreso/exportarCSV'
import { capturarGrafica } from '../progreso/capturar'
import { todosLosResultados, todoElDiario } from '../datos/repositorio'
import { basalDe } from '../datos/basales'
import type { ResultadoEjercicio, RegistroDiario } from '../datos/db'

interface Props {
  alVolver: () => void
}

interface DefinicionGrafica {
  id: string
  titulo: string
  ejercicio: string
  metrica: string
  unidad: string
  basal: number | null
  color: string
}

export function Progreso({ alVolver }: Props) {
  const [resultados, setResultados] = useState<ResultadoEjercicio[]>([])
  const [diario, setDiario] = useState<RegistroDiario[]>([])
  const [cargando, setCargando] = useState(true)
  const [generando, setGenerando] = useState(false)

  useEffect(() => {
    void Promise.all([todosLosResultados(), todoElDiario()]).then(([r, d]) => {
      setResultados(r)
      setDiario(d)
      setCargando(false)
    })
  }, [])

  const graficas: DefinicionGrafica[] = useMemo(() => [
    {
      id: 'g-digitos-inversos',
      titulo: 'Dígitos en orden inverso',
      ejercicio: 'digitos-inversos',
      metrica: 'spanMaximo',
      unidad: 'dígitos alcanzados',
      basal: basalDe('digitos-inversos')?.valor ?? null,
      color: 'var(--color-serie-1)',
    },
    {
      id: 'g-fluidez-semantica',
      titulo: 'Fluidez semántica',
      ejercicio: 'fluidez-semantica',
      metrica: 'validas',
      unidad: 'palabras válidas en 60 segundos',
      basal: basalDe('fluidez-semantica')?.valor ?? null,
      color: 'var(--color-serie-2)',
    },
    {
      id: 'g-fluidez-fonologica',
      titulo: 'Fluidez fonológica',
      ejercicio: 'fluidez-fonologica',
      metrica: 'validas',
      unidad: 'palabras válidas en 60 segundos',
      basal: basalDe('fluidez-fonologica')?.valor ?? null,
      color: 'var(--color-serie-3)',
    },
    {
      // Marcador clínico propio, con su gráfica separada por indicación expresa.
      id: 'g-perseveraciones',
      titulo: 'Perseveraciones',
      ejercicio: 'fluidez-semantica',
      metrica: 'perseveraciones',
      unidad: 'repeticiones por prueba',
      basal: null,
      color: 'var(--color-serie-4)',
    },
    {
      id: 'g-alfabetico',
      titulo: 'Ordenamiento alfabético',
      ejercicio: 'ordenamiento-alfabetico',
      metrica: 'longitudMaxima',
      unidad: 'palabras ordenadas',
      basal: null,
      color: 'var(--color-serie-1)',
    },
  ], [])

  const descargar = (contenido: string, nombre: string, tipo: string) => {
    const enlace = document.createElement('a')
    enlace.href = URL.createObjectURL(new Blob([contenido], { type: tipo }))
    enlace.download = nombre
    enlace.click()
    URL.revokeObjectURL(enlace.href)
  }

  const exportarCSV = () => {
    const fecha = new Date().toISOString().slice(0, 10)
    descargar(
      conMarcaUTF8(csvDeResultados(resultados)),
      `enfoque-resultados-${fecha}.csv`,
      'text/csv;charset=utf-8',
    )
    descargar(
      conMarcaUTF8(csvDeFluidez(resultados)),
      `enfoque-fluidez-detalle-${fecha}.csv`,
      'text/csv;charset=utf-8',
    )
    if (diario.length > 0) {
      descargar(
        conMarcaUTF8(csvDeDiario(diario)),
        `enfoque-diario-${fecha}.csv`,
        'text/csv;charset=utf-8',
      )
    }
  }

  const exportarPDF = useCallback(async () => {
    setGenerando(true)
    try {
      // jsPDF arrastra unos 400 kB que solo hacen falta aquí. Se cargan al
      // pulsar el botón y no al abrir la aplicación en el teléfono.
      const { generarInforme, nombreArchivoInforme } = await import('../progreso/exportarPDF')
      const capturadas = []
      for (const definicion of graficas) {
        const captura = await capturarGrafica(definicion.id)
        if (captura) capturadas.push({ titulo: definicion.titulo, ...captura })
      }
      const doc = generarInforme({ resultados, diario, graficas: capturadas })
      doc.save(nombreArchivoInforme())
    } finally {
      setGenerando(false)
    }
  }, [resultados, diario, graficas])

  if (cargando) {
    return (
      <Pantalla titulo="Progreso">
        <p className="text-texto-tenue">Cargando…</p>
      </Pantalla>
    )
  }

  if (resultados.length === 0) {
    return (
      <Pantalla titulo="Progreso">
        <Tarjeta>
          <p className="text-texto-suave">
            Todavía no hay sesiones registradas. Después de la primera aparecerán aquí las
            gráficas y tus líneas de referencia de septiembre de 2025.
          </p>
          <Boton tono="secundario" ancho className="mt-5" onClick={alVolver}>
            Volver
          </Boton>
        </Tarjeta>
      </Pantalla>
    )
  }

  const resumen = resumenConDatos(resultados)

  return (
    <Pantalla titulo="Progreso">
      <Tarjeta>
        <p className="text-sm text-texto-tenue">Periodo: {rangoDeFechas(resultados)}</p>
        <TablaResumen filas={resumen} />
      </Tarjeta>

      <div className="mt-4 space-y-4">
        {graficas.map((definicion) => (
          <Grafica
            key={definicion.id}
            idCaptura={definicion.id}
            titulo={definicion.titulo}
            unidad={definicion.unidad}
            basal={definicion.basal}
            color={definicion.color}
            serie={serieDe(resultados, definicion.ejercicio, definicion.metrica) as PuntoSerie[]}
          />
        ))}
      </div>

      <Tarjeta className="mt-4">
        <h2 className="font-medium">Llevar los datos a consulta</h2>
        <p className="mt-1 text-sm text-texto-tenue">
          El PDF trae la tabla resumen, las gráficas y el rango de fechas. El CSV trae el detalle,
          incluida cada palabra de fluidez con su clasificación.
        </p>
        <div className="mt-4 flex flex-col gap-3">
          <Boton onClick={() => void exportarPDF()} disabled={generando} ancho>
            {generando ? 'Armando el informe…' : 'Descargar informe en PDF'}
          </Boton>
          <Boton tono="secundario" onClick={exportarCSV} ancho>
            Descargar datos en CSV
          </Boton>
        </div>
      </Tarjeta>

      <Boton tono="secundario" ancho className="mt-4" onClick={alVolver}>
        Volver
      </Boton>
    </Pantalla>
  )
}

/**
 * Resumen por dominio.
 *
 * En el teléfono una tabla de cinco columnas se sale de la pantalla y hay
 * que arrastrarla de lado para leer la columna que importa. Por eso en
 * pantalla angosta cada dominio se presenta como una ficha con sus cuatro
 * cifras en fila, y la tabla clásica aparece solo cuando hay ancho de sobra.
 */
function TablaResumen({ filas }: { filas: FilaResumen[] }) {
  return (
    <div className="mt-4">
      <ul className="space-y-3 sm:hidden">
        {filas.map((fila) => (
          <li key={fila.dominio} className="border-b border-borde pb-3 last:border-0">
            <p className="font-medium">{fila.etiqueta}</p>
            <p className="text-sm text-texto-tenue">{fila.unidad}</p>
            <dl className="mt-2 grid grid-cols-4 gap-2 text-center">
              <Cifra etiqueta="Primera" valor={fila.primero} />
              <Cifra etiqueta="Última" valor={fila.ultimo} />
              <Cifra etiqueta="Mejor" valor={fila.mejor} />
              <Cifra etiqueta="Basal" valor={fila.basal} tenue />
            </dl>
          </li>
        ))}
      </ul>

      <table className="hidden w-full border-collapse text-sm sm:table">
        <thead>
          <tr className="border-b border-borde text-left text-texto-tenue">
            <th className="py-2 pr-3 font-medium">Dominio</th>
            <th className="py-2 pr-3 font-medium">Primera</th>
            <th className="py-2 pr-3 font-medium">Última</th>
            <th className="py-2 pr-3 font-medium">Mejor</th>
            <th className="py-2 font-medium">Basal</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => (
            <tr key={fila.dominio} className="border-b border-borde last:border-0">
              <td className="py-2 pr-3">{fila.etiqueta}</td>
              <td className="py-2 pr-3 tabular-nums">{formatear(fila.primero)}</td>
              <td className="py-2 pr-3 tabular-nums">{formatear(fila.ultimo)}</td>
              <td className="py-2 pr-3 tabular-nums">{formatear(fila.mejor)}</td>
              <td className="py-2 tabular-nums text-texto-tenue">{formatear(fila.basal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Cifra({
  etiqueta,
  valor,
  tenue = false,
}: {
  etiqueta: string
  valor: number | null
  tenue?: boolean
}) {
  return (
    <div>
      <dt className="text-xs text-texto-tenue">{etiqueta}</dt>
      <dd className={`text-lg tabular-nums ${tenue ? 'text-texto-tenue' : ''}`}>
        {formatear(valor)}
      </dd>
    </div>
  )
}

function formatear(valor: number | null): string {
  if (valor === null) return '—'
  return Number.isInteger(valor) ? String(valor) : valor.toFixed(1)
}
