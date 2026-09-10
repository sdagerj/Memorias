/**
 * Armado del plan de la sesión.
 *
 * Requisito de diseño: los ejercicios son cortos y la sesión completa cabe
 * en quince o dieciocho minutos. El plan encadena bloques breves y alterna
 * dominios para que no se acumule el mismo tipo de esfuerzo.
 *
 * Las consignas rotan por número de sesión, no al azar: al azar se repetiría
 * la misma categoría en sesiones seguidas y las comparaciones entre fechas
 * perderían sentido.
 */

import { CATEGORIAS } from '../contenido/categorias'
import { LETRAS_FONOLOGICAS } from '../contenido/consignas'
import type { VarianteAmplitud } from '../nucleo/digitos'

export type PasoSesion =
  | { tipo: 'amplitud'; variante: VarianteAmplitud }
  | { tipo: 'alfabetico' }
  | { tipo: 'parejas' }
  | { tipo: 'fluidez'; subtipo: 'semantica' | 'fonologica'; consigna: string }

/**
 * Plan de una sesión completa.
 *
 * El orden no es casual: se abre con dígitos inversos, que es el déficit
 * principal y conviene medirlo con la cabeza descansada; se sigue con
 * fluidez semántica; se intercala un ejercicio de manipulación; y se cierra
 * con fluidez fonológica, que es corta. Si el tiempo se agota antes, el
 * motor simplemente no llega a los últimos pasos.
 *
 * El tercer paso alterna entre ordenamiento alfabético y parejas al oído.
 * Alterna en vez de sumarse porque la sesión no puede crecer: su tope de
 * quince a dieciocho minutos es un requisito clínico, no un presupuesto
 * negociable. Cada uno aparece, entonces, una sesión sí y otra no.
 */
export function planDeSesion(numeroSesion: number): PasoSesion[] {
  const categoria = CATEGORIAS[numeroSesion % CATEGORIAS.length]?.id ?? 'animales'
  const letra = LETRAS_FONOLOGICAS[numeroSesion % LETRAS_FONOLOGICAS.length] ?? 'F'

  // La variante de amplitud rota cada tres sesiones: la inversa es la que
  // más importa, así que aparece con el doble de frecuencia que las otras.
  const rotacion: VarianteAmplitud[] = ['inversos', 'inversos', 'creciente', 'letras-numeros']
  const variante = rotacion[numeroSesion % rotacion.length] ?? 'inversos'

  const manipulacion: PasoSesion =
    numeroSesion % 2 === 0 ? { tipo: 'parejas' } : { tipo: 'alfabetico' }

  return [
    { tipo: 'amplitud', variante },
    { tipo: 'fluidez', subtipo: 'semantica', consigna: categoria },
    manipulacion,
    { tipo: 'fluidez', subtipo: 'fonologica', consigna: letra },
  ]
}

/** Nombre corto de cada paso, para el resumen final. */
export function nombreDePaso(paso: PasoSesion): string {
  switch (paso.tipo) {
    case 'amplitud':
      return paso.variante === 'inversos'
        ? 'Al revés'
        : paso.variante === 'creciente'
          ? 'De menor a mayor'
          : 'Números y letras'
    case 'alfabetico':
      return 'En orden alfabético'
    case 'parejas':
      return 'Parejas al oído'
    case 'fluidez':
      return paso.subtipo === 'semantica' ? 'Fluidez semántica' : 'Fluidez fonológica'
  }
}

/** Ejercicio asociado a un paso, para consultar su tope de duración. */
export function ejercicioDePaso(paso: PasoSesion): string {
  switch (paso.tipo) {
    case 'amplitud':
      return paso.variante === 'inversos'
        ? 'digitos-inversos'
        : paso.variante === 'creciente'
          ? 'digitos-creciente'
          : 'letras-numeros'
    case 'alfabetico':
      return 'ordenamiento-alfabetico'
    case 'parejas':
      return 'parejas-audio'
    case 'fluidez':
      return paso.subtipo === 'semantica' ? 'fluidez-semantica' : 'fluidez-fonologica'
  }
}
