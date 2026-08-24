/**
 * Dictado de estímulos con la voz del dispositivo.
 *
 * Es la pieza que sostiene el principio de diseño de toda la aplicación: los
 * ejercicios de memoria de trabajo se ESCUCHAN, nunca se leen. Mostrar los
 * dígitos en pantalla entrenaría memoria visual, que está preservada, en vez
 * de la auditivo-verbal, que es la que hay que trabajar.
 *
 * Dos particularidades de Safari en iPhone que condicionan el diseño:
 *
 * 1. La primera emisión debe nacer de un toque de la usuaria. Por eso cada
 *    ensayo empieza con un botón «Escuchar» y nada se dicta solo.
 * 2. `getVoices()` puede devolver una lista vacía la primera vez y llenarse
 *    después, de forma asíncrona. Se espera al evento correspondiente.
 *
 * Todo ocurre dentro del dispositivo: la síntesis de voz no envía nada a
 * ningún servidor.
 */

/** Nombre hablado de cada letra, para que se lean como letras y no como sonidos. */
const LETRA_HABLADA: Record<string, string> = {
  A: 'a', B: 'be', C: 'ce', D: 'de', E: 'e', F: 'efe', G: 'ge', H: 'hache',
  I: 'i', J: 'jota', K: 'ka', L: 'ele', M: 'eme', N: 'ene', 'Ñ': 'eñe',
  O: 'o', P: 'pe', Q: 'cu', R: 'erre', S: 'ese', T: 'te', U: 'u', V: 'uve',
  W: 'doble ve', X: 'equis', Y: 'ye', Z: 'zeta',
}

export function vozDisponible(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

/** Espera a que el navegador termine de cargar la lista de voces. */
export function vocesEnEspanol(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolver) => {
    if (!vozDisponible()) {
      resolver([])
      return
    }

    const filtrar = () =>
      window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('es'))

    const inmediatas = filtrar()
    if (inmediatas.length > 0) {
      resolver(inmediatas)
      return
    }

    const alCargar = () => {
      window.speechSynthesis.removeEventListener('voiceschanged', alCargar)
      resolver(filtrar())
    }
    window.speechSynthesis.addEventListener('voiceschanged', alCargar)

    // Red de seguridad: algunos navegadores no emiten nunca el evento.
    window.setTimeout(() => resolver(filtrar()), 1200)
  })
}

/**
 * Prefiere una voz de español de Colombia, luego cualquier español
 * latinoamericano, y por último la primera disponible.
 */
export function elegirVoz(
  voces: SpeechSynthesisVoice[],
  preferida?: string,
): SpeechSynthesisVoice | undefined {
  if (preferida) {
    const exacta = voces.find((v) => v.name === preferida)
    if (exacta) return exacta
  }
  const orden = ['es-co', 'es-mx', 'es-us', 'es-ar', 'es-419', 'es-es']
  for (const etiqueta of orden) {
    const encontrada = voces.find((v) => v.lang.toLowerCase().startsWith(etiqueta))
    if (encontrada) return encontrada
  }
  return voces[0]
}

export interface OpcionesDictado {
  voz?: SpeechSynthesisVoice | undefined
  /** Velocidad de habla. 1 es la normal del sistema. */
  velocidad?: number
  /** Pausa entre elementos de una serie, en milisegundos. */
  pausaMs?: number
  /** Se llama al empezar cada elemento, para animar el indicador de avance. */
  alElemento?: (indice: number) => void
  /** Permite abortar el dictado a mitad de camino. */
  senal?: AbortSignal
}

function esperar(ms: number, senal?: AbortSignal): Promise<void> {
  return new Promise((resolver) => {
    const id = window.setTimeout(resolver, ms)
    senal?.addEventListener('abort', () => {
      window.clearTimeout(id)
      resolver()
    })
  })
}

/** Dicta un texto y espera a que termine. */
export function decir(texto: string, opciones: OpcionesDictado = {}): Promise<void> {
  return new Promise((resolver) => {
    if (!vozDisponible() || opciones.senal?.aborted) {
      resolver()
      return
    }

    const emision = new SpeechSynthesisUtterance(texto)
    emision.lang = opciones.voz?.lang ?? 'es-CO'
    if (opciones.voz) emision.voice = opciones.voz
    emision.rate = opciones.velocidad ?? 1
    emision.pitch = 1

    let terminado = false
    let vigilante = 0
    const terminar = () => {
      if (terminado) return
      terminado = true
      window.clearTimeout(vigilante)
      resolver()
    }

    emision.onend = terminar
    emision.onerror = terminar
    opciones.senal?.addEventListener('abort', () => {
      try {
        window.speechSynthesis.cancel()
      } catch {
        // Cancelar puede fallar si el motor de voz ya murió. No importa.
      }
      terminar()
    })

    // Vigilante contra un motor de voz que no avisa que terminó.
    //
    // Sin esto, un dispositivo sin voces instaladas o un `speak` que falla
    // dejan el ejercicio congelado en «Escuchando…» sin forma de salir. El
    // margen se calcula por longitud del texto para no cortar una palabra
    // larga dictada despacio.
    const margenMs = 2500 + texto.length * 400 * (1 / Math.max(0.4, emision.rate))
    vigilante = window.setTimeout(terminar, margenMs)

    try {
      window.speechSynthesis.speak(emision)
    } catch {
      terminar()
    }
  })
}

/**
 * Dicta una serie elemento por elemento, con una pausa entre cada uno.
 *
 * Se dicta uno a uno y no la serie completa de corrido porque el ritmo tiene
 * que ser constante y controlable: en la prueba clínica los dígitos se leen
 * a un elemento por segundo, y ese ritmo es parte de la medición.
 */
export async function dictarSerie(
  elementos: string[],
  opciones: OpcionesDictado = {},
): Promise<void> {
  const pausa = opciones.pausaMs ?? 550

  for (let i = 0; i < elementos.length; i += 1) {
    if (opciones.senal?.aborted) return
    opciones.alElemento?.(i)
    await decir(textoHablado(elementos[i] as string), opciones)
    if (i < elementos.length - 1) await esperar(pausa, opciones.senal)
  }
}

/** Convierte un elemento en su forma hablada: `F` se dice «efe». */
export function textoHablado(elemento: string): string {
  return LETRA_HABLADA[elemento.toUpperCase()] ?? elemento
}

/** Corta cualquier dictado en curso. */
export function callar(): void {
  if (vozDisponible()) window.speechSynthesis.cancel()
}
