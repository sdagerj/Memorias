/**
 * Contrato común de todo ejercicio.
 *
 * El motor de sesión no sabe nada de dígitos ni de fluidez: solo monta el
 * componente que le toca y espera a que le devuelva un resultado. Añadir un
 * ejercicio de la fase 2 no obliga a tocar el motor.
 */

import type { Ejercicio, PalabraProducida } from '../nucleo/tipos'

export interface ResultadoDeEjercicio {
  ejercicio: Ejercicio
  duracionMs: number
  /** Métricas que van a la base y a las gráficas. */
  metricas: Record<string, number>
  /** Consigna concreta usada: categoría, letra o variante. */
  consigna?: string
  /** Solo en fluidez. */
  palabras?: PalabraProducida[]
  /** Secuencia de aciertos, para que el motor evalúe la fatiga. */
  aciertos: boolean[]
}

export interface PropsEjercicio {
  /** Se llama una vez, cuando el ejercicio termina. */
  alTerminar: (resultado: ResultadoDeEjercicio) => void
  /** Velocidad de dictado configurada por la usuaria. */
  velocidadVoz: number
  /** Voz elegida, si hay alguna. */
  voz: SpeechSynthesisVoice | undefined
  /** `true` si la usuaria quiere responder hablando. */
  usarMicrofono: boolean
}
