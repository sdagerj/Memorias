import { describe, it, expect } from 'vitest'
import {
  perteneceACategoria,
  subcategoriaDe,
  agrupadorSemantico,
  empiezaPorLetra,
  LETRAS_FONOLOGICAS,
} from './consignas'
import { CATEGORIAS } from './categorias'
import { PALABRAS_ALFABETICO } from './palabras-alfabetico'
import { raiz } from '../nucleo/normalizar'

describe('pertenencia a categoría', () => {
  it('reconoce palabras del corpus', () => {
    expect(perteneceACategoria('animales', 'perro')).toBe(true)
    expect(perteneceACategoria('frutas', 'mango')).toBe(true)
  })

  it('reconoce el plural y las mayúsculas', () => {
    expect(perteneceACategoria('animales', 'Perros')).toBe(true)
    expect(perteneceACategoria('animales', 'LEÓN')).toBe(true)
  })

  it('reconoce términos de uso colombiano', () => {
    expect(perteneceACategoria('animales', 'chigüiro')).toBe(true)
    expect(perteneceACategoria('frutas', 'lulo')).toBe(true)
    expect(perteneceACategoria('frutas', 'borojó')).toBe(true)
  })

  it('deja en duda lo que no conoce, en vez de descartarlo', () => {
    expect(perteneceACategoria('animales', 'ornitorrinco')).toBe(null)
    expect(perteneceACategoria('animales', 'mesa')).toBe(null)
  })

  it('descarta lo que queda vacío al normalizar', () => {
    expect(perteneceACategoria('animales', '  ')).toBe(false)
  })

  it('devuelve duda para una categoría inexistente', () => {
    expect(perteneceACategoria('inventada', 'perro')).toBe(null)
  })
})

describe('agrupamiento semántico', () => {
  const agrupar = agrupadorSemantico('animales')

  it('agrupa animales de la misma subcategoría', () => {
    expect(agrupar('perro', 'gato')).toBe(true)
    expect(agrupar('león', 'tigre')).toBe(true)
  })

  it('no agrupa entre subcategorías distintas', () => {
    expect(agrupar('perro', 'tiburón')).toBe(false)
  })

  it('no agrupa cuando alguna palabra es desconocida', () => {
    expect(agrupar('perro', 'ornitorrinco')).toBe(false)
  })

  it('encuentra la subcategoría de una palabra conocida', () => {
    expect(subcategoriaDe('animales', 'ballena')).toBe('marinos')
  })
})

describe('regla fonológica', () => {
  it('acepta la palabra que empieza por la letra', () => {
    expect(empiezaPorLetra('F', 'foca')).toBe(true)
    expect(empiezaPorLetra('f', 'Farola')).toBe(true)
  })

  it('rechaza la que empieza por otra letra', () => {
    expect(empiezaPorLetra('F', 'gato')).toBe(false)
  })

  it('ignora la tilde de la inicial', () => {
    expect(empiezaPorLetra('A', 'árbol')).toBe(true)
  })

  it('rechaza los nombres compuestos, como manda la prueba', () => {
    expect(empiezaPorLetra('F', 'flor de mayo')).toBe(false)
  })

  it('rechaza la palabra vacía', () => {
    expect(empiezaPorLetra('F', '   ')).toBe(false)
  })

  it('nunca deja la decisión en duda: la regla es formal', () => {
    for (const letra of LETRAS_FONOLOGICAS) {
      expect(typeof empiezaPorLetra(letra, 'palabra')).toBe('boolean')
    }
  })
})

describe('integridad del corpus', () => {
  it('ninguna categoría tiene palabras repetidas entre subcategorías', () => {
    for (const categoria of CATEGORIAS) {
      const vistas = new Map<string, string>()
      for (const [grupo, palabras] of Object.entries(categoria.grupos)) {
        for (const palabra of palabras) {
          const clave = raiz(palabra)
          const anterior = vistas.get(clave)
          expect(
            anterior,
            `"${palabra}" está en "${grupo}" y también en "${anterior}" (${categoria.id})`,
          ).toBeUndefined()
          vistas.set(clave, grupo)
        }
      }
    }
  })

  it('cada categoría tiene material suficiente para una prueba de 60 segundos', () => {
    for (const categoria of CATEGORIAS) {
      const total = Object.values(categoria.grupos).flat().length
      expect(total, `la categoría ${categoria.id} es muy corta`).toBeGreaterThanOrEqual(40)
    }
  })

  it('la lista de ordenamiento no tiene repetidas', () => {
    const claves = PALABRAS_ALFABETICO.map(raiz)
    expect(new Set(claves).size).toBe(claves.length)
  })

  it('la lista de ordenamiento cubre iniciales suficientes para listas de ocho', () => {
    const iniciales = new Set(PALABRAS_ALFABETICO.map((p) => raiz(p).charAt(0)))
    expect(iniciales.size).toBeGreaterThanOrEqual(8)
  })
})
