import { useCallback, useEffect, useRef, useState } from 'react'
import { Boton } from '../ui/Boton'
import { Escena, clasesCampo } from '../ui/Escena'
import { clasificarPalabras, calcularMetricas, resolverPendiente } from '../nucleo/fluidez/puntuar'
import { agruparEnClusters, mismoGrupoFonologico } from '../nucleo/fluidez/clusters'
import { distribuirEnBloques, DURACION_PRUEBA_MS } from '../nucleo/fluidez/bloques'
import { interpretarPalabras } from '../nucleo/interpretar'
import { raiz } from '../nucleo/normalizar'
import {
  perteneceACategoria,
  agrupadorSemantico,
  empiezaPorLetra,
  consignaSemantica,
  consignaFonologica,
} from '../contenido/consignas'
import { decir, callar } from '../audio/voz'
import { escuchar, escuchaDisponible, type SesionEscucha } from '../audio/escucha'
import type { PropsEjercicio } from './contrato'
import type { PalabraProducida } from '../nucleo/tipos'

interface Props extends PropsEjercicio {
  tipo: 'semantica' | 'fonologica'
  /** Identificador de categoría, o letra en la variante fonológica. */
  consigna: string
}

type Fase = 'listo' | 'corriendo' | 'revisando' | 'guardando'

