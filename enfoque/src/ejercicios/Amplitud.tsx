import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Boton } from '../ui/Boton'
import { Escena, Puntos, clasesCampo } from '../ui/Escena'
import {
  iniciarEscalera,
  registrarEnsayo,
  CONFIG_DIGITOS,
  type EstadoEscalera,
} from '../nucleo/escalera'
import { calificarAmplitud, generarSerie, type VarianteAmplitud } from '../nucleo/digitos'
import { interpretarRespuesta } from '../nucleo/interpretar'
import { dictarSerie, callar } from '../audio/voz'
import { escuchar, escuchaDisponible, type SesionEscucha } from '../audio/escucha'
import type { PropsEjercicio } from './contrato'
import type { Ejercicio } from '../nucleo/tipos'

interface Props extends PropsEjercicio {
  variante: VarianteAmplitud
}

const TITULOS: Record<VarianteAmplitud, string> = {
  inversos: 'Al revés',
  creciente: 'De menor a mayor',
  'letras-numeros': 'Números y letras',
}

const INSTRUCCIONES: Record<VarianteAmplitud, string> = {
  inversos: 'Escucha la serie y repítela al revés, empezando por el último.',
  creciente: 'Escucha los números y ordénalos de menor a mayor.',
  'letras-numeros':
    'Escucha la serie. Responde primero los números de menor a mayor, y después las letras en orden alfabético.',
}

const EJERCICIO_DE: Record<VarianteAmplitud, Ejercicio> = {
  inversos: 'digitos-inversos',
  creciente: 'digitos-creciente',
  'letras-numeros': 'letras-numeros',
}

type Fase = 'listo' | 'dictando' | 'respondiendo' | 'guardando'

export function Amplitud({
  variante,
  alTerminar,
  velocidadVoz,
  voz,
  usarMicrofono,
}: Props) {
  const [escalera, setEscalera] = useState<EstadoEscalera>(() => iniciarEscalera(CONFIG_DIGITOS))
  const [fase, setFase] = useState<Fase>('listo')
  const [serie, setSerie] = useState<string[]>([])
  const [texto, setTexto] = useState('')
  const [avance, setAvance] = useState(0)
  const [avisoMicrofono, setAvisoMicrofono] = useState('')
  const [microfonoActivo, setMicrofonoActivo] = useState(false)

  const aciertos = useRef<boolean[]>([])
  const inicioEjercicio = useRef(Date.now())
  const inicioRespuesta = useRef(0)
  const abortar = useRef<AbortController | null>(null)
  const sesionEscucha = useRef<SesionEscucha | null>(null)
  const campo = useRef<HTMLInputElement>(null)

  const ejercicio = EJERCICIO_DE[variante]

  const detenerEscucha = useCallback(() => {
    sesionEscucha.current?.detener()
    sesionEscucha.current = null
    setMicrofonoActivo(false)
  }, [])

  // Limpia voz y micrófono si el motor desmonta el ejercicio por tiempo.
  useEffect(() => {
    return () => {
      abortar.current?.abort()
      callar()
      detenerEscucha()
    }
  }, [detenerEscucha])

  const presentar = useCallback(async () => {
    const nueva = generarSerie(variante, escalera.nivel)
    setSerie(nueva)
    setTexto('')
    setAvance(0)
    setFase('dictando')

    const control = new AbortController()
    abortar.current = control

    await dictarSerie(nueva, {
      voz,
      velocidad: velocidadVoz,
      senal: control.signal,
      alElemento: setAvance,
    })

    if (control.signal.aborted) return

    inicioRespuesta.current = Date.now()
    setFase('respondiendo')

    if (usarMicrofono && escuchaDisponible()) {
      sesionEscucha.current = escuchar({
        continuo: false,
        alReconocer: (dicho) => setTexto((previo) => `${previo} ${dicho}`.trim()),
        alFallar: (mensaje) => {
          setAvisoMicrofono(mensaje)
          setMicrofonoActivo(false)
        },
      })
      setMicrofonoActivo(sesionEscucha.current !== null)
      if (sesionEscucha.current === null) window.setTimeout(() => campo.current?.focus(), 50)
    } else {
      window.setTimeout(() => campo.current?.focus(), 50)
    }
  }, [escalera.nivel, variante, voz, velocidadVoz, usarMicrofono])

  const enviar = useCallback(() => {
    if (fase !== 'respondiendo') return
    detenerEscucha()

    const recibida = interpretarRespuesta(texto)
    const resultado = calificarAmplitud(serie, recibida, variante)
    aciertos.current.push(resultado.acierto)

    const siguiente = registrarEnsayo(escalera, resultado.acierto, CONFIG_DIGITOS)
    setEscalera(siguiente)
    setTexto('')

    if (siguiente.terminado) {
      setFase('guardando')
      return
    }
    setFase('listo')
  }, [fase, texto, serie, variante, escalera, detenerEscucha])

  // El cierre se hace en un efecto y no dentro de `enviar` para que el
  // componente no llame al motor durante su propio renderizado.
  useEffect(() => {
    if (fase !== 'guardando') return
    const total = aciertos.current.length
    const correctos = aciertos.current.filter(Boolean).length
    alTerminar({
      ejercicio,
      duracionMs: Date.now() - inicioEjercicio.current,
      consigna: TITULOS[variante],
      metricas: {
        spanMaximo: escalera.spanMaximo,
        ensayos: total,
        aciertos: correctos,
        nivelFinal: escalera.nivel,
      },
      aciertos: aciertos.current,
    })
  }, [fase, alTerminar, ejercicio, escalera.spanMaximo, escalera.nivel, variante])

  const instruccion = useMemo(() => INSTRUCCIONES[variante], [variante])

  return (
    <Escena titulo={TITULOS[variante]} instruccion={instruccion}>
      {fase === 'listo' && (
        <Boton onClick={presentar} ancho>
          Escuchar la serie
        </Boton>
      )}

      {fase === 'dictando' && (
        <Puntos total={serie.length} actual={avance} etiqueta="Escuchando…" />
      )}

      {fase === 'respondiendo' && (
        <div className="w-full">
          <input
            ref={campo}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') enviar()
            }}
            inputMode={variante === 'letras-numeros' ? 'text' : 'numeric'}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Tu respuesta"
            placeholder="Tu respuesta"
            className={clasesCampo({ variante: 'grande' })}
          />
          <Boton onClick={enviar} ancho className="mt-4">
            Confirmar
          </Boton>
          {avisoMicrofono !== '' ? (
            <p className="mt-4 text-[1rem] text-texto-tenue">
              {avisoMicrofono} Puedes responder con el teclado.
            </p>
          ) : (
            microfonoActivo && (
              <p className="mt-4 text-[1rem] text-texto-tenue">Puedes decirla en voz alta.</p>
            )
          )}
        </div>
      )}
    </Escena>
  )
}
