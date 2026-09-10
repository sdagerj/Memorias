/**
 * Consignas de fluidez y utilidades para verificar si una palabra las cumple.
 *
 * La verificación devuelve `null` cuando el corpus no conoce la palabra. Ese
 * `null` es intencional y viaja hasta la pantalla de revisión: significa
 * «no lo sé, decídelo tú», no «no vale».
 */

import { normalizar, raiz, primeraLetra } from '../nucleo/normalizar'
import { CATEGORIAS, type Categoria } from './categorias'

/** Letras de la prueba fonológica. Las clásicas en español. */
export const LETRAS_FONOLOGICAS = ['F', 'A', 'S', 'P', 'M', 'R'] as const

/**
 * Palabras que no cuentan en fluidez fonológica aunque empiecen por la letra:
 * nombres propios y derivados. Es la regla estándar de la prueba.
 */
const PREFIJOS_EXCLUIDOS = /^(el|la|los|las|un|una|de|del)\s/

interface IndiceSemantico {
  /** Palabra normalizada → subcategoría. */
  porPalabra: Map<string, string>
}

const indices = new Map<string, IndiceSemantico>()

function indiceDe(categoria: Categoria): IndiceSemantico {
  const existente = indices.get(categoria.id)
  if (existente) return existente

  const porPalabra = new Map<string, string>()
  for (const [grupo, palabras] of Object.entries(categoria.grupos)) {
    for (const palabra of palabras) {
      porPalabra.set(raiz(palabra), grupo)
    }
  }

  const indice = { porPalabra }
  indices.set(categoria.id, indice)
  return indice
}

export function categoriaPorId(id: string): Categoria | undefined {
  return CATEGORIAS.find((c) => c.id === id)
}

/**
 * ¿La palabra pertenece a la categoría?
 * `true` sí, `false` no lo sabemos y es improbable, `null` no lo sabemos.
 *
 * En la práctica solo devuelve `true` o `null`: sin un diccionario completo
 * del español no hay forma honesta de afirmar que una palabra NO pertenece a
 * una categoría, así que se prefiere preguntar antes que castigar.
 */
export function perteneceACategoria(categoriaId: string, texto: string): boolean | null {
  const categoria = categoriaPorId(categoriaId)
  if (!categoria) return null
  if (normalizar(texto) === '') return false
  return indiceDe(categoria).porPalabra.has(raiz(texto)) ? true : null
}

/** Subcategoría de una palabra dentro de una categoría, si el corpus la conoce. */
export function subcategoriaDe(categoriaId: string, texto: string): string | undefined {
  const categoria = categoriaPorId(categoriaId)
  if (!categoria) return undefined
  return indiceDe(categoria).porPalabra.get(raiz(texto))
}

/**
 * Agrupador semántico: dos palabras forman racimo si comparten subcategoría.
 * Si el corpus no conoce alguna de las dos, no se agrupan.
 */
export function agrupadorSemantico(categoriaId: string) {
  return (a: string, b: string): boolean => {
    const grupoA = subcategoriaDe(categoriaId, a)
    const grupoB = subcategoriaDe(categoriaId, b)
    return grupoA !== undefined && grupoA === grupoB
  }
}

/**
 * ¿La palabra empieza por la letra pedida?
 *
 * Aquí sí se puede responder con certeza: la regla es puramente formal, no
 * depende de conocer el vocabulario. Por eso nunca devuelve `null`.
 */
export function empiezaPorLetra(letra: string, texto: string): boolean {
  const limpio = normalizar(texto)
  if (limpio === '') return false
  if (PREFIJOS_EXCLUIDOS.test(limpio)) return false
  // Una sola palabra: los nombres compuestos no cuentan en la prueba fonológica.
  if (limpio.includes(' ')) return false
  return primeraLetra(limpio) === normalizar(letra)
}

/** Consigna hablada de cada prueba. */
export function consignaSemantica(categoriaId: string): string {
  return categoriaPorId(categoriaId)?.consigna ?? ''
}

export function consignaFonologica(letra: string): string {
  return `Palabras que empiecen por la letra ${letra}`
}
