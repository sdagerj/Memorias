import { describe, it, expect } from 'vitest'
import {
  mezclar,
  generarTablero,
  iniciarPartida,
  tocar,
  cerrarTurno,
  umbralDeIntentos,
  limiteDeIntentos,
  calificarTablero,
  type EstadoParejas,
} from './parejas'
import type { Azar } from './digitos'

function azarFijo(semilla: number): Azar {
  let estado = semilla
  return () => {
    estado = (estado * 1664525 + 1013904223) % 4294967296
    return estado / 4294967296
  }
}

/**
 * Construye una partida con el tablero puesto a mano.
 *
 * Las pruebas del conteo no pueden depender de una baraja al azar: hay que
 * saber exactamente qué carta hay en cada casilla para poder afirmar que un
 * par concreto acierta o falla.
 */
function partidaCon(disposicion: string[]): EstadoParejas {
  const parejas = new Map<string, number>()
  const cartas = disposicion.map((palabra, indice) => {
    if (!parejas.has(palabra)) parejas.set(palabra, parejas.size)
    return {
      indice,
      palabra,
      pareja: parejas.get(palabra) as number,
      estado: 'oculta' as const,
    }
  })
  return {
    cartas,
    abiertas: [],
    intentos: 0,
    parejasResueltas: 0,
    perseveraciones: 0,
    historial: [],
    terminado: false,
  }
}

/** Juega una secuencia de toques, cerrando el turno cuando toca. */
function jugar(estado: EstadoParejas, toques: number[]): EstadoParejas {
  let actual = estado
  for (const indice of toques) {
    if (actual.abiertas.length === 2) actual = cerrarTurno(actual)
    actual = tocar(actual, indice)
  }
  return actual
}

describe('barajado', () => {
  it('conserva todos los elementos', () => {
    const original = [1, 2, 3, 4, 5, 6]
    const mezclado = mezclar(original, azarFijo(7))
    expect([...mezclado].sort((a, b) => a - b)).toEqual(original)
  })

  it('no modifica la lista original', () => {
    const original = ['a', 'b', 'c']
    mezclar(original, azarFijo(3))
    expect(original).toEqual(['a', 'b', 'c'])
  })

  it('es reproducible con la misma semilla', () => {
    expect(mezclar([1, 2, 3, 4, 5], azarFijo(11))).toEqual(mezclar([1, 2, 3, 4, 5], azarFijo(11)))
  })
})

describe('armado del tablero', () => {
  it('pone cada palabra exactamente dos veces', () => {
    const cartas = generarTablero(['sol', 'luna', 'mar'], azarFijo(5))
    expect(cartas.length).toBe(6)
    for (const palabra of ['sol', 'luna', 'mar']) {
      expect(cartas.filter((c) => c.palabra === palabra).length).toBe(2)
    }
  })

  it('numera las casillas de forma correlativa y las deja todas tapadas', () => {
    const cartas = generarTablero(['sol', 'luna'], azarFijo(2))
    expect(cartas.map((c) => c.indice)).toEqual([0, 1, 2, 3])
    expect(cartas.every((c) => c.estado === 'oculta')).toBe(true)
  })

  it('da el mismo identificador de pareja a las dos cartas iguales', () => {
    for (let semilla = 1; semilla <= 20; semilla += 1) {
      const cartas = generarTablero(['sol', 'luna', 'mar', 'río'], azarFijo(semilla))
      for (const carta of cartas) {
        const gemela = cartas.find((c) => c.indice !== carta.indice && c.pareja === carta.pareja)
        expect(gemela?.palabra).toBe(carta.palabra)
      }
    }
  })

  it('arranca la partida sin turnos jugados', () => {
    const partida = iniciarPartida(['sol', 'luna'], azarFijo(1))
    expect(partida.intentos).toBe(0)
    expect(partida.parejasResueltas).toBe(0)
    expect(partida.perseveraciones).toBe(0)
    expect(partida.terminado).toBe(false)
  })
})

