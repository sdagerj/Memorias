import { describe, it, expect } from 'vitest'
import { normalizar, raiz, sonLaMisma, primeraLetra } from './normalizar'

describe('normalizar', () => {
  it('pasa a minúsculas y quita tildes', () => {
    expect(normalizar('Árbol')).toBe('arbol')
    expect(normalizar('LEÓN')).toBe('leon')
    expect(normalizar('pingüino')).toBe('pinguino')
  })

  it('conserva la ñ porque en español distingue palabras', () => {
    expect(normalizar('año')).toBe('año')
    expect(normalizar('AÑO')).not.toBe('ano')
  })

  it('quita puntuación y espacios sobrantes', () => {
    expect(normalizar('  perro,  ')).toBe('perro')
    expect(normalizar('oso   hormiguero')).toBe('oso hormiguero')
    expect(normalizar('¡gato!')).toBe('gato')
  })
})

describe('raiz', () => {
  it('reduce plurales regulares', () => {
    expect(raiz('perros')).toBe('perro')
    expect(raiz('casas')).toBe('casa')
    expect(raiz('flores')).toBe('flor')
    expect(raiz('papeles')).toBe('papel')
    expect(raiz('ratones')).toBe('raton')
    expect(raiz('árboles')).toBe('arbol')
    expect(raiz('autobuses')).toBe('autobus')
  })

  it('reduce plurales terminados en -ces', () => {
    expect(raiz('lápices')).toBe('lapiz')
    expect(raiz('peces')).toBe('pez')
    expect(raiz('luces')).toBe('luz')
    expect(raiz('raíces')).toBe('raiz')
  })

  it('no destroza palabras invariables ni singulares en -s', () => {
    expect(raiz('jueves')).toBe('jueves')
    expect(raiz('lunes')).toBe('lunes')
    expect(raiz('crisis')).toBe('crisis')
    expect(raiz('virus')).toBe('virus')
    expect(raiz('paraguas')).toBe('paraguas')
    expect(raiz('análisis')).toBe('analisis')
  })

  it('resuelve los plurales irregulares de la lista', () => {
    expect(raiz('pies')).toBe('pie')
    expect(raiz('reyes')).toBe('rey')
    expect(raiz('jabalíes')).toBe('jabali')
    expect(raiz('caracteres')).toBe('caracter')
  })

  it('deja intactas las palabras cortas, donde adivinar es peligroso', () => {
    expect(raiz('pez')).toBe('pez')
    expect(raiz('mes')).toBe('mes')
    expect(raiz('gas')).toBe('gas')
  })

  it('no confunde diminutivos con la palabra base', () => {
    expect(sonLaMisma('perro', 'perrito')).toBe(false)
    expect(sonLaMisma('bolso', 'bolsillo')).toBe(false)
  })
})

describe('sonLaMisma', () => {
  it('iguala singular y plural, que es el criterio acordado', () => {
    expect(sonLaMisma('perro', 'perros')).toBe(true)
    expect(sonLaMisma('Águila', 'aguilas')).toBe(true)
  })

  it('distingue palabras diferentes', () => {
    expect(sonLaMisma('perro', 'gato')).toBe(false)
    expect(sonLaMisma('caballo', 'caballero')).toBe(false)
  })

  it('nunca iguala cadenas vacías', () => {
    expect(sonLaMisma('', '')).toBe(false)
    expect(sonLaMisma('   ', '!!!')).toBe(false)
  })
})

describe('primeraLetra', () => {
  it('devuelve la inicial sin tilde', () => {
    expect(primeraLetra('Álvaro')).toBe('a')
    expect(primeraLetra('  farola')).toBe('f')
    expect(primeraLetra('')).toBe('')
  })
})
