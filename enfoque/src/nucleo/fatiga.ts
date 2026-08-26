/**
 * Control de duración y de fatiga cognitiva.
 *
 * Dos reglas que la aplicación aplica por su cuenta, sin preguntar:
 *
 * 1. Los ejercicios son cortos. Cada uno tiene su propio tope y ninguno
 *    pasa de cuatro minutos. Un ejercicio largo no mide mejor: mide peor,
 *    porque a partir de cierto punto lo que registra es el cansancio.
 * 2. La sesión completa se cierra sola. Aviso a los quince minutos, corte
 *    en firme a los dieciocho, aunque quede un ejercicio sin empezar.
 *
 * Además vigila la caída dentro de la sesión y propone parar cuando el
 * rendimiento se desploma. Propone: la decisión de continuar sigue siendo
 * de la usuaria, salvo en el corte por tiempo, que no se negocia.
 */

export const AVISO_SESION_MS = 15 * 60 * 1000
export const CORTE_SESION_MS = 18 * 60 * 1000

/** Tope de duración de cada ejercicio, en milisegundos. */
export const TOPE_EJERCICIO_MS: Record<string, number> = {
  'digitos-inversos': 4 * 60 * 1000,
  'digitos-creciente': 3 * 60 * 1000,
  'letras-numeros': 4 * 60 * 1000,
  'ordenamiento-alfabetico': 4 * 60 * 1000,
  'fluidez-semantica': 2 * 60 * 1000,
  'fluidez-fonologica': 2 * 60 * 1000,
}

export type EstadoTiempo = 'en-curso' | 'por-terminar' | 'agotado'

export function estadoDeSesion(transcurridoMs: number): EstadoTiempo {
  if (transcurridoMs >= CORTE_SESION_MS) return 'agotado'
  if (transcurridoMs >= AVISO_SESION_MS) return 'por-terminar'
  return 'en-curso'
}

/** ¿Alcanza el tiempo restante para empezar otro ejercicio? */
export function alcanzaParaOtroEjercicio(transcurridoMs: number, ejercicio: string): boolean {
  const tope = TOPE_EJERCICIO_MS[ejercicio] ?? 3 * 60 * 1000
  // Se exige que quepa al menos la mitad del ejercicio: empezar uno que se
  // va a cortar a la mitad deja un dato incompleto y una sensación fea.
  return CORTE_SESION_MS - transcurridoMs >= tope / 2
}

export interface SenalFatiga {
  /** Verdadero cuando conviene ofrecer terminar aquí. */
  sugerirParar: boolean
  /** Texto para mostrar, ya redactado sin lenguaje de fracaso. */
  motivo: string
}

const SIN_SENAL: SenalFatiga = { sugerirParar: false, motivo: '' }

/**
 * Compara el rendimiento reciente con el del inicio de la sesión.
 *
 * Ojo con la trampa de este cálculo: en una escalera adaptativa la precisión
 * cae sola hacia la mitad de los ensayos, porque el ejercicio sube de
 * dificultad hasta encontrar el techo. Bajar del 100 % al 50 % no es fatiga,
 * es la escalera funcionando bien. Un umbral que solo mirara la caída
 * relativa sugeriría parar en una sesión perfectamente buena.
 *
 * Por eso se exigen tres condiciones a la vez: al menos doce ensayos, una
 * caída de más de la mitad respecto al inicio, y que el tramo reciente esté
 * además por debajo de un piso absoluto. Es decir, no basta con empeorar:
 * el rendimiento tiene que haberse desplomado.
 */
const VENTANA = 6
/** Piso absoluto: dos aciertos de seis o menos en el tramo reciente. */
const PISO_ABSOLUTO = 2 / VENTANA

export function evaluarCaida(resultados: boolean[]): SenalFatiga {
  if (resultados.length < VENTANA * 2) return SIN_SENAL

  const proporcion = (tanda: boolean[]) =>
    tanda.filter(Boolean).length / tanda.length

  const inicio = proporcion(resultados.slice(0, VENTANA))
  const reciente = proporcion(resultados.slice(-VENTANA))

  if (inicio === 0) return SIN_SENAL

  const cayoALaMitad = reciente <= inicio / 2
  const bajoElPiso = reciente <= PISO_ABSOLUTO

  if (cayoALaMitad && bajoElPiso) {
    return {
      sugerirParar: true,
      motivo: 'La atención se está dispersando. Es buen momento para parar.',
    }
  }

  return SIN_SENAL
}

/**
 * Señal por tiempo transcurrido, independiente del rendimiento.
 */
export function evaluarTiempo(transcurridoMs: number): SenalFatiga {
  const estado = estadoDeSesion(transcurridoMs)
  if (estado === 'agotado') {
    return { sugerirParar: true, motivo: 'Se cumplió el tiempo de la sesión.' }
  }
  if (estado === 'por-terminar') {
    return { sugerirParar: false, motivo: 'Queda poco tiempo de sesión.' }
  }
  return SIN_SENAL
}
