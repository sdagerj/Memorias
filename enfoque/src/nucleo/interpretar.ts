/**
 * Convierte lo que la usuaria dice o escribe en una lista de elementos
 * comparable con la serie presentada.
 *
 * Existe porque la respuesta puede llegar de tres formas muy distintas:
 * escrita seguida (`351`), escrita con espacios (`3 5 1`) o dictada
 * (`tres cinco uno`, y a veces `treinta y cinco uno` porque el reconocedor
 * agrupa cifras). Todas deben producir el mismo resultado, o el puntaje
 * castigaría la forma de responder en lugar de la memoria.
 */

import { normalizarConCifras } from './normalizar'

const UNIDADES: Record<string, number> = {
  cero: 0, uno: 1, un: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
  seis: 6, siete: 7, ocho: 8, nueve: 9,
}

const NUMEROS_DIRECTOS: Record<string, number> = {
  ...UNIDADES,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
  dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, veintiuno: 21, veintidos: 22, veintitres: 23, veinticuatro: 24,
  veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28,
  veintinueve: 29, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60,
  setenta: 70, ochenta: 80, noventa: 90,
}

const DECENAS = new Set(['treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'])

/** Nombre hablado de cada letra en español, para leer la respuesta dictada. */
const NOMBRES_LETRA: Record<string, string> = {
  a: 'A', be: 'B', ce: 'C', de: 'D', e: 'E', efe: 'F', ge: 'G', hache: 'H',
  i: 'I', jota: 'J', ka: 'K', ele: 'L', eme: 'M', ene: 'N', o: 'O', pe: 'P',
  cu: 'Q', erre: 'R', ere: 'R', ese: 'S', te: 'T', u: 'U', uve: 'V', ve: 'V',
  equis: 'X', ye: 'Y', zeta: 'Z', ceta: 'Z',
}

/**
 * Devuelve la respuesta como lista de elementos de un solo carácter:
 * dígitos `'0'`–`'9'` y letras mayúsculas.
 */
export function interpretarRespuesta(texto: string): string[] {
  const limpio = normalizarConCifras(texto)
  if (limpio === '') return []

  const palabras = limpio.split(' ')
  const elementos: string[] = []

  for (let i = 0; i < palabras.length; i += 1) {
    const palabra = palabras[i] as string

    // `y` solo une decenas con unidades: "treinta y cinco".
    if (palabra === 'y') continue

    // Cifras escritas: cada carácter es un elemento.
    if (/^\d+$/.test(palabra)) {
      for (const caracter of palabra) elementos.push(caracter)
      continue
    }

    const valor = NUMEROS_DIRECTOS[palabra]
    if (valor !== undefined) {
      let total = valor
      // "treinta y cinco" → 35. Solo aplica a decenas redondas.
      if (DECENAS.has(palabra)) {
        const siguiente = palabras[i + 1] === 'y' ? palabras[i + 2] : undefined
        const unidad = siguiente === undefined ? undefined : UNIDADES[siguiente]
        if (unidad !== undefined && unidad > 0) {
          total += unidad
          i += 2
        }
      }
      for (const caracter of String(total)) elementos.push(caracter)
      continue
    }

    const letra = NOMBRES_LETRA[palabra]
    if (letra !== undefined) {
      elementos.push(letra)
      continue
    }

    // Escritura seguida sin espacios: "efejotaese" no se resuelve, pero
    // "fjs" o "3f1" sí, carácter por carácter.
    if (/^[a-z]+$/.test(palabra) && palabra.length > 1 && !(palabra in NOMBRES_LETRA)) {
      for (const caracter of palabra) elementos.push(caracter.toUpperCase())
      continue
    }

    if (/^[a-z]$/.test(palabra)) {
      elementos.push(palabra.toUpperCase())
    }
  }

  return elementos
}

/**
 * Separa una respuesta escrita en palabras sueltas, para los ejercicios de
 * ordenamiento alfabético y de fluidez. Acepta comas, saltos de línea y
 * espacios como separadores.
 */
export function interpretarPalabras(texto: string): string[] {
  return texto
    .split(/[,;\n\r]+|\s{1,}/)
    .map((palabra) => palabra.trim())
    .filter((palabra) => palabra.length > 0)
}
