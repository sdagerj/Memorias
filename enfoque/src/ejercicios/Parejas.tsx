import { useCallback, useEffect, useRef, useState } from 'react'
import { Boton } from '../ui/Boton'
import { Escena } from '../ui/Escena'
import {
  iniciarEscalera,
  registrarEnsayo,
  CONFIG_PAREJAS,
  type EstadoEscalera,
} from '../nucleo/escalera'
import {
  iniciarPartida,
  tocar,
  cerrarTurno,
  calificarTablero,
  type EstadoParejas,
} from '../nucleo/parejas'
import { generarLista } from '../nucleo/alfabetico'
import { PALABRAS_ALFABETICO } from '../contenido/palabras-alfabetico'
import { decir, callar } from '../audio/voz'
import type { PropsEjercicio } from './contrato'

const TITULO = 'Parejas al oído'
const INSTRUCCION =
  'Toca una casilla y escucha su palabra. Busca las dos casillas que dicen lo mismo.'

/** Pausa antes de volver a tapar un par que no coincidió. */
const PAUSA_CIERRE_MS = 800
/** Respiro entre un tablero terminado y el siguiente. */
const PAUSA_TABLERO_MS = 900

type Fase = 'listo' | 'jugando' | 'guardando'

function esperar(ms: number): Promise<void> {
  return new Promise((resolver) => window.setTimeout(resolver, ms))
}

export function Parejas({ alTerminar, velocidadVoz, voz }: PropsEjercicio) {
  const [escalera, setEscalera] = useState<EstadoEscalera>(() => iniciarEscalera(CONFIG_PAREJAS))
  const [fase, setFase] = useState<Fase>('listo')
  const [partida, setPartida] = useState<EstadoParejas | null>(null)

  // Espejo de la escalera. El siguiente tablero se reparte desde una
  // continuación asíncrona, y calcular el nivel dentro del actualizador de
  // estado dispararía el reparto dos veces en modo estricto.
  const escaleraRef = useRef(escalera)

  const aciertos = useRef<boolean[]>([])
  const inicioEjercicio = useRef(Date.now())
  const abortar = useRef<AbortController | null>(null)
  const vivo = useRef(true)

  // Espejo del estado de la partida. El dictado es asíncrono y entre el
  // toque y el final de la palabra puede llegar otro toque: el `ref` es la
  // única fuente de verdad que no se queda atrás.
  const partidaRef = useRef<EstadoParejas | null>(null)
  /** Cierra la puerta mientras suena una palabra: las palabras no se pisan. */
  const ocupado = useRef(false)

  const totales = useRef({ intentos: 0, perseveraciones: 0, tableros: 0 })

  useEffect(() => {
    vivo.current = true
    return () => {
      vivo.current = false
      abortar.current?.abort()
      callar()
    }
  }, [])

  const repartir = useCallback((parejas: number) => {
    const palabras = generarLista(PALABRAS_ALFABETICO, parejas)
    const nueva = iniciarPartida(palabras)
    partidaRef.current = nueva
    setPartida(nueva)
    setFase('jugando')
  }, [])

  const empezar = useCallback(() => repartir(escaleraRef.current.nivel), [repartir])

  const guardar = useCallback((estado: EstadoParejas) => {
    const resultado = calificarTablero(estado)
    aciertos.current.push(resultado.acierto)
    totales.current = {
      intentos: totales.current.intentos + resultado.intentos,
      perseveraciones: totales.current.perseveraciones + resultado.perseveraciones,
      tableros: totales.current.tableros + 1,
    }

    const siguiente = registrarEnsayo(escaleraRef.current, resultado.acierto, CONFIG_PAREJAS)
    escaleraRef.current = siguiente
    setEscalera(siguiente)

    if (siguiente.terminado) {
      setFase('guardando')
      return
    }
    window.setTimeout(() => {
      if (vivo.current) repartir(siguiente.nivel)
    }, PAUSA_TABLERO_MS)
  }, [repartir])

  const tocarCasilla = useCallback(
    async (indice: number) => {
      if (ocupado.current) return
      const actual = partidaRef.current
      if (actual === null) return

      const siguiente = tocar(actual, indice)
      // `tocar` devuelve el mismo objeto cuando el toque no cambia nada:
      // casilla ya resuelta, tercera carta del turno o dedo repetido.
      if (siguiente === actual) return

      ocupado.current = true
      partidaRef.current = siguiente
      setPartida(siguiente)

      const control = new AbortController()
      abortar.current = control

      const palabra = siguiente.cartas[indice]?.palabra ?? ''
      await decir(palabra, { voz, velocidad: velocidadVoz, senal: control.signal })
      if (!vivo.current || control.signal.aborted) return

      // Turno fallido: las dos quedaron a la vista y hay que volver a taparlas.
      if (siguiente.abiertas.length === 2) {
        await esperar(PAUSA_CIERRE_MS)
        if (!vivo.current) return
        const cerrada = cerrarTurno(partidaRef.current as EstadoParejas)
        partidaRef.current = cerrada
        setPartida(cerrada)
      }

      ocupado.current = false
      if (siguiente.terminado) guardar(siguiente)
    },
    [voz, velocidadVoz, guardar],
  )

  // El cierre va en un efecto, y no dentro de `guardar`, para no llamar al
  // motor de sesión durante el renderizado del propio ejercicio.
  useEffect(() => {
    if (fase !== 'guardando') return
    alTerminar({
      ejercicio: 'parejas-audio',
      duracionMs: Date.now() - inicioEjercicio.current,
      consigna: TITULO,
      metricas: {
        parejasMaximas: escalera.spanMaximo,
        tableros: totales.current.tableros,
        intentos: totales.current.intentos,
        perseveraciones: totales.current.perseveraciones,
        aciertos: aciertos.current.filter(Boolean).length,
      },
      aciertos: aciertos.current,
    })
  }, [fase, alTerminar, escalera.spanMaximo])

  return (
    <Escena titulo={TITULO} instruccion={INSTRUCCION}>
      {fase === 'listo' && (
        <Boton onClick={empezar} ancho>
          Empezar el tablero
        </Boton>
      )}

      {fase !== 'listo' && partida !== null && (
        <Tablero partida={partida} alTocar={(i) => void tocarCasilla(i)} />
      )}
    </Escena>
  )
}

