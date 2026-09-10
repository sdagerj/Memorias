import { describe, it, expect } from 'vitest'
import { ordenarEnEspanol, generarLista, calificarAlfabetico } from './alfabetico'
import type { Azar } from './digitos'

function azarFijo(semilla: number): Azar {
  let estado = semilla
  return () => {
    estado = (estado * 1664525 + 1013904223) % 4294967296
    return estado / 4294967296
  }
}

describe('orden alfabético del español', () => {
  it('ordena palabras sencillas', () => {
    expect(ordenarEnEspanol(['zorro', 'casa', 'mesa'])).toEqual(['casa', 'mesa', 'zorro'])
  })

  it('coloca la ñ entre la n y la o, no después de la z', () => {
    expect(ordenarEnEspanol(['ñandú', 'oso', 'nube'])).toEqual(['nube', 'ñandú', 'oso'])
  })

  it('trata las vocales con tilde como su vocal base', () => {
    expect(ordenarEnEspanol(['zapato', 'árbol'])).toEqual(['árbol', 'zapato'])
    expect(ordenarEnEspanol(['limón', 'lima', 'lino'])).toEqual(['lima', 'limón', 'lino'])
  })

  it('no modifica la lista original', () => {
    const lista = ['zorro', 'casa']
    ordenarEnEspanol(lista)
    expect(lista).toEqual(['zorro', 'casa'])
  })
})

describe('generación de listas', () => {
  const corpus = ['casa', 'mesa', 'nube', 'oso', 'perro', 'silla', 'tren', 'uva', 'vaso', 'zorro']

  it('produce la cantidad pedida sin repetir palabras', () => {
    for (let semilla = 1; semilla <= 30; semilla += 1) {
      const lista = generarLista(corpus, 5, azarFijo(semilla))
      expect(lista.length).toBe(5)
      expect(new Set(lista).size).toBe(5)
    }
  })

  it('evita que dos palabras empiecen por la misma letra', () => {
    for (let semilla = 1; semilla <= 30; semilla += 1) {
      const lista = generarLista(corpus, 5, azarFijo(semilla))
      const iniciales = lista.map((p) => p.charAt(0))
      expect(new Set(iniciales).size).toBe(iniciales.length)
    }
  })

  it('no se cuelga si el corpus es más pequeño que lo pedido', () => {
    expect(generarLista(['uno', 'dos'], 5, azarFijo(1)).length).toBeLessThanOrEqual(2)
  })
})

describe('calificación del ordenamiento', () => {
  const lista = ['zorro', 'casa', 'mesa']

  it('acepta el orden correcto', () => {
    expect(calificarAlfabetico(lista, ['casa', 'mesa', 'zorro']).acierto).toBe(true)
  })

  it('rechaza el orden equivocado', () => {
    const resultado = calificarAlfabetico(lista, ['casa', 'zorro', 'mesa'])
    expect(resultado.acierto).toBe(false)
    expect(resultado.posicionesCorrectas).toBe(1)
  })

  it('perdona las tildes, porque evalúa ordenamiento y no ortografía', () => {
    expect(calificarAlfabetico(['árbol', 'nube'], ['arbol', 'nube']).acierto).toBe(true)
  })

  it('perdona mayúsculas y espacios sobrantes', () => {
    expect(calificarAlfabetico(['casa', 'mesa'], [' CASA ', 'Mesa']).acierto).toBe(true)
  })

  it('detecta omisiones', () => {
    const resultado = calificarAlfabetico(lista, ['casa', 'mesa'])
    expect(resultado.acierto).toBe(false)
    expect(resultado.omisiones).toEqual(['zorro'])
  })

  it('detecta palabras que no estaban en la lista', () => {
    const resultado = calificarAlfabetico(lista, ['casa', 'gato', 'mesa', 'zorro'])
    expect(resultado.intrusiones).toEqual(['gato'])
    expect(resultado.acierto).toBe(false)
  })

  it('trata la respuesta vacía como fallo con todas las omisiones', () => {
    const resultado = calificarAlfabetico(lista, [])
    expect(resultado.acierto).toBe(false)
    expect(resultado.omisiones.length).toBe(3)
  })
})
