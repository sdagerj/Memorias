import { describe, it, expect } from 'vitest'
import { agruparEnClusters, mismoGrupoFonologico } from './clusters'
import type { PalabraProducida } from '../tipos'

function validas(textos: string[]): PalabraProducida[] {
  return textos.map((texto, i) => ({ texto, tMs: i * 1000, clase: 'valida' }))
}

/** Agrupador de prueba: mismo grupo si comparten la subcategoría declarada. */
function porSubcategoria(mapa: Record<string, string>) {
  return (a: string, b: string) => mapa[a] !== undefined && mapa[a] === mapa[b]
}

const MASCOTAS_Y_SELVA = porSubcategoria({
  perro: 'mascotas', gato: 'mascotas', hamster: 'mascotas',
  leon: 'selva', tigre: 'selva', jaguar: 'selva',
})

describe('agrupamiento en racimos', () => {
  it('forma un solo racimo si todo pertenece al mismo grupo', () => {
    const resultado = agruparEnClusters(validas(['perro', 'gato', 'hamster']), MASCOTAS_Y_SELVA)
    expect(resultado.numeroClusters).toBe(1)
    expect(resultado.saltos).toBe(0)
    // Criterio de Troyer: tres palabras en un racimo son tamaño 2.
    expect(resultado.tamanoMedio).toBe(2)
  })

  it('cuenta un salto al cambiar de subcategoría', () => {
    const resultado = agruparEnClusters(
      validas(['perro', 'gato', 'leon', 'tigre']),
      MASCOTAS_Y_SELVA,
    )
    expect(resultado.numeroClusters).toBe(2)
    expect(resultado.saltos).toBe(1)
    expect(resultado.tamanoMedio).toBe(1)
  })

  it('trata las palabras sueltas como racimos de tamaño cero', () => {
    const resultado = agruparEnClusters(validas(['perro', 'leon', 'gato']), MASCOTAS_Y_SELVA)
    expect(resultado.numeroClusters).toBe(3)
    expect(resultado.tamanoMedio).toBe(0)
    expect(resultado.saltos).toBe(2)
  })

  it('excluye perseveraciones e intrusiones del agrupamiento', () => {
    const palabras: PalabraProducida[] = [
      { texto: 'perro', tMs: 0, clase: 'valida' },
      { texto: 'perro', tMs: 1000, clase: 'perseveracion' },
      { texto: 'mesa', tMs: 2000, clase: 'intrusion' },
      { texto: 'gato', tMs: 3000, clase: 'valida' },
    ]
    const resultado = agruparEnClusters(palabras, MASCOTAS_Y_SELVA)
    expect(resultado.clusters).toEqual([['perro', 'gato']])
    expect(resultado.numeroClusters).toBe(1)
  })

  it('devuelve ceros sin palabras válidas', () => {
    const resultado = agruparEnClusters([], MASCOTAS_Y_SELVA)
    expect(resultado).toEqual({ clusters: [], numeroClusters: 0, tamanoMedio: 0, saltos: 0 })
  })

  it('una sola palabra es un racimo sin saltos', () => {
    const resultado = agruparEnClusters(validas(['perro']), MASCOTAS_Y_SELVA)
    expect(resultado.numeroClusters).toBe(1)
    expect(resultado.saltos).toBe(0)
    expect(resultado.tamanoMedio).toBe(0)
  })
})

describe('criterio fonológico', () => {
  it('agrupa por las dos primeras letras', () => {
    expect(mismoGrupoFonologico('faro', 'fama')).toBe(true)
  })

  it('agrupa por rima', () => {
    expect(mismoGrupoFonologico('flor', 'amor')).toBe(true)
  })

  it('agrupa por la misma secuencia de vocales', () => {
    expect(mismoGrupoFonologico('casa', 'cara')).toBe(true)
    expect(mismoGrupoFonologico('foca', 'sopa')).toBe(true)
  })

  it('no agrupa palabras sin relación', () => {
    expect(mismoGrupoFonologico('foca', 'ferrocarril')).toBe(false)
  })

  it('no agrupa una palabra consigo misma', () => {
    expect(mismoGrupoFonologico('foca', 'foca')).toBe(false)
  })

  it('ignora tildes al comparar', () => {
    expect(mismoGrupoFonologico('fábula', 'fama')).toBe(true)
  })

  it('no se rompe con cadenas vacías', () => {
    expect(mismoGrupoFonologico('', 'foca')).toBe(false)
  })
})
