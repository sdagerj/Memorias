import { describe, it, expect } from 'vitest'
import { clasificarPalabras, calcularMetricas, resolverPendiente } from './puntuar'
import type { PalabraProducida } from '../tipos'

/** Construye la lista de palabras producidas con tiempos regulares. */
function producidas(textos: string[]): PalabraProducida[] {
  return textos.map((texto, i) => ({ texto, tMs: i * 2000, clase: 'pendiente' }))
}

const TODO_VALE = () => true
const NADA_VALE = () => false
const NO_SE = () => null

describe('detector de perseveraciones', () => {
  it('no marca nada cuando todas las palabras son distintas', () => {
    const clasificadas = clasificarPalabras(producidas(['perro', 'gato', 'león']), TODO_VALE)
    expect(calcularMetricas(clasificadas).perseveraciones).toBe(0)
    expect(calcularMetricas(clasificadas).validas).toBe(3)
  })

  it('marca la repetición exacta', () => {
    const clasificadas = clasificarPalabras(producidas(['perro', 'gato', 'perro']), TODO_VALE)
    expect(clasificadas[2]?.clase).toBe('perseveracion')
    expect(calcularMetricas(clasificadas).perseveraciones).toBe(1)
  })

  it('marca singular y plural como la misma palabra', () => {
    const clasificadas = clasificarPalabras(producidas(['perro', 'perros']), TODO_VALE)
    expect(clasificadas[1]?.clase).toBe('perseveracion')
  })

  it('ignora tildes y mayúsculas al comparar', () => {
    const clasificadas = clasificarPalabras(producidas(['león', 'LEON', 'Leones']), TODO_VALE)
    expect(clasificadas[1]?.clase).toBe('perseveracion')
    expect(clasificadas[2]?.clase).toBe('perseveracion')
    expect(calcularMetricas(clasificadas).perseveraciones).toBe(2)
  })

  it('cuenta cada repetición, no cada palabra repetida', () => {
    // Tres veces "perro" son dos perseveraciones, no una.
    const clasificadas = clasificarPalabras(producidas(['perro', 'perro', 'perro']), TODO_VALE)
    expect(calcularMetricas(clasificadas).perseveraciones).toBe(2)
    expect(calcularMetricas(clasificadas).validas).toBe(1)
  })

  it('marca la primera aparición como válida y solo la segunda como repetición', () => {
    const clasificadas = clasificarPalabras(producidas(['gato', 'gato']), TODO_VALE)
    expect(clasificadas[0]?.clase).toBe('valida')
    expect(clasificadas[1]?.clase).toBe('perseveracion')
  })

  it('detecta la repetición de una palabra que además era intrusión', () => {
    const clasificadas = clasificarPalabras(producidas(['mesa', 'mesa']), NADA_VALE)
    expect(clasificadas[0]?.clase).toBe('intrusion')
    expect(clasificadas[1]?.clase).toBe('perseveracion')
  })

  it('detecta repeticiones separadas por muchas palabras', () => {
    const lista = ['perro', 'gato', 'león', 'tigre', 'oso', 'perro']
    const clasificadas = clasificarPalabras(producidas(lista), TODO_VALE)
    expect(clasificadas[5]?.clase).toBe('perseveracion')
  })

  it('no cuenta como repetición dos palabras que solo se parecen', () => {
    const clasificadas = clasificarPalabras(producidas(['caballo', 'caballero']), TODO_VALE)
    expect(clasificadas[1]?.clase).toBe('valida')
  })
})

describe('intrusiones y pendientes', () => {
  it('marca como intrusión lo que no cumple la consigna', () => {
    const clasificadas = clasificarPalabras(producidas(['mesa', 'silla']), NADA_VALE)
    expect(calcularMetricas(clasificadas).intrusiones).toBe(2)
    expect(calcularMetricas(clasificadas).validas).toBe(0)
  })

  it('deja pendiente lo que el corpus no reconoce, sin descartarlo', () => {
    const clasificadas = clasificarPalabras(producidas(['chigüiro']), NO_SE)
    expect(clasificadas[0]?.clase).toBe('pendiente')
    const metricas = calcularMetricas(clasificadas)
    expect(metricas.pendientes).toBe(1)
    expect(metricas.intrusiones).toBe(0)
  })

  it('trata como intrusión lo que queda vacío al normalizar', () => {
    const clasificadas = clasificarPalabras(producidas(['   ', '!!!']), TODO_VALE)
    expect(calcularMetricas(clasificadas).intrusiones).toBe(2)
  })
})

describe('métricas', () => {
  it('suma el total de producidas por encima de las clases', () => {
    const clasificadas = clasificarPalabras(
      producidas(['perro', 'perro', 'mesa']),
      (t) => t !== 'mesa',
    )
    const metricas = calcularMetricas(clasificadas)
    expect(metricas.totalProducidas).toBe(3)
    expect(metricas.validas).toBe(1)
    expect(metricas.perseveraciones).toBe(1)
    expect(metricas.intrusiones).toBe(1)
  })

  it('devuelve ceros con una lista vacía', () => {
    expect(calcularMetricas([])).toEqual({
      validas: 0,
      perseveraciones: 0,
      intrusiones: 0,
      pendientes: 0,
      totalProducidas: 0,
    })
  })
})

describe('revisión manual', () => {
  it('convierte una pendiente en válida', () => {
    const clasificadas = clasificarPalabras(producidas(['chigüiro']), NO_SE)
    const resuelta = resolverPendiente(clasificadas, 0, true)
    expect(resuelta[0]?.clase).toBe('valida')
  })

  it('convierte una pendiente en intrusión', () => {
    const clasificadas = clasificarPalabras(producidas(['chigüiro']), NO_SE)
    expect(resolverPendiente(clasificadas, 0, false)[0]?.clase).toBe('intrusion')
  })

  it('no permite rescatar una perseveración ya detectada', () => {
    const clasificadas = clasificarPalabras(producidas(['perro', 'perros']), TODO_VALE)
    const resuelta = resolverPendiente(clasificadas, 1, true)
    expect(resuelta[1]?.clase).toBe('perseveracion')
  })

  it('no toca las demás palabras', () => {
    const clasificadas = clasificarPalabras(producidas(['uno', 'dos']), NO_SE)
    const resuelta = resolverPendiente(clasificadas, 0, true)
    expect(resuelta[1]?.clase).toBe('pendiente')
  })
})