describe('mecánica del turno', () => {
  const disposicion = ['sol', 'luna', 'luna', 'sol']

  it('el primer toque destapa la carta y no cuenta como turno', () => {
    const despues = tocar(partidaCon(disposicion), 0)
    expect(despues.abiertas).toEqual([0])
    expect(despues.cartas[0]?.estado).toBe('abierta')
    expect(despues.intentos).toBe(0)
  })

  it('dos cartas iguales quedan resueltas y el turno se cierra solo', () => {
    const despues = jugar(partidaCon(disposicion), [0, 3])
    expect(despues.cartas[0]?.estado).toBe('resuelta')
    expect(despues.cartas[3]?.estado).toBe('resuelta')
    expect(despues.abiertas).toEqual([])
    expect(despues.parejasResueltas).toBe(1)
    expect(despues.intentos).toBe(1)
  })

  it('dos cartas distintas quedan a la vista hasta que se cierra el turno', () => {
    const abierto = jugar(partidaCon(disposicion), [0, 1])
    expect(abierto.abiertas).toEqual([0, 1])
    expect(abierto.cartas[1]?.estado).toBe('abierta')
    expect(abierto.intentos).toBe(1)

    const cerrado = cerrarTurno(abierto)
    expect(cerrado.abiertas).toEqual([])
    expect(cerrado.cartas[0]?.estado).toBe('oculta')
    expect(cerrado.cartas[1]?.estado).toBe('oculta')
  })

  it('cerrar el turno no destapa lo que ya estaba resuelto', () => {
    const conPareja = jugar(partidaCon(disposicion), [0, 3])
    expect(cerrarTurno(conPareja).cartas[0]?.estado).toBe('resuelta')
  })

  it('ignora el tercer toque mientras hay dos cartas a la vista', () => {
    const abierto = jugar(partidaCon(disposicion), [0, 1])
    expect(tocar(abierto, 2)).toBe(abierto)
  })

  it('ignora tocar una carta ya resuelta', () => {
    const conPareja = jugar(partidaCon(disposicion), [0, 3])
    expect(tocar(conPareja, 0)).toBe(conPareja)
  })

  it('ignora tocar dos veces la misma casilla dentro del turno', () => {
    const abierto = tocar(partidaCon(disposicion), 2)
    expect(tocar(abierto, 2)).toBe(abierto)
    expect(abierto.intentos).toBe(0)
  })

  it('termina cuando se resuelve la última pareja', () => {
    const final = jugar(partidaCon(disposicion), [0, 3, 1, 2])
    expect(final.terminado).toBe(true)
    expect(final.parejasResueltas).toBe(2)
    expect(final.intentos).toBe(2)
  })

  it('no acepta más toques una vez terminado', () => {
    const final = jugar(partidaCon(disposicion), [0, 3, 1, 2])
    expect(tocar(final, 0)).toBe(final)
  })

  it('no modifica el estado que recibe', () => {
    const inicial = partidaCon(disposicion)
    const copia = structuredClone(inicial)
    jugar(inicial, [0, 1, 0, 3])
    expect(inicial).toEqual(copia)
  })
})

