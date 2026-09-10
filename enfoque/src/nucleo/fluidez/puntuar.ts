/**
 * Puntuación de las pruebas de fluidez verbal.
 *
 * Este archivo produce el número que más importa del proyecto: las
 * perseveraciones. Todo lo demás de la aplicación puede tener una arruga;
 * esto no, porque va directo al informe de la neuropsicóloga.
 *
 * Criterios, explícitos para que puedan discutirse en consulta:
 *
 * - Una palabra es **perseveración** si su raíz ya apareció antes en la
 *   misma prueba, sin importar si la anterior fue válida o intrusión.
 *   Se cuenta cada repetición, no cada palabra repetida: decir `perro`
 *   tres veces son dos perseveraciones.
 * - Una palabra es **intrusión** si no cumple la consigna (no pertenece a
 *   la categoría, o no empieza por la letra pedida).
 * - Las palabras que el corpus no reconoce quedan **pendientes** y las
 *   clasifica la usuaria en la pantalla de revisión. No se descartan solas,
 *   porque ninguna lista de palabras del español está completa y un
 *   descarte automático bajaría el puntaje sin motivo real.
 * - El total de **válidas** solo cuenta palabras que cumplen la consigna y
 *   aparecen por primera vez.
 */

import { raiz } from '../normalizar'
import type { ClasePalabra, PalabraProducida } from '../tipos'

export interface MetricasFluidez {
  /** Palabras válidas: cumplen la consigna y no se habían dicho. */
  validas: number
  /** Repeticiones. El marcador clínico de esta aplicación. */
  perseveraciones: number
  /** Palabras que no cumplen la consigna. */
  intrusiones: number
  /** Palabras que aún esperan clasificación de la usuaria. */
  pendientes: number
  /** Total de palabras producidas, de cualquier clase. */
  totalProducidas: number
}

/**
 * Clasifica la lista de palabras en el orden en que se produjeron.
 *
 * `cumpleConsigna` decide si una palabra pertenece a la categoría o empieza
 * por la letra pedida. Devuelve `null` cuando no puede decidirlo, y esa
 * palabra queda pendiente de revisión manual.
 */
export function clasificarPalabras(
  palabras: PalabraProducida[],
  cumpleConsigna: (texto: string) => boolean | null,
): PalabraProducida[] {
  const raicesVistas = new Set<string>()

  return palabras.map((palabra) => {
    const clave = raiz(palabra.texto)

    if (clave === '') {
      return { ...palabra, clase: 'intrusion' as ClasePalabra }
    }

    // La repetición se evalúa primero: una palabra repetida es
    // perseveración aunque además fuera intrusión, porque lo que marca es
    // el fallo de control atencional, no el contenido.
    if (raicesVistas.has(clave)) {
      return { ...palabra, clase: 'perseveracion' as ClasePalabra }
    }

    raicesVistas.add(clave)

    const veredicto = cumpleConsigna(palabra.texto)
    if (veredicto === null) return { ...palabra, clase: 'pendiente' as ClasePalabra }
    return { ...palabra, clase: (veredicto ? 'valida' : 'intrusion') as ClasePalabra }
  })
}

/** Cuenta las clases ya asignadas. No reclasifica nada. */
export function calcularMetricas(palabras: PalabraProducida[]): MetricasFluidez {
  const metricas: MetricasFluidez = {
    validas: 0,
    perseveraciones: 0,
    intrusiones: 0,
    pendientes: 0,
    totalProducidas: palabras.length,
  }

  for (const palabra of palabras) {
    if (palabra.clase === 'valida') metricas.validas += 1
    else if (palabra.clase === 'perseveracion') metricas.perseveraciones += 1
    else if (palabra.clase === 'intrusion') metricas.intrusiones += 1
    else metricas.pendientes += 1
  }

  return metricas
}

/**
 * Aplica la decisión de la usuaria sobre una palabra pendiente.
 *
 * Solo puede pasar de `pendiente` a `valida` o `intrusion`. Una
 * perseveración ya detectada no se puede convertir en válida desde la
 * pantalla de revisión: la repetición es un hecho objetivo del registro.
 */
export function resolverPendiente(
  palabras: PalabraProducida[],
  indice: number,
  cuenta: boolean,
): PalabraProducida[] {
  return palabras.map((palabra, i) => {
    if (i !== indice || palabra.clase !== 'pendiente') return palabra
    return { ...palabra, clase: (cuenta ? 'valida' : 'intrusion') as ClasePalabra }
  })
}
