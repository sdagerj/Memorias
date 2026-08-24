/**
 * Escalera adaptativa de dos aciertos arriba, un fallo abajo.
 *
 * Es el procedimiento estándar en psicofísica para estimar un umbral sin
 * agotar a quien responde: converge rápido y no exige decenas de ensayos.
 * Aquí gobierna la longitud de las series de dígitos y de las listas del
 * ordenamiento alfabético.
 *
 * De aquí sale el span máximo que va al informe, así que el estado es
 * explícito e inmutable: cada ensayo produce un estado nuevo y nada se
 * modifica en el sitio.
 */

export interface ConfigEscalera {
  /** Nivel en el que arranca la primera serie. */
  nivelInicial: number
  /** Nivel más bajo permitido. Nunca se baja de aquí. */
  nivelMinimo: number
  /** Nivel más alto permitido. Nunca se sube de aquí. */
  nivelMaximo: number
  /** Aciertos consecutivos necesarios para subir un nivel. */
  aciertosParaSubir: number
  /** Número máximo de ensayos del ejercicio. */
  maxEnsayos: number
  /**
   * Número de descensos consecutivos tras los cuales se da por encontrado el
   * techo y el ejercicio termina antes de agotar los ensayos. Mantiene los
   * ejercicios cortos, que es un requisito de diseño y no un detalle.
   */
  fallosParaTerminar: number
}

export const CONFIG_DIGITOS: ConfigEscalera = {
  nivelInicial: 3,
  nivelMinimo: 2,
  nivelMaximo: 9,
  aciertosParaSubir: 2,
  maxEnsayos: 14,
  fallosParaTerminar: 3,
}

export const CONFIG_ALFABETICO: ConfigEscalera = {
  nivelInicial: 4,
  nivelMinimo: 3,
  nivelMaximo: 8,
  aciertosParaSubir: 2,
  maxEnsayos: 10,
  fallosParaTerminar: 2,
}

export interface EstadoEscalera {
  /** Longitud de la serie que toca presentar ahora. */
  nivel: number
  /** Aciertos consecutivos acumulados en el nivel actual. */
  aciertosSeguidos: number
  /** Fallos consecutivos, sin importar el nivel. */
  fallosSeguidos: number
  /** Ensayos ya presentados. */
  ensayos: number
  /** Nivel más alto superado al menos una vez. Es el span que va al informe. */
  spanMaximo: number
  /** Verdadero cuando el ejercicio debe terminar. */
  terminado: boolean
}

export function iniciarEscalera(config: ConfigEscalera): EstadoEscalera {
  return {
    nivel: config.nivelInicial,
    aciertosSeguidos: 0,
    fallosSeguidos: 0,
    ensayos: 0,
    spanMaximo: 0,
    terminado: false,
  }
}

/**
 * Aplica el resultado de un ensayo y devuelve el estado siguiente.
 *
 * El span máximo solo sube cuando el nivel se supera de verdad, no por
 * haber llegado a presentarlo. Presentar un nivel 7 y fallarlo no otorga
 * span 7.
 */
export function registrarEnsayo(
  estado: EstadoEscalera,
  acierto: boolean,
  config: ConfigEscalera,
): EstadoEscalera {
  if (estado.terminado) return estado

  const ensayos = estado.ensayos + 1
  const spanMaximo = acierto ? Math.max(estado.spanMaximo, estado.nivel) : estado.spanMaximo

  let nivel = estado.nivel
  let aciertosSeguidos = estado.aciertosSeguidos
  let fallosSeguidos = estado.fallosSeguidos

  if (acierto) {
    fallosSeguidos = 0
    aciertosSeguidos += 1
    if (aciertosSeguidos >= config.aciertosParaSubir) {
      nivel = Math.min(nivel + 1, config.nivelMaximo)
      aciertosSeguidos = 0
    }
  } else {
    aciertosSeguidos = 0
    fallosSeguidos += 1
    nivel = Math.max(nivel - 1, config.nivelMinimo)
  }

  const terminado =
    ensayos >= config.maxEnsayos || fallosSeguidos >= config.fallosParaTerminar

  return { nivel, aciertosSeguidos, fallosSeguidos, ensayos, spanMaximo, terminado }
}

/** Porcentaje de aciertos de una tanda de ensayos, redondeado al entero. */
export function porcentajeAciertos(aciertos: number, total: number): number {
  if (total === 0) return 0
  return Math.round((aciertos / total) * 100)
}
