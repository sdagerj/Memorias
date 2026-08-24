/**
 * Generación y calificación de las tres variantes de amplitud auditiva:
 * dígitos inversos, dígitos en orden creciente y letras y números
 * intercalados.
 *
 * Las tres se presentan por audio. El estímulo nunca se muestra escrito:
 * el déficit que entrenan es auditivo-verbal y verlo en pantalla
 * entrenaría otra cosa.
 */

export type VarianteAmplitud = 'inversos' | 'creciente' | 'letras-numeros'

/**
 * Letras elegidas para que no se confundan al oírlas en español.
 * Se descartan las que riman entre sí (be, ce, de, pe, te, ve) porque en una
 * prueba auditiva un error de escucha se registraría como error de memoria.
 */
const LETRAS_CLARAS = ['A', 'E', 'F', 'J', 'L', 'M', 'O', 'R', 'S', 'U'] as const

/** Fuente de azar inyectable, para poder probar con series fijas. */
export type Azar = () => number

function elegir<T>(lista: readonly T[], azar: Azar): T {
  return lista[Math.floor(azar() * lista.length)] as T
}

/**
 * Serie de dígitos sin repetir el mismo número dos veces seguidas y sin
 * tramos crecientes o decrecientes de tres o más, que se recuerdan como un
 * bloque y falsean la amplitud.
 */
export function generarSerieDigitos(longitud: number, azar: Azar = Math.random): string[] {
  const serie: string[] = []
  let intentos = 0

  while (serie.length < longitud) {
    intentos += 1
    const candidato = String(Math.floor(azar() * 10))
    const ultimo = serie[serie.length - 1]
    const penultimo = serie[serie.length - 2]

    const repiteSeguido = candidato === ultimo
    const formaTramo =
      ultimo !== undefined &&
      penultimo !== undefined &&
      Number(candidato) - Number(ultimo) === Number(ultimo) - Number(penultimo) &&
      Math.abs(Number(candidato) - Number(ultimo)) === 1

    // La válvula de escape evita un bucle infinito si el azar inyectado en
    // una prueba devuelve siempre el mismo valor.
    if ((!repiteSeguido && !formaTramo) || intentos > longitud * 40) {
      serie.push(candidato)
    }
  }

  return serie
}

/** Serie alterna de letras y números, empezando por cualquiera de los dos. */
export function generarSerieLetrasNumeros(longitud: number, azar: Azar = Math.random): string[] {
  const serie: string[] = []
  let tocaLetra = azar() < 0.5

  while (serie.length < longitud) {
    if (tocaLetra) {
      const letra = elegir(LETRAS_CLARAS, azar)
      if (!serie.includes(letra)) serie.push(letra)
    } else {
      const digito = String(Math.floor(azar() * 10))
      if (!serie.includes(digito)) serie.push(digito)
    }
    tocaLetra = !tocaLetra
  }

  return serie
}

export function generarSerie(
  variante: VarianteAmplitud,
  longitud: number,
  azar: Azar = Math.random,
): string[] {
  return variante === 'letras-numeros'
    ? generarSerieLetrasNumeros(longitud, azar)
    : generarSerieDigitos(longitud, azar)
}

/**
 * Respuesta correcta para una serie dada.
 *
 * - `inversos`: la serie al revés.
 * - `creciente`: los dígitos de menor a mayor.
 * - `letras-numeros`: primero los números de menor a mayor, después las
 *   letras en orden alfabético. Es el criterio de la tarea clásica de
 *   sucesión de números y letras.
 */
export function respuestaEsperada(serie: string[], variante: VarianteAmplitud): string[] {
  switch (variante) {
    case 'inversos':
      return [...serie].reverse()
    case 'creciente':
      return [...serie].sort((a, b) => Number(a) - Number(b))
    case 'letras-numeros': {
      const numeros = serie.filter((e) => /\d/.test(e)).sort((a, b) => Number(a) - Number(b))
      const letras = serie.filter((e) => !/\d/.test(e)).sort()
      return [...numeros, ...letras]
    }
  }
}

export interface ResultadoAmplitud {
  acierto: boolean
  esperada: string[]
  recibida: string[]
  /** Elementos correctos en la posición correcta. Sirve para ver casi-aciertos. */
  aciertosParciales: number
}

/**
 * Califica un ensayo. El acierto es todo o nada, como en la prueba clínica:
 * la serie completa y en el orden exacto. Los aciertos parciales se guardan
 * aparte, solo como información descriptiva.
 */
export function calificarAmplitud(
  serie: string[],
  recibida: string[],
  variante: VarianteAmplitud,
): ResultadoAmplitud {
  const esperada = respuestaEsperada(serie, variante)
  const normalizados = recibida.map((e) => e.toUpperCase())

  let aciertosParciales = 0
  for (let i = 0; i < esperada.length; i += 1) {
    if (normalizados[i] === esperada[i]) aciertosParciales += 1
  }

  const acierto =
    normalizados.length === esperada.length && aciertosParciales === esperada.length

  return { acierto, esperada, recibida: normalizados, aciertosParciales }
}