export function Fluidez({
  tipo,
  consigna,
  alTerminar,
  velocidadVoz,
  voz,
  usarMicrofono,
}: Props) {
  const [fase, setFase] = useState<Fase>('listo')
  const [palabras, setPalabras] = useState<PalabraProducida[]>([])
  const [restante, setRestante] = useState(DURACION_PRUEBA_MS)
  const [texto, setTexto] = useState('')
  const [avisoMicrofono, setAvisoMicrofono] = useState('')

  const inicioEjercicio = useRef(Date.now())
  const inicioPrueba = useRef(0)
  const sesionEscucha = useRef<SesionEscucha | null>(null)
  const campo = useRef<HTMLInputElement>(null)

  const enunciado =
    tipo === 'semantica' ? consignaSemantica(consigna) : consignaFonologica(consigna)

  const cumpleConsigna = useCallback(
    (palabra: string): boolean | null =>
      tipo === 'semantica'
        ? perteneceACategoria(consigna, palabra)
        : empiezaPorLetra(consigna, palabra),
    [tipo, consigna],
  )

  const detenerEscucha = useCallback(() => {
    sesionEscucha.current?.detener()
    sesionEscucha.current = null
  }, [])

  useEffect(() => {
    return () => {
      callar()
      detenerEscucha()
    }
  }, [detenerEscucha])

  /** Agrega palabras nuevas conservando el momento exacto en que se dijeron. */
  const agregar = useCallback((entrada: string) => {
    const tMs = Date.now() - inicioPrueba.current
    const nuevas = interpretarPalabras(entrada)
      .filter((p) => raiz(p) !== '')
      .map<PalabraProducida>((p) => ({ texto: p, tMs, clase: 'pendiente' }))
    if (nuevas.length > 0) setPalabras((previas) => [...previas, ...nuevas])
  }, [])

  const terminarPrueba = useCallback(() => {
    detenerEscucha()
    setFase('revisando')
  }, [detenerEscucha])

  // Cronómetro de sesenta segundos.
  useEffect(() => {
    if (fase !== 'corriendo') return
    const id = window.setInterval(() => {
      const queda = DURACION_PRUEBA_MS - (Date.now() - inicioPrueba.current)
      if (queda <= 0) {
        setRestante(0)
        terminarPrueba()
      } else {
        setRestante(queda)
      }
    }, 200)
    return () => window.clearInterval(id)
  }, [fase, terminarPrueba])

  // Clasifica al pasar a revisión: las repeticiones y las intrusiones ya
  // quedan resueltas, y solo se le pregunta a la usuaria por lo desconocido.
  useEffect(() => {
    if (fase !== 'revisando') return
    setPalabras((previas) => clasificarPalabras(previas, cumpleConsigna))
  }, [fase, cumpleConsigna])

  const empezar = useCallback(async () => {
    await decir(enunciado, { voz, velocidad: velocidadVoz })
    inicioPrueba.current = Date.now()
    setRestante(DURACION_PRUEBA_MS)
    setFase('corriendo')

    if (usarMicrofono && escuchaDisponible()) {
      sesionEscucha.current = escuchar({
        continuo: true,
        alReconocer: agregar,
        alFallar: setAvisoMicrofono,
      })
      if (sesionEscucha.current === null) window.setTimeout(() => campo.current?.focus(), 50)
    } else {
      window.setTimeout(() => campo.current?.focus(), 50)
    }
  }, [enunciado, voz, velocidadVoz, usarMicrofono, agregar])

  const cerrar = useCallback(() => setFase('guardando'), [])

  useEffect(() => {
    if (fase !== 'guardando') return

    const metricas = calcularMetricas(palabras)
    const agrupar =
      tipo === 'semantica' ? agrupadorSemantico(consigna) : mismoGrupoFonologico
    const clusters = agruparEnClusters(palabras, agrupar)
    const bloques = distribuirEnBloques(palabras)

    alTerminar({
      ejercicio: tipo === 'semantica' ? 'fluidez-semantica' : 'fluidez-fonologica',
      duracionMs: Date.now() - inicioEjercicio.current,
      consigna,
      palabras,
      metricas: {
        validas: metricas.validas,
        perseveraciones: metricas.perseveraciones,
        intrusiones: metricas.intrusiones,
        totalProducidas: metricas.totalProducidas,
        numeroClusters: clusters.numeroClusters,
        tamanoMedioCluster: clusters.tamanoMedio,
        saltos: clusters.saltos,
        bloque1: bloques[0]?.validas ?? 0,
        bloque2: bloques[1]?.validas ?? 0,
        bloque3: bloques[2]?.validas ?? 0,
        bloque4: bloques[3]?.validas ?? 0,
      },
      // La fluidez no es adaptativa: no hay aciertos que alimenten la fatiga.
      aciertos: [],
    })
  }, [fase, palabras, tipo, consigna, alTerminar])

  const pendientes = palabras
    .map((palabra, indice) => ({ palabra, indice }))
    .filter(({ palabra }) => palabra.clase === 'pendiente')

  const segundos = Math.ceil(restante / 1000)

  return (
    <Escena
      titulo={enunciado}
      {...(fase === 'listo'
        ? { instruccion: 'Tienes un minuto para decir todas las que puedas. No importa el orden.' }
        : {})}
    >
      {fase === 'listo' && (
        <Boton onClick={empezar} ancho>
          Empezar
        </Boton>
      )}

      {fase === 'corriendo' && (
        <>
          {/* El tiempo se muestra como una barra que se vacía despacio y sin
              cambio de color al final. Una cuenta regresiva que se pone roja
              es presión pura, y aquí eso está descartado por diseño. */}
          <div className="mx-auto mb-7 h-1 w-full max-w-[13rem] overflow-hidden rounded-full bg-borde-suave">
            <div
              className="h-full rounded-full bg-acento-borde transition-[width] duration-200 ease-linear"
              style={{ width: `${Math.max(0, (restante / DURACION_PRUEBA_MS) * 100)}%` }}
            />
          </div>
          <p className="cifra mb-8 text-[3.75rem] leading-none" aria-live="off">
            {segundos}
          </p>

          <input
            ref={campo}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              agregar(texto)
              setTexto('')
            }}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Escribe una palabra y pulsa Enter"
            placeholder="Una palabra y Enter"
            className={clasesCampo()}
          />
          <p className="mt-4 text-[1rem] text-texto-tenue">
            {palabras.length === 0 ? 'Van cero' : `Van ${palabras.length}`}
          </p>
          {avisoMicrofono !== '' && (
            <p className="mt-3 text-[1rem] text-texto-tenue">
              {avisoMicrofono} Puedes escribirlas.
            </p>
          )}
          <Boton tono="discreto" onClick={terminarPrueba} ancho className="mt-6">
            Terminar antes
          </Boton>
        </>
      )}

      {fase === 'revisando' &&
        (pendientes.length === 0 ? (
          <>
            <p className="text-[1.125rem] text-texto-suave">Listo. Ya quedó guardado.</p>
            <Boton onClick={cerrar} ancho className="mt-9">
              Continuar
            </Boton>
          </>
        ) : (
          <>
            <p className="mx-auto max-w-[22rem] text-[1.125rem] leading-relaxed text-texto-suave">
              Estas no están en mi lista. ¿Cuentan?
            </p>
            <ul className="mt-7 space-y-2.5 text-left">
              {pendientes.map(({ palabra, indice }) => (
                <li
                  key={indice}
                  className="flex items-center gap-2.5 rounded-suave border border-borde-suave bg-superficie py-2 pl-5 pr-2"
                >
                  <span className="flex-1 text-[1.25rem] font-medium">{palabra.texto}</span>
                  <Boton
                    tono="secundario"
                    className="min-h-12 px-5 py-2 text-[1.0625rem]"
                    onClick={() => setPalabras((p) => resolverPendiente(p, indice, true))}
                  >
                    Sí
                  </Boton>
                  <Boton
                    tono="discreto"
                    className="min-h-12 px-5 py-2 text-[1.0625rem]"
                    onClick={() => setPalabras((p) => resolverPendiente(p, indice, false))}
                  >
                    No
                  </Boton>
                </li>
              ))}
            </ul>
          </>
        ))}
    </Escena>
  )
}
