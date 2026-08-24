/**
 * Tipos compartidos por todo el núcleo de puntuación.
 *
 * Regla del núcleo: ninguna función de esta carpeta lee el reloj, la base de
 * datos ni el DOM. El tiempo entra siempre como parámetro. Así los puntajes
 * son reproducibles y se pueden probar de forma determinista.
 */

export type Ejercicio =
  | 'digitos-inversos'
  | 'digitos-creciente'
  | 'letras-numeros'
  | 'ordenamiento-alfabetico'
  | 'fluidez-semantica'
  | 'fluidez-fonologica'

export type MotivoCierre = 'completada' | 'tiempo' | 'fatiga' | 'usuaria'

/** Un ensayo individual dentro de un ejercicio. */
export interface Intento {
  /** Lo que se presentó, ya normalizado a texto legible. */
  estimulo: string
  /** Lo que respondió la usuaria. */
  respuesta: string
  /** Nivel de dificultad en el que se presentó (longitud de la serie). */
  nivel: number
  acierto: boolean
  /** Milisegundos desde que terminó la presentación hasta que se envió la respuesta. */
  tiempoRespuestaMs: number
}

/** Clasificación de una palabra dentro de una prueba de fluidez. */
export type ClasePalabra =
  /** Cumple la consigna y no se había dicho antes. */
  | 'valida'
  /** Ya se había dicho antes en esta misma prueba. */
  | 'perseveracion'
  /** No cumple la consigna (categoría o letra equivocada). */
  | 'intrusion'
  /** Aún no clasificada: la usuaria decide en la pantalla de revisión. */
  | 'pendiente'

/** Una palabra producida durante los 60 segundos de fluidez. */
export interface PalabraProducida {
  texto: string
  /** Milisegundos desde el inicio de la prueba. */
  tMs: number
  clase: ClasePalabra
}
