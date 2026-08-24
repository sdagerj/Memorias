/**
 * Tabla resumen por dominio: lo que va arriba del PDF y de la pantalla de
 * progreso.
 *
 * Compara el último valor con el primero registrado en la aplicación y con
 * el basal de septiembre de 2025 cuando existe. No se calculan percentiles
 * ni se compara con población normativa: esta herramienta no tiene baremos
 * y presentarlos sería inventarlos.
 */

import type { ResultadoEjercicio } from '../datos/db'
import { basalDe } from '../datos/basales'
import { serieDe, type PuntoSerie } from './series'

export interface FilaResumen {
  dominio: string
  etiqueta: string
  unidad: string
  primero: number | null
  ultimo: number | null
  mejor: number | null
  /** Basal de la evaluación de septiembre de 2025, si lo hay. */
  basal: number | null
  sesiones: number
}

interface Definicion {
  dominio: string
  etiqueta: string
  ejercicio: string
  metrica: string
  unidad: string
  /** Dominio del basal, cuando el nombre no coincide. */
  basal?: string
}

export const DOMINIOS: Definicion[] = [
  {
    dominio: 'digitos-inversos',
    etiqueta: 'Dígitos en orden inverso',
    ejercicio: 'digitos-inversos',
    metrica: 'spanMaximo',
    unidad: 'dígitos',
    basal: 'digitos-inversos',
  },
  {
    dominio: 'digitos-creciente',
    etiqueta: 'Dígitos de menor a mayor',
    ejercicio: 'digitos-creciente',
    metrica: 'spanMaximo',
    unidad: 'dígitos',
  },
  {
    dominio: 'letras-numeros',
    etiqueta: 'Números y letras',
    ejercicio: 'letras-numeros',
    metrica: 'spanMaximo',
    unidad: 'elementos',
  },
  {
    dominio: 'ordenamiento-alfabetico',
    etiqueta: 'Ordenamiento alfabético',
    ejercicio: 'ordenamiento-alfabetico',
    metrica: 'longitudMaxima',
    unidad: 'palabras',
  },
  {
    dominio: 'fluidez-semantica',
    etiqueta: 'Fluidez semántica',
    ejercicio: 'fluidez-semantica',
    metrica: 'validas',
    unidad: 'palabras',
    basal: 'fluidez-semantica',
  },
  {
    dominio: 'fluidez-fonologica',
    etiqueta: 'Fluidez fonológica',
    ejercicio: 'fluidez-fonologica',
    metrica: 'validas',
    unidad: 'palabras',
    basal: 'fluidez-fonologica',
  },
  {
    dominio: 'perseveraciones-semantica',
    etiqueta: 'Perseveraciones (semántica)',
    ejercicio: 'fluidez-semantica',
    metrica: 'perseveraciones',
    unidad: 'repeticiones',
  },
  {
    dominio: 'perseveraciones-fonologica',
    etiqueta: 'Perseveraciones (fonológica)',
    ejercicio: 'fluidez-fonologica',
    metrica: 'perseveraciones',
    unidad: 'repeticiones',
  },
]

function extremos(serie: PuntoSerie[]) {
  if (serie.length === 0) return { primero: null, ultimo: null, mejor: null }
  return {
    primero: (serie[0] as PuntoSerie).valor,
    ultimo: (serie[serie.length - 1] as PuntoSerie).valor,
    mejor: Math.max(...serie.map((p) => p.valor)),
  }
}

export function construirResumen(resultados: ResultadoEjercicio[]): FilaResumen[] {
  return DOMINIOS.map((definicion) => {
    const serie = serieDe(resultados, definicion.ejercicio, definicion.metrica)
    const basal = definicion.basal ? (basalDe(definicion.basal)?.valor ?? null) : null

    return {
      dominio: definicion.dominio,
      etiqueta: definicion.etiqueta,
      unidad: definicion.unidad,
      basal,
      sesiones: serie.length,
      ...extremos(serie),
    }
  })
}

/** Solo los dominios con al menos un dato, para no llenar el informe de vacíos. */
export function resumenConDatos(resultados: ResultadoEjercicio[]): FilaResumen[] {
  return construirResumen(resultados).filter((fila) => fila.sesiones > 0)
}