describe('conteo de perseveraciones', () => {
  const disposicion = ['sol', 'luna', 'luna', 'sol']

  it('no cuenta nada la primera vez que se prueba un par', () => {
    expect(jugar(partidaCon(disposicion), [0, 1]).perseveraciones).toBe(0)
  })

  it('cuenta volver a probar un par que ya había fallado', () => {
    const despues = jugar(partidaCon(disposicion), [0, 1, 0, 1])
    expect(despues.perseveraciones).toBe(1)
    expect(despues.intentos).toBe(2)
  })

  it('cuenta el par repetido aunque se toque en el orden contrario', () => {
    expect(jugar(partidaCon(disposicion), [0, 1, 1, 0]).perseveraciones).toBe(1)
  })

  it('suma una perseveración por cada repetición, no una sola', () => {
    expect(jugar(partidaCon(disposicion), [0, 1, 0, 1, 1, 0]).perseveraciones).toBe(2)
  })

  it('no confunde un par nuevo que comparte una carta con otro ya fallado', () => {
    // 0-1 falla; 0-2 es un par distinto y no es repetición.
    expect(jugar(partidaCon(disposicion), [0, 1, 0, 2]).perseveraciones).toBe(0)
  })

  it('no cuenta el dedo que resbala sobre la misma casilla', () => {
    const despues = jugar(partidaCon(disposicion), [0, 0, 0, 0])
    expect(despues.perseveraciones).toBe(0)
    expect(despues.intentos).toBe(0)
  })

  it('deja el turno repetido marcado en el historial para poder auditarlo', () => {
    const despues = jugar(partidaCon(disposicion), [0, 1, 0, 1])
    expect(despues.historial).toEqual([
      { a: 0, b: 1, acierto: false, repetido: false },
      { a: 0, b: 1, acierto: false, repetido: true },
    ])
  })

  it('el historial registra un turno por cada par destapado', () => {
    const despues = jugar(partidaCon(disposicion), [0, 1, 0, 3, 1, 2])
    expect(despues.historial.length).toBe(despues.intentos)
    expect(despues.historial.filter((t) => t.acierto).length).toBe(2)
  })
})

describe('umbral de turnos', () => {
  it('crece con el tamaño del tablero', () => {
    expect(umbralDeIntentos(2)).toBe(4)
    expect(umbralDeIntentos(3)).toBe(6)
    expect(umbralDeIntentos(4)).toBe(7)
    expect(umbralDeIntentos(5)).toBe(9)
    expect(umbralDeIntentos(6)).toBe(10)
  })

  it('siempre deja margen sobre el juego perfecto', () => {
    for (let parejas = 2; parejas <= 8; parejas += 1) {
      expect(umbralDeIntentos(parejas)).toBeGreaterThan(parejas)
    }
  })

  it('queda por debajo del tanteo a ciegas', () => {
    // Destapando al azar, un tablero de n parejas necesita bastante más de
    // 2n turnos. El umbral no puede dejar pasar eso como acierto.
    for (let parejas = 2; parejas <= 8; parejas += 1) {
      expect(umbralDeIntentos(parejas)).toBeLessThanOrEqual(parejas * 2)
    }
  })
})

describe('techo de turnos', () => {
  const disposicion = ['sol', 'luna', 'luna', 'sol']

  it('es el doble del umbral', () => {
    for (let parejas = 2; parejas <= 6; parejas += 1) {
      expect(limiteDeIntentos(parejas)).toBe(umbralDeIntentos(parejas) * 2)
    }
  })

  it('levanta el tablero aunque queden parejas sin encontrar', () => {
    // Ocho turnos fallidos seguidos en un tablero de dos parejas.
    let estado = partidaCon(disposicion)
    for (let vuelta = 0; vuelta < 8 && !estado.terminado; vuelta += 1) {
      estado = jugar(estado, [0, 1])
    }
    expect(estado.intentos).toBe(limiteDeIntentos(2))
    expect(estado.terminado).toBe(true)
    expect(estado.parejasResueltas).toBe(0)
  })

  it('un tablero levantado por agotamiento no cuenta como acierto', () => {
    let estado = partidaCon(disposicion)
    while (!estado.terminado) estado = jugar(estado, [0, 1])
    const resultado = calificarTablero(estado)
    expect(resultado.completado).toBe(false)
    expect(resultado.acierto).toBe(false)
  })

  it('ningún tablero puede quedarse jugando para siempre', () => {
    for (let semilla = 1; semilla <= 25; semilla += 1) {
      const parejas = 2 + (semilla % 5)
      const palabras = Array.from({ length: parejas }, (_, i) => `p${i}`)
      let estado = iniciarPartida(palabras, azarFijo(semilla))
      const azar = azarFijo(semilla * 31)

      // Juego a ciegas: toca casillas al azar sin recordar nada.
      let vueltas = 0
      while (!estado.terminado && vueltas < 5000) {
        vueltas += 1
        if (estado.abiertas.length === 2) {
          estado = cerrarTurno(estado)
          continue
        }
        estado = tocar(estado, Math.floor(azar() * estado.cartas.length))
      }
      expect(estado.terminado).toBe(true)
      expect(estado.intentos).toBeLessThanOrEqual(limiteDeIntentos(parejas))
    }
  })
})

