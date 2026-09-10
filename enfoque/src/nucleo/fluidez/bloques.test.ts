import { describe, it, expect } from 'vitest'
import { distribuirEnBloques, caidaDeProduccion } from './bloques'
import type { PalabraProducida } from '../tipos'

function palabra(tMs: number, clase: PalabraProducida['clase'] = 'valida'): PalabraProducida {
  return { texto: `p${tMs}`, tMs, clase }
}

describe('distribución en bloques de quince segundos', () => {
  it('crea cuatro bloques para una prueba de sesenta segundos', () => {
    const bloques = distribuirEnBloques([])
    expect(bloques.length).toBe(4)
    expect(bloques[0]?.desdeMs).toBe(0)
    expect(bloques[3]?.hastaMs).toBe(60_000)
  })

  it('coloca cada palabra en su bloque', () => {
    const bloques = distribuirEnBloques([
      palabra(0), palabra(14_999), palabra(15_000), palabra(59_999),
    ])
    expect(bloques[0]?.validas).toBe(2)
    expect(bloques[1]?.validas).toBe(1)
    expect(bloques[3]?.validas).toBe(1)
  })

  it('mete en el último bloque lo que llegue justo al límite', () => {
    const bloques = distribuirEnBloques([palabra(60_000)])
    expect(bloques[3]?.validas).toBe(1)
  })

  it('cuenta las perseveraciones aparte de las válidas', () => {
    const bloques = distribuirEnBloques([palabra(1000), palabra(2000, 'perseveracion')])
    expect(bloques[0]?.validas).toBe(1)
    expect(bloques[0]?.perseveraciones).toBe(1)
  })

  it('no cuenta intrusiones ni pendientes como producción', () => {
    const bloques = distribuirEnBloques([palabra(1000, 'intrusion'), palabra(2000, 'pendiente')])
    expect(bloques[0]?.validas).toBe(0)
    expect(bloques[0]?.perseveraciones).toBe(0)
  })

  it('descarta tiempos negativos en lugar de romperse', () => {
    expect(distribuirEnBloques([palabra(-500)])[0]?.validas).toBe(0)
  })
})

describe('caída de producción', () => {
  it('es positiva cuando la producción decae, que es lo esperable', () => {
    const palabras = [palabra(1000), palabra(2000), palabra(3000), palabra(50_000)]
    expect(caidaDeProduccion(distribuirEnBloques(palabras))).toBe(2)
  })

  it('es cero con una curva plana', () => {
    expect(caidaDeProduccion(distribuirEnBloques([palabra(1000), palabra(50_000)]))).toBe(0)
  })

  it('devuelve cero sin bloques', () => {
    expect(caidaDeProduccion([])).toBe(0)
  })
})
