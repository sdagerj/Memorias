/**
 * Juego de parejas por audio.
 *
 * Es el juego de toda la vida —destapar casillas y buscar las dos iguales—
 * con un cambio que no es decorativo: las casillas no muestran nada, suenan.
 * Se toca una y se oye una palabra; se toca otra y se oye otra; hay que
 * encontrar las dos que dicen lo mismo.
 *
 * El motivo del cambio es el mismo que gobierna el resto de la aplicación.
 * El juego clásico, con dibujos a la vista, entrena memoria visual, que está
 * preservada. Al presentar el estímulo por el oído, lo que hay que sostener
 * mientras se busca es una palabra escuchada y su posición: memoria de
 * trabajo auditivo-verbal, que es el déficit.
 *
 * Toda la lógica vive aquí, sin DOM y sin reloj, porque de ella salen los
 * números que van al informe. El estado es inmutable: cada toque produce un
 * estado nuevo y nada se modifica en el sitio.
 */

import type { Azar } from './digitos'

export type EstadoCarta = 'oculta' | 'abierta' | 'resuelta'

export interface Carta {
  /** Posición en el tablero. Es la identidad de la carta. */
  indice: number
  /** Palabra que se dicta al tocarla. Nunca se escribe en pantalla. */
  palabra: string
  /** Identificador de la pareja. Dos cartas con el mismo valor son iguales. */
  pareja: number
  estado: EstadoCarta
}

/** Un turno completo: las dos cartas que se destaparon y en qué quedó. */
export interface Turno {
  a: number
  b: number
  acierto: boolean
  /**
   * El mismo par de casillas ya se había probado antes y ya había fallado.
   * Este es el marcador clínico del ejercicio.
   */
  repetido: boolean
}

export interface EstadoParejas {
  cartas: Carta[]
  /** Índices destapados en el turno en curso. Nunca más de dos. */
  abiertas: number[]
  /** Turnos completos. Un turno es un par de casillas destapadas. */
  intentos: number
  parejasResueltas: number
  /**
   * Veces que se volvió a probar un par de casillas que ya había fallado.
   *
   * Es una perseveración en el mismo sentido que la de fluidez: repetir una
   * respuesta improductiva a pesar de haber recibido ya la información de
   * que no sirve. Se cuenta aparte del rendimiento y no penaliza el acierto
   * del tablero, para no castigar dos veces el mismo error.
   *
   * Lo que deliberadamente NO se cuenta como perseveración: tocar dos veces
   * seguidas la misma casilla dentro de un turno. En un teléfono eso es un
   * dedo que resbala, no un signo cognitivo, y un falso positivo aquí es un
   * dato equivocado en un informe médico.
   */
  perseveraciones: number
  /** Turno a turno, para poder auditar el conteo. */
  historial: Turno[]
  terminado: boolean
}

/**
 * Baraja una lista sin modificar la original.
 *
 * Fisher-Yates con la fuente de azar inyectada, para que una prueba pueda
 * fijar el tablero y comprobar el conteo con jugadas conocidas.
 */
export function mezclar<T>(lista: readonly T[], azar: Azar = Math.random): T[] {
  const copia = [...lista]
  for (let i = copia.length - 1; i > 0; i -= 1) {
    const j = Math.floor(azar() * (i + 1))
    const tmp = copia[i] as T
    copia[i] = copia[j] as T
    copia[j] = tmp
  }
  return copia
}

/** Construye el tablero: cada palabra dos veces, repartidas al azar. */
export function generarTablero(palabras: readonly string[], azar: Azar = Math.random): Carta[] {
  const sueltas = palabras.flatMap((palabra, pareja) => [
    { palabra, pareja },
    { palabra, pareja },
  ])

  return mezclar(sueltas, azar).map((carta, indice) => ({
    indice,
    palabra: carta.palabra,
    pareja: carta.pareja,
    estado: 'oculta' as EstadoCarta,
  }))
}

export function iniciarPartida(palabras: readonly string[], azar: Azar = Math.random): EstadoParejas {
  return {
    cartas: generarTablero(palabras, azar),
    abiertas: [],
    intentos: 0,
    parejasResueltas: 0,
    perseveraciones: 0,
    historial: [],
    terminado: false,
  }
}

/** ¿Ya se había probado antes este mismo par, y había fallado? */
function yaFallado(historial: Turno[], a: number, b: number): boolean {
  return historial.some(
    (t) => !t.acierto && ((t.a === a && t.b === b) || (t.a === b && t.b === a)),
  )
}

function conEstado(cartas: Carta[], indices: number[], estado: EstadoCarta): Carta[] {
  return cartas.map((carta) =>
    indices.includes(carta.indice) ? { ...carta, estado } : carta,
  )
}

