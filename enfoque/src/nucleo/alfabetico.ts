/**
 * Ordenamiento alfabético al estilo BANFE-2: se dictan de cuatro a ocho
 * palabras y hay que devolverlas en orden alfabético.
 *
 * La comparación usa `Intl.Collator('es')`, no el orden de los códigos
 * Unicode. Con el orden de códigos, `ñ` quedaría después de `z` y `árbol`
 * después de `zorro`, y el ejercicio marcaría como error una respuesta
 * correcta en español.
 */

import { normalizar } from './normalizar'
import type { Azar } from './digitos'

const comparador = new Intl.Collator('es', { sensitivity: 'base', numeric: false })

/** Ordena alfabéticamente según las reglas del español. */
export function ordenarEnEspanol(palabras: string[]): string[] {
  return [...palabras].sort(comparador.compare)
}

/**
 * Elige `cantidad` palabras distintas del corpus, evitando que dos empiecen
 * por la misma letra: si dos comparten inicial, el ejercicio deja de medir
 * ordenamiento y pasa a medir deletreo.
 */
export function generarLista(
  corpus: readonly string[],
  cantidad: number,
  azar: Azar = Math.random,
): string[] {
  const disponibles = [...corpus]
  const elegidas: string[] = []
  const inicialesUsadas = new Set<string>()
  let intentos = 0

  while (elegidas.length < cantidad && disponibles.length > 0) {
    intentos += 1
    const indice = Math.floor(azar() * disponibles.length)
    const palabra = disponibles[indice] as string
    const inicial = normalizar(palabra).charAt(0)

    const permiteRepetirInicial = intentos > cantidad * 40
    if (!inicialesUsadas.has(inicial) || permiteRepetirInicial) {
      elegidas.push(palabra)
      inicialesUsadas.add(inicial)
      disponibles.splice(indice, 1)
    } else if (intentos > cantidad * 80) {
      break
    }
  }

  return elegidas
}

export interface ResultadoAlfabetico {
  acierto: boolean
  esperada: string[]
  recibida: string[]
  /** Palabras en la posición correcta. */
  posicionesCorrectas: number
  /** Palabras que se dijeron pero no estaban en la lista. */
  intrusiones: string[]
  /** Palabras de la lista que no aparecieron en la respuesta. */
  omisiones: string[]
}

/**
 * Califica un ensayo comparando por forma normalizada, de modo que una tilde
 * omitida al escribir no cuente como error: lo que se evalúa es el
 * ordenamiento mental, no la ortografía.
 */
export function calificarAlfabetico(
  lista: string[],
  recibida: string[],
): ResultadoAlfabetico {
  const esperada = ordenarEnEspanol(lista)
  const esperadaNorm = esperada.map(normalizar)
  const recibidaNorm = recibida.map(normalizar)

  let posicionesCorrectas = 0
  for (let i = 0; i < esperadaNorm.length; i += 1) {
    if (recibidaNorm[i] === esperadaNorm[i]) posicionesCorrectas += 1
  }

  const enLista = new Set(esperadaNorm)
  const dichas = new Set(recibidaNorm)

  const intrusiones = recibida.filter((_, i) => !enLista.has(recibidaNorm[i] as string))
  const omisiones = esperada.filter((_, i) => !dichas.has(esperadaNorm[i] as string))

  const acierto =
    recibidaNorm.length === esperadaNorm.length &&
    posicionesCorrectas === esperadaNorm.length

  return { acierto, esperada, recibida, posicionesCorrectas, intrusiones, omisiones }
}
