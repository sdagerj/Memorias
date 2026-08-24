import { useCallback, useEffect, useRef, useState } from 'react'
import { Boton } from '../ui/Boton'
import { Escena, Puntos, clasesCampo } from '../ui/Escena'
import {
  iniciarEscalera,
  registrarEnsayo,
  CONFIG_ALFABETICO,
  type EstadoEscalera,
} from '../nucleo/escalera'
import { generarLista, calificarAlfabetico } from '../nucleo/alfabetico'
import { interpretarPalabras } from '../nucleo/interpretar'
import { PALABRAS_ALFABETICO } from '../contenido/palabras-alfabetico'
import { dictarSerie, callar } from '../audio/voz'
import { escuchar, escuchaDisponible, type SesionEscucha } from '../audio/escucha'
import type { PropsEjercicio } from './contrato'

type Fase = 'listo' | 'dictando' | 'respondiendo' | 'guardando'

export function Alfabetico({ alTerminar, velocidadVoz, voz, usarMicrofono }: PropsEjercicio) {
  const [escalera, setEscalera] = useState<EstadoEscalera>(() =>
    iniciarEscalera(CONFIG_ALFABETICO),
  )
  const [fase, setFase] = useState<Fase>('listo')
  const [lista, setLista] = useState<string[]>([])
  const [texto, setTexto] = useState('')
  const [avance, setAvance] = useState(0)
  const [avisoMicrofono, setAvisoMicrofono] = useState('')

  const aciertos = useRef<boolean[]>([])
  const tiempos = useRef<number[]>([])
  const inicioEjercicio = useRef(Date.now())
  const inicioRespuesta = useRef(0)
  const abortar = useRef<AbortController | null>(null)
  const sesionEscucha = useRef<SesionEscucha | null>(null)
  const campo = useRef<HTMLTextAreaElement>(null)

  const detenerEscucha = useCallback(() => {
    sesionEscucha.current?.detener()
    sesionEscucha.current = null
  }, [])

  useEffect(() => {
    return () => {
      abortar.current?.abort()
      callar()
      detenerEscucha()
    }
  }, [detenerEscucha])

  const presentar = useCallback(async () => {
    const nueva = generarLista(PALABRAS_ALFABETICO, escalera.nivel)
    setLista(nueva)
    setTexto('')
    setAvance(0)
    setFase('dictando')

    const control = new AbortController()
    abortar.current = control

    await dictarSerie(nueva, {
      voz,
      velocidad: velocidadVoz,
      pausaMs: 700,
      senal: control.signal,
      alElemento: setAvance,
    })

    if (control.signal.aborted) return

    inicioRespuesta.current = Date.now()
    setFase('respondiendo')

    if (usarMicrofono && escuchaDisponible()) {
      sesionEscucha.current = escuchar({
        continuo: true,
        alReconocer: (dicho) => setTexto((previo) => `${previo} ${dicho}`.trim()),
        alFallar: setAvisoMicrofono,
      })
      if (sesionEscucha.current === null) window.setTimeout(() => campo.current?.focus(), 50)
    } else {
      window.setTimeout(() => campo.current?.focus(), 50)
    }
  }, [escalera.nivel, voz, velocidadVoz, usarMicrofono])

  const enviar = useCallback(() => {
    if (fase !== 'respondiendo') return
    detenerEscucha()

    const recibida = interpretarPalabras(texto)
    const resultado = calificarAlfabetico(lista, recibida)
    aciertos.current.push(resultado.acierto)
    tiempos.current.push(Date.now() - inicioRespuesta.current)

    const siguiente = registrarEnsayo(escalera, resultado.acierto, CONFIG_ALFABETICO)
    setEscalera(siguiente)
    setTexto('')
    setFase(siguiente.terminado ? 'guardando' : 'listo')
  }, [fase, texto, lista, escalera, detenerEscucha])

  useEffect(() => {
    if (fase !== 'guardando') return
    const total = aciertos.current.length
    const correctos = aciertos.current.filter(Boolean).length
    const ordenados = [...tiempos.current].sort((a, b) => a - b)
    const mediana = ordenados.length === 0
      ? 0
      : (ordenados[Math.floor(ordenados.length / 2)] as number)

    alTerminar({
      ejercicio: 'ordenamiento-alfabetico',
      duracionMs: Date.now() - inicioEjercicio.current,
      metricas: {
        longitudMaxima: escalera.spanMaximo,
        ensayos: total,
        aciertos: correctos,
        tiempoMedianoMs: mediana,
      },
      aciertos: aciertos.current,
    })
  }, [fase, alTerminar, escalera.spanMaximo])

  return (
    <Escena
      titulo="En orden alfabético"
      instruccion="Escucha las palabras y devuélvelas en orden alfabético."
    >
      {fase === 'listo' && (
        <Boton onClick={presentar} ancho>
          Escuchar las palabras
        </Boton>
      )}

      {fase === 'dictando' && (
        <Puntos total={lista.length} actual={avance} etiqueta="Escuchando…" />
      )}

      {fase === 'respondiendo' && (
        <div className="w-full">
          <textarea
            ref={campo}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={3}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Las palabras en orden alfabético"
            placeholder="Las palabras, separadas por espacios"
            className={`${clasesCampo()} resize-none`}
          />
          <Boton onClick={enviar} ancho className="mt-4">
            Confirmar
          </Boton>
          {avisoMicrofono !== '' && (
            <p className="mt-4 text-[1rem] text-texto-tenue">
              {avisoMicrofono} Puedes responder con el teclado.
            </p>
          )}
        </div>
      )}
    </Escena>
  )
}
