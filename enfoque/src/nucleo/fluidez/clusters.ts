/**
 * Agrupamiento semántico y saltos entre grupos.
 *
 * La estrategia normal en fluidez es producir por racimos: se agota una
 * subcategoría (`perro, gato, hámster`) y se salta a otra (`león, tigre`).
 * El tamaño de los racimos habla de la búsqueda dentro de la memoria
 * semántica; el número de saltos habla del control ejecutivo que permite
 * abandonar una subcategoría agotada y buscar otra.
 *
 * Se sigue el criterio de Troyer: solo entran las palabras válidas, el
 * tamaño de un racimo se cuenta como el número de palabras menos una, y los
 * racimos se forman entre palabras consecutivas.
 */

import type { PalabraProducida } from '../tipos'

/** Un racimo es la lista de palabras consecutivas que comparten grupo. */
export type Cluster = string[]

export interface MetricasClusters {
  clusters: Cluster[]
  /** Número de racimos formados. */
  numeroClusters: number
  /** Media del tamaño de racimo según Troyer (palabras menos una). */
  tamanoMedio: number
  /** Cambios de un racimo al siguiente. */
  saltos: number
}

/**
 * Agrupa las palabras válidas en racimos consecutivos.
 *
 * `mismoGrupo` decide si dos palabras contiguas pertenecen al mismo racimo.
 * Para fluidez semántica compara subcategorías; para la fonológica compara
 * inicio, rima y estructura vocálica.
 */
export function agruparEnClusters(
  palabras: PalabraProducida[],
  mismoGrupo: (a: string, b: string) => boolean,
): MetricasClusters {
  const validas = palabras.filter((p) => p.clase === 'valida').map((p) => p.texto)

  if (validas.length === 0) {
    return { clusters: [], numeroClusters: 0, tamanoMedio: 0, saltos: 0 }
  }

  const clusters: Cluster[] = [[validas[0] as string]]

  for (let i = 1; i < validas.length; i += 1) {
    const actual = validas[i] as string
    const anterior = validas[i - 1] as string
    const ultimoCluster = clusters[clusters.length - 1] as Cluster

    if (mismoGrupo(anterior, actual)) ultimoCluster.push(actual)
    else clusters.push([actual])
  }

  const sumaTroyer = clusters.reduce((suma, cluster) => suma + (cluster.length - 1), 0)

  return {
    clusters,
    numeroClusters: clusters.length,
    tamanoMedio: Number((sumaTroyer / clusters.length).toFixed(2)),
    saltos: clusters.length - 1,
  }
}

/**
 * Criterio fonológico: dos palabras van juntas si comparten las dos primeras
 * letras, si riman en las dos últimas, o si tienen la misma secuencia de
 * vocales (`casa` y `cara`).
 */
export function mismoGrupoFonologico(a: string, b: string): boolean {
  const limpiar = (texto: string) =>
    texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z\u00f1]/g, '')

  const x = limpiar(a)
  const y = limpiar(b)
  if (x === '' || y === '' || x === y) return false

  if (x.slice(0, 2) === y.slice(0, 2)) return true
  if (x.length >= 2 && y.length >= 2 && x.slice(-2) === y.slice(-2)) return true

  const vocales = (texto: string) => texto.replace(/[^aeiou]/g, '')
  return vocales(x) !== '' && vocales(x) === vocales(y)
}
