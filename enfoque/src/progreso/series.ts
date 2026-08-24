/**
 * Prepara los datos guardados para las gráficas.
 *
 * El eje horizontal es la fecha real, no el número de sesión. Es una
 * decisión con sentido clínico: si se entrena tres días seguidos y luego se
 * para dos semanas, el eje por número de sesión escondería la pausa y
 * sugeriría una mejoría continua que no ocurrió.
 */

import type { ResultadoEjercicio, RegistroDiario } from '../datos/db'

export interface PuntoSerie {
  /** Fecha AAAA-MM-DD. */
  fecha: string
  /** Milisegundos, para ordenar y espaciar el eje. */
  t: number
  valor: number
}

/**
 * Extrae una métrica a lo largo del tiempo.
 *
 * Cuando hay varios resultados del mismo ejercicio el mismo día se toma el
 * mejor, no el promedio: en pruebas de amplitud el interés está en el techo
 * alcanzado, y promediar lo enmascara.
 */
export function serieDe(
  resultados: ResultadoEjercicio[],
  ejercicio: string,
  metrica: string,
  agregacion: 'max' | 'suma' | 'ultimo' = 'max',
): PuntoSerie[] {
  const porFecha = new Map<string, number[]>()

  for (const fila of resultados) {
    if (fila.ejercicio !== ejercicio) continue
    const valor = fila.metricas[metrica]
    if (typeof valor !== 'number' || Number.isNaN(valor)) continue
    const existentes = porFecha.get(fila.fecha) ?? []
    existentes.push(valor)
    porFecha.set(fila.fecha, existentes)
  }

  return [...porFecha.entries()]
    .map(([fecha, valores]) => ({
      fecha,
      t: Date.parse(`${fecha}T12:00:00`),
      valor: agregar(valores, agregacion),
    }))
    .sort((a, b) => a.t - b.t)
}

function agregar(valores: number[], modo: 'max' | 'suma' | 'ultimo'): number {
  if (valores.length === 0) return 0
  if (modo === 'suma') return valores.reduce((a, b) => a + b, 0)
  if (modo === 'ultimo') return valores[valores.length - 1] as number
  return Math.max(...valores)
}

/** Combina dos series por fecha, para cruzar rendimiento con el diario. */
export function cruzarConDiario(
  serie: PuntoSerie[],
  diario: RegistroDiario[],
): Array<PuntoSerie & { energia?: number; sueno?: number; niebla?: number }> {
  const porFecha = new Map(diario.map((d) => [d.fecha, d]))
  return serie.map((punto) => {
    const registro = porFecha.get(punto.fecha)
    if (!registro) return punto
    return {
      ...punto,
      energia: registro.energia,
      sueno: registro.sueno,
      niebla: registro.niebla,
    }
  })
}

/** Fecha corta para las etiquetas del eje: `12 mar`. */
export function etiquetaFecha(fecha: string): string {
  const partes = fecha.split('-')
  const mes = Number(partes[1] ?? '1')
  const dia = Number(partes[2] ?? '1')
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${dia} ${meses[mes - 1] ?? ''}`
}

/** Rango de fechas cubierto, ya redactado para el encabezado del informe. */
export function rangoDeFechas(resultados: ResultadoEjercicio[]): string {
  if (resultados.length === 0) return 'Sin datos'
  const fechas = resultados.map((r) => r.fecha).sort()
  const desde = fechas[0] as string
  const hasta = fechas[fechas.length - 1] as string
  return desde === hasta ? desde : `${desde} a ${hasta}`
}
