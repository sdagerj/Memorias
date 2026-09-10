/**
 * Distribución temporal de la producción en bloques de quince segundos.
 *
 * En fluidez verbal la curva importa tanto como el total. Lo esperable es
 * que el primer bloque sea el más productivo y que la producción decaiga;
 * una curva plana desde el principio apunta a lentitud en el acceso léxico
 * más que a un vocabulario reducido.
 */

import type { PalabraProducida } from '../tipos'

export const DURACION_BLOQUE_MS = 15_000
export const DURACION_PRUEBA_MS = 60_000

export interface Bloque {
  /** Índice del bloque: 0 es 0–15 s, 3 es 45–60 s. */
  indice: number
  desdeMs: number
  hastaMs: number
  /** Solo palabras válidas. Las repeticiones no cuentan como producción. */
  validas: number
  perseveraciones: number
}

export function distribuirEnBloques(
  palabras: PalabraProducida[],
  duracionMs: number = DURACION_PRUEBA_MS,
): Bloque[] {
  const cantidad = Math.max(1, Math.ceil(duracionMs / DURACION_BLOQUE_MS))

  const bloques: Bloque[] = Array.from({ length: cantidad }, (_, indice) => ({
    indice,
    desdeMs: indice * DURACION_BLOQUE_MS,
    hastaMs: Math.min((indice + 1) * DURACION_BLOQUE_MS, duracionMs),
    validas: 0,
    perseveraciones: 0,
  }))

  for (const palabra of palabras) {
    if (palabra.tMs < 0) continue
    const indice = Math.min(Math.floor(palabra.tMs / DURACION_BLOQUE_MS), cantidad - 1)
    const bloque = bloques[indice]
    if (bloque === undefined) continue
    if (palabra.clase === 'valida') bloque.validas += 1
    else if (palabra.clase === 'perseveracion') bloque.perseveraciones += 1
  }

  return bloques
}

/**
 * Pendiente de la curva: cuánto cae la producción del primer bloque al
 * último, en palabras. Un número positivo significa que decayó.
 */
export function caidaDeProduccion(bloques: Bloque[]): number {
  const primero = bloques[0]
  const ultimo = bloques[bloques.length - 1]
  if (primero === undefined || ultimo === undefined) return 0
  return primero.validas - ultimo.validas
}