describe('calificación del tablero', () => {
  const disposicion = ['sol', 'luna', 'luna', 'sol']

  it('acierta cuando lo completa dentro del presupuesto de turnos', () => {
    const final = jugar(partidaCon(disposicion), [0, 3, 1, 2])
    expect(calificarTablero(final)).toEqual({
      acierto: true,
      completado: true,
      parejas: 2,
      intentos: 2,
      perseveraciones: 0,
      umbral: 4,
    })
  })

  it('no acierta cuando se pasa del presupuesto', () => {
    // Cinco turnos en un tablero de dos parejas: por encima del umbral de 4.
    const final = jugar(partidaCon(disposicion), [0, 1, 0, 1, 0, 2, 1, 2, 0, 3])
    expect(final.terminado).toBe(true)
    expect(final.intentos).toBe(5)
    expect(calificarTablero(final).acierto).toBe(false)
  })

  it('no acierta un tablero a medio terminar', () => {
    const medias = jugar(partidaCon(disposicion), [0, 3])
    expect(calificarTablero(medias).acierto).toBe(false)
  })

  it('informa las perseveraciones sin que tumben el acierto por sí solas', () => {
    // Repite el par 0-1, lo cual gasta un turno, y aun así cabe en el umbral.
    const final = jugar(partidaCon(disposicion), [0, 1, 0, 1, 0, 3, 1, 2])
    const resultado = calificarTablero(final)
    expect(resultado.perseveraciones).toBe(1)
    expect(resultado.intentos).toBe(4)
    expect(resultado.acierto).toBe(true)
  })

  it('cuenta bien las parejas de un tablero grande', () => {
    const partida = iniciarPartida(['a', 'b', 'c', 'd', 'e', 'f'], azarFijo(9))
    expect(calificarTablero(partida).parejas).toBe(6)
    expect(calificarTablero(partida).umbral).toBe(10)
  })
})

describe('partida completa jugada con memoria perfecta', () => {
  it('resuelve cualquier tablero dentro del umbral', () => {
    for (let semilla = 1; semilla <= 40; semilla += 1) {
      const parejas = 2 + (semilla % 5)
      const palabras = Array.from({ length: parejas }, (_, i) => `p${i}`)
      let estado = iniciarPartida(palabras, azarFijo(semilla))

      // Estrategia con memoria perfecta: recuerda toda carta ya oída y
      // empareja en cuanto conoce las dos mitades.
      const conocidas = new Map<number, number>()
      let vueltas = 0

      while (!estado.terminado && vueltas < 200) {
        vueltas += 1
        if (estado.abiertas.length === 2) {
          estado = cerrarTurno(estado)
          continue
        }

        const ocultas = estado.cartas.filter((c) => c.estado === 'oculta')
        const conocidaCompleta = ocultas.find((c) => {
          const gemela = conocidas.get(c.pareja)
          return gemela !== undefined && gemela !== c.indice
        })

        if (conocidaCompleta !== undefined && estado.abiertas.length === 0) {
          const gemela = conocidas.get(conocidaCompleta.pareja) as number
          estado = tocar(estado, conocidaCompleta.indice)
          estado = tocar(estado, gemela)
          continue
        }

        const siguiente = ocultas.find((c) => !conocidas.has(c.pareja))
          ?? (ocultas[0] as (typeof ocultas)[number])
        conocidas.set(siguiente.pareja, siguiente.indice)
        estado = tocar(estado, siguiente.indice)
      }

      const resultado = calificarTablero(estado)
      expect(estado.terminado).toBe(true)
      expect(resultado.perseveraciones).toBe(0)
      expect(resultado.acierto).toBe(true)
    }
  })
})
