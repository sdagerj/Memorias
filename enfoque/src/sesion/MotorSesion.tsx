import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Amplitud } from '../ejercicios/Amplitud'
import { Alfabetico } from '../ejercicios/Alfabetico'
import { Fluidez } from '../ejercicios/Fluidez'
import { Boton } from '../ui/Boton'
import { Tarjeta } from '../ui/Tarjeta'
import { Pantalla } from '../ui/Pantalla'
import { planDeSesion, nombreDePaso, ejercicioDePaso, type PasoSesion } from './plan'
import {
  evaluarCaida,
  evaluarTiempo,
  alcanzaParaOtroEjercicio,
  estadoDeSesion,
} from '../nucleo/fatiga'
import type { ResultadoDeEjercicio } from '../ejercicios/contrato'
import type { MotivoCierre } from '../nucleo/tipos'
import { abrirSesion, cerrarSesion, guardarResultado } from '../datos/repositorio'
import { fechaLocal } from '../datos/db'
import type { Ejercicio } from '../nucleo/tipos'

interface Props {
  numeroSesion: number
  velocidadVoz: number
  voz: SpeechSynthesisVoice | undefined
  usarMicrofono: boolean
  alSalir: () => void
}

interface Terminado {
  nombre: string
  resumen: string
}

export function MotorSesion({
  numeroSesion,
  velocidadVoz,
  voz,
  usarMicrofono,
  alSalir,
}: Props) {
  const plan = useMemo(() => planDeSesion(numeroSesion), [numeroSesion])

  const [indice, setIndice] = useState(0)
  const [terminados, setTerminados] = useState<Terminado[]>([])
  const [propuesta, setPropuesta] = useState('')
  const [cerrada, setCerrada] = useState<MotivoCierre | null>(null)

  const sesionId = useRef<number | null>(null)
  const inicio = useRef(Date.now())
  const aciertosSesion = useRef<boolean[]>([])

  useEffect(() => {
    let vivo = true
    abrirSesion(inicio.current).then((id) => {
      if (vivo) sesionId.current = id
    })
    return () => {
      vivo = false
    }
  }, [])

  const finalizar = useCallback(
    (motivo: MotivoCierre) => {
      setCerrada(motivo)
      const id = sesionId.current
      if (id !== null) void cerrarSesion(id, motivo)
    },
    [],
  )

  // Vigilancia del reloj. Corta en firme a los dieciocho minutos, sin
  // preguntar: es el único punto de la aplicación que no se negocia.
  useEffect(() => {
    if (cerrada !== null) return
    const id = window.setInterval(() => {
      const transcurrido = Date.now() - inicio.current
      if (estadoDeSesion(transcurrido) === 'agotado') {
        finalizar('tiempo')
        return
      }
      const senal = evaluarTiempo(transcurrido)
      if (senal.motivo !== '') setPropuesta(senal.motivo)
    }, 5000)
    return () => window.clearInterval(id)
  }, [cerrada, finalizar])

  const alTerminarEjercicio = useCallback(
    (resultado: ResultadoDeEjercicio) => {
      const id = sesionId.current
      const momento = Date.now()

      if (id !== null) {
        void guardarResultado({
          sesionId: id,
          ejercicio: resultado.ejercicio as Ejercicio,
          fecha: fechaLocal(momento),
          momento,
          duracionMs: resultado.duracionMs,
          metricas: resultado.metricas,
          ...(resultado.consigna !== undefined ? { consigna: resultado.consigna } : {}),
          ...(resultado.palabras !== undefined ? { palabras: resultado.palabras } : {}),
        })
      }

      aciertosSesion.current.push(...resultado.aciertos)
      setTerminados((previos) => [
        ...previos,
        { nombre: nombreDePaso(plan[indice] as PasoSesion), resumen: resumirMetricas(resultado) },
      ])

      const transcurrido = momento - inicio.current
      const siguiente = indice + 1

      if (siguiente >= plan.length) {
        finalizar('completada')
        return
      }

      const proximo = plan[siguiente] as PasoSesion
      if (!alcanzaParaOtroEjercicio(transcurrido, ejercicioDePaso(proximo))) {
        finalizar('tiempo')
        return
      }

      const caida = evaluarCaida(aciertosSesion.current)
      if (caida.sugerirParar) {
        setPropuesta(caida.motivo)
      }

      setIndice(siguiente)
    },
    [indice, plan, finalizar],
  )

  if (cerrada !== null) {
    return (
      <Pantalla titulo="Sesión terminada">
        <Tarjeta>
          <p className="text-[1.125rem] leading-relaxed text-texto-suave">{mensajeDeCierre(cerrada)}</p>
          <ul className="mt-7 space-y-3.5">
            {terminados.map((t, i) => (
              <li
                key={i}
                className="flex justify-between gap-4 border-b border-borde-suave pb-3 last:border-0"
              >
                <span className="font-medium">{t.nombre}</span>
                <span className="tabular-nums text-texto-suave">{t.resumen}</span>
              </li>
            ))}
          </ul>
          <Boton onClick={alSalir} ancho className="mt-8">
            Volver al inicio
          </Boton>
        </Tarjeta>
      </Pantalla>
    )
  }

  const paso = plan[indice] as PasoSesion
  const comunes = { alTerminar: alTerminarEjercicio, velocidadVoz, voz, usarMicrofono }

  return (
    <Pantalla>
      {propuesta !== '' && (
        <Tarjeta className="mb-5 border-acento-borde bg-acento-suave">
          <p className="text-[1.125rem] leading-relaxed">{propuesta}</p>
          <div className="mt-4 flex gap-3">
            <Boton onClick={() => finalizar('usuaria')} ancho>
              Terminar aquí
            </Boton>
            <Boton tono="secundario" onClick={() => setPropuesta('')} ancho>
              Seguir
            </Boton>
          </div>
        </Tarjeta>
      )}

      {/* La clave fuerza a React a montar un componente nuevo en cada paso,
          de modo que el estado interno del ejercicio anterior no se filtre. */}
      {paso.tipo === 'amplitud' && (
        <Amplitud key={`amplitud-${indice}`} variante={paso.variante} {...comunes} />
      )}
      {paso.tipo === 'alfabetico' && <Alfabetico key={`alfabetico-${indice}`} {...comunes} />}
      {paso.tipo === 'fluidez' && (
        <Fluidez
          key={`fluidez-${indice}`}
          tipo={paso.subtipo}
          consigna={paso.consigna}
          {...comunes}
        />
      )}

      <p className="mt-7 text-center text-[1rem] text-texto-tenue">
        {indice + 1} de {plan.length}
      </p>
    </Pantalla>
  )
}

function resumirMetricas(resultado: ResultadoDeEjercicio): string {
  const m = resultado.metricas
  if (m.spanMaximo !== undefined) return `${m.spanMaximo} elementos`
  if (m.longitudMaxima !== undefined) return `${m.longitudMaxima} palabras`
  if (m.validas !== undefined) return `${m.validas} palabras`
  return ''
}

function mensajeDeCierre(motivo: MotivoCierre): string {
  switch (motivo) {
    case 'completada':
      return 'Completaste la sesión de hoy.'
    case 'tiempo':
      return 'Se cumplió el tiempo de la sesión. Lo de hoy quedó guardado.'
    case 'fatiga':
      return 'Paramos aquí. Lo de hoy quedó guardado.'
    case 'usuaria':
      return 'Paramos aquí. Lo de hoy quedó guardado.'
  }
}