interface PropsTablero {
  partida: EstadoParejas
  alTocar: (indice: number) => void
}

/**
 * El tablero.
 *
 * Las casillas no muestran nunca la palabra: ni tapadas, ni destapadas, ni
 * resueltas. Verla escrita convertiría el ejercicio en uno de memoria
 * visual, que es justo lo que no hay que entrenar. Una casilla destapada se
 * marca con un punto que late mientras suena, y una resuelta se queda
 * rellena y en calma.
 */
function Tablero({ partida, alTocar }: PropsTablero) {
  return (
    <div
      className="mx-auto flex max-w-[23rem] flex-wrap justify-center gap-3"
      role="group"
      aria-label="Tablero de parejas"
    >
      {partida.cartas.map((carta) => {
        const resuelta = carta.estado === 'resuelta'
        const abierta = carta.estado === 'abierta'
        return (
          <button
            key={carta.indice}
            type="button"
            onClick={() => alTocar(carta.indice)}
            disabled={resuelta}
            aria-label={`Casilla ${carta.indice + 1}${
              resuelta ? ', pareja encontrada' : abierta ? ', sonando' : ''
            }`}
            className={[
              'flex h-20 w-20 items-center justify-center rounded-suave border',
              'transition-all duration-200 active:scale-[0.97]',
              'disabled:active:scale-100',
              resuelta
                ? 'border-acento-borde bg-acento-suave'
                : abierta
                  ? 'border-acento-borde bg-superficie shadow-[var(--shadow-realce)]'
                  : 'border-borde bg-superficie shadow-[var(--shadow-tarjeta)]',
            ].join(' ')}
          >
            <span
              aria-hidden="true"
              className={[
                'rounded-full transition-all duration-200',
                resuelta
                  ? 'h-3.5 w-3.5 bg-acento'
                  : abierta
                    ? 'h-3.5 w-3.5 animate-pulse bg-acento-borde'
                    : 'h-2 w-2 bg-borde',
              ].join(' ')}
            />
          </button>
        )
      })}
    </div>
  )
}
