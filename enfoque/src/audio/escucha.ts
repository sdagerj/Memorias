/**
 * Reconocimiento de voz del navegador, para responder hablando.
 *
 * Advertencia que la aplicación muestra en ajustes y que conviene tener
 * presente al leer este archivo: a diferencia del resto de la aplicación,
 * esto NO ocurre dentro del dispositivo. Safari y Chrome envían el audio a
 * servidores de Apple o de Google para transcribirlo. La transcripción
 * resultante sí se guarda solo aquí, pero el audio viaja.
 *
 * Por eso todo ejercicio ofrece siempre el teclado como alternativa y la
 * usuaria puede desactivar la voz por completo desde ajustes.
 */

type ConstructorReconocimiento = new () => SpeechRecognitionCompatible

interface SpeechRecognitionCompatible extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((evento: SpeechRecognitionEventLike) => void) | null
  onerror: ((evento: Event) => void) | null
  onend: (() => void) | null
}

interface SpeechRecognitionEventLike {
  resultIndex: number
  results: {
    length: number
    [indice: number]: {
      isFinal: boolean
      length: number
      [alternativa: number]: { transcript: string; confidence: number }
    }
  }
}

function constructorDisponible(): ConstructorReconocimiento | undefined {
  if (typeof window === 'undefined') return undefined
  const w = window as unknown as {
    SpeechRecognition?: ConstructorReconocimiento
    webkitSpeechRecognition?: ConstructorReconocimiento
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

export function escuchaDisponible(): boolean {
  return constructorDisponible() !== undefined
}

export interface OpcionesEscucha {
  /** Se llama con cada fragmento reconocido como definitivo. */
  alReconocer: (texto: string) => void
  /** Se llama con el texto provisional, para dar señal de que está oyendo. */
  alProvisional?: (texto: string) => void
  /** Se llama si el reconocimiento se corta por su cuenta. */
  alTerminar?: () => void
  /** Se llama ante un error, con un mensaje ya redactado en español. */
  alFallar?: (mensaje: string) => void
  /** `true` para dictado largo, como los sesenta segundos de fluidez. */
  continuo?: boolean
}

export interface SesionEscucha {
  detener: () => void
}

const MENSAJES_ERROR: Record<string, string> = {
  'not-allowed': 'El navegador no dio permiso para usar el micrófono.',
  'service-not-allowed': 'El navegador no dio permiso para usar el micrófono.',
  'no-speech': 'No se escuchó nada.',
  'audio-capture': 'No se encontró un micrófono disponible.',
  network: 'El reconocimiento de voz necesita conexión a internet.',
}

/**
 * Arranca el reconocimiento y devuelve el modo de detenerlo.
 *
 * En modo continuo se reinicia solo cuando el navegador lo corta, cosa que
 * Safari hace cada pocos segundos. Sin ese reinicio, una prueba de fluidez
 * de sesenta segundos perdería la mitad de las palabras.
 */
export function escuchar(opciones: OpcionesEscucha): SesionEscucha | null {
  const Constructor = constructorDisponible()
  if (!Constructor) return null

  let detenidoAdrede = false
  let reconocimiento: SpeechRecognitionCompatible | null = null

  const arrancar = () => {
    const instancia = new Constructor()
    reconocimiento = instancia
    instancia.lang = 'es-CO'
    instancia.continuous = opciones.continuo ?? false
    instancia.interimResults = opciones.alProvisional !== undefined
    instancia.maxAlternatives = 1

    instancia.onresult = (evento) => {
      for (let i = evento.resultIndex; i < evento.results.length; i += 1) {
        const resultado = evento.results[i]
        if (!resultado) continue
        const texto = resultado[0]?.transcript ?? ''
        if (resultado.isFinal) opciones.alReconocer(texto)
        else opciones.alProvisional?.(texto)
      }
    }

    instancia.onerror = (evento) => {
      const codigo = (evento as Event & { error?: string }).error ?? ''
      // Un silencio no es un error que valga la pena mostrar: en fluidez
      // verbal las pausas largas son parte normal de la prueba.
      if (codigo === 'no-speech' || codigo === 'aborted') return
      opciones.alFallar?.(MENSAJES_ERROR[codigo] ?? 'El micrófono no está disponible.')
    }

    instancia.onend = () => {
      if (detenidoAdrede) {
        opciones.alTerminar?.()
        return
      }
      if (opciones.continuo) {
        // Safari corta el reconocimiento cada pocos segundos. Se reanuda.
        try {
          arrancar()
        } catch {
          opciones.alTerminar?.()
        }
        return
      }
      opciones.alTerminar?.()
    }

    instancia.start()
  }

  try {
    arrancar()
  } catch {
    opciones.alFallar?.('No se pudo iniciar el micrófono.')
    return null
  }

  return {
    detener: () => {
      detenidoAdrede = true
      try {
        reconocimiento?.stop()
      } catch {
        reconocimiento?.abort()
      }
    },
  }
}