/**
 * Aplica un toque sobre una casilla y devuelve el estado siguiente.
 *
 * Devuelve el mismo objeto, sin copiarlo, cuando el toque no cambia nada.
 * La interfaz usa esa igualdad para saber que no hay que dictar nada.
 *
 * Al destapar la segunda carta el turno se resuelve aquí mismo: si son
 * iguales quedan resueltas; si no, quedan a la vista para que se alcance a
 * oír la segunda palabra, y es la interfaz la que llama a `cerrarTurno`
 * cuando termina el dictado.
 */
export function tocar(estado: EstadoParejas, indice: number): EstadoParejas {
  if (estado.terminado) return estado
  if (estado.abiertas.length >= 2) return estado

  const carta = estado.cartas[indice]
  if (carta === undefined || carta.estado !== 'oculta') return estado

  if (estado.abiertas.length === 0) {
    return {
      ...estado,
      cartas: conEstado(estado.cartas, [indice], 'abierta'),
      abiertas: [indice],
    }
  }

  const primera = estado.abiertas[0] as number
  if (primera === indice) return estado

  const otra = estado.cartas[primera] as Carta
  const acierto = otra.pareja === carta.pareja
  const repetido = yaFallado(estado.historial, primera, indice)

  const turno: Turno = { a: primera, b: indice, acierto, repetido }
  const historial = [...estado.historial, turno]
  const intentos = estado.intentos + 1
  const perseveraciones = estado.perseveraciones + (repetido ? 1 : 0)

  const agotado = intentos >= limiteDeIntentos(estado.cartas.length / 2)

  if (acierto) {
    const cartas = conEstado(estado.cartas, [primera, indice], 'resuelta')
    const parejasResueltas = estado.parejasResueltas + 1
    return {
      cartas,
      abiertas: [],
      intentos,
      parejasResueltas,
      perseveraciones,
      historial,
      terminado: parejasResueltas * 2 === cartas.length || agotado,
    }
  }

  return {
    ...estado,
    cartas: conEstado(estado.cartas, [indice], 'abierta'),
    abiertas: [primera, indice],
    intentos,
    perseveraciones,
    historial,
    terminado: agotado,
  }
}

/** Vuelve a tapar las dos cartas de un turno fallido. */
export function cerrarTurno(estado: EstadoParejas): EstadoParejas {
  if (estado.abiertas.length < 2) return estado
  return {
    ...estado,
    cartas: conEstado(estado.cartas, estado.abiertas, 'oculta'),
    abiertas: [],
  }
}

/**
 * Turnos permitidos para dar el tablero por superado.
 *
 * Con memoria perfecta cada turno exploratorio descubre dos palabras nuevas
 * y cada palabra ya oída se puede emparejar en un turno. La mitad más uno
 * por encima del número de parejas deja margen para el azar de los primeros
 * turnos sin dejar pasar el tanteo a ciegas: jugando al azar, un tablero de
 * tres parejas necesita del orden de ocho turnos, y aquí se piden seis.
 */
export function umbralDeIntentos(parejas: number): number {
  return Math.ceil(parejas * 1.5) + 1
}

/**
 * Turnos tras los cuales el tablero se levanta aunque queden parejas sueltas.
 *
 * Sin este techo un tablero podría no terminar nunca: si no aparece la
 * última pareja, no hay nada que corte. Con el doble del umbral ya está
 * larguísimo, el dato del tablero ya está decidido —no se superó— y seguir
 * solo mide cansancio. La escalera baja de nivel y el ejercicio continúa,
 * sin decir nada de fallo.
 */
export function limiteDeIntentos(parejas: number): number {
  return umbralDeIntentos(parejas) * 2
}

export interface ResultadoTablero {
  acierto: boolean
  /** Encontró todas las parejas, con independencia de cuántos turnos gastó. */
  completado: boolean
  parejas: number
  intentos: number
  perseveraciones: number
  umbral: number
}

/**
 * Califica un tablero terminado.
 *
 * El acierto mide solo una cosa: si completó el tablero dentro del
 * presupuesto de turnos. Las perseveraciones se informan aparte porque son
 * un marcador distinto, y porque ya inflan los turnos por su cuenta:
 * contarlas otra vez aquí sería penalizar dos veces.
 */
export function calificarTablero(estado: EstadoParejas): ResultadoTablero {
  const parejas = estado.cartas.length / 2
  const umbral = umbralDeIntentos(parejas)
  const completado = estado.parejasResueltas === parejas
  return {
    acierto: completado && estado.intentos <= umbral,
    completado,
    parejas,
    intentos: estado.intentos,
    perseveraciones: estado.perseveraciones,
    umbral,
  }
}
