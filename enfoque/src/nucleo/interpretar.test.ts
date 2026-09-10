import { describe, it, expect } from 'vitest'
import { interpretarRespuesta, interpretarPalabras } from './interpretar'

describe('respuesta escrita', () => {
  it('lee cifras seguidas', () => {
    expect(interpretarRespuesta('351')).toEqual(['3', '5', '1'])
  })

  it('lee cifras separadas por espacios', () => {
    expect(interpretarRespuesta('3 5 1')).toEqual(['3', '5', '1'])
  })

  it('lee cifras separadas por comas', () => {
    expect(interpretarRespuesta('3, 5, 1')).toEqual(['3', '5', '1'])
  })

  it('lee letras sueltas y las pone en mayúscula', () => {
    expect(interpretarRespuesta('f j s')).toEqual(['F', 'J', 'S'])
  })

  it('lee mezclas de letras y cifras', () => {
    expect(interpretarRespuesta('3 f 1')).toEqual(['3', 'F', '1'])
  })

  it('devuelve lista vacía si no hay nada', () => {
    expect(interpretarRespuesta('')).toEqual([])
    expect(interpretarRespuesta('   ')).toEqual([])
  })
})

describe('respuesta dictada', () => {
  it('lee números en palabras', () => {
    expect(interpretarRespuesta('tres cinco uno')).toEqual(['3', '5', '1'])
  })

  it('lee el cero', () => {
    expect(interpretarRespuesta('cero nueve')).toEqual(['0', '9'])
  })

  it('separa en cifras los números que el reconocedor agrupa', () => {
    // Al dictar rápido "tres cinco", el reconocedor suele devolver "treinta y cinco".
    expect(interpretarRespuesta('treinta y cinco')).toEqual(['3', '5'])
    expect(interpretarRespuesta('veintitrés')).toEqual(['2', '3'])
    expect(interpretarRespuesta('dieciocho')).toEqual(['1', '8'])
  })

  it('combina decenas con unidades y sigue leyendo lo que viene después', () => {
    expect(interpretarRespuesta('cuarenta y dos siete')).toEqual(['4', '2', '7'])
  })

  it('no se come la decena redonda cuando no hay unidad detrás', () => {
    expect(interpretarRespuesta('treinta')).toEqual(['3', '0'])
  })

  it('lee nombres de letras en español', () => {
    expect(interpretarRespuesta('efe jota ese')).toEqual(['F', 'J', 'S'])
    expect(interpretarRespuesta('eme ele')).toEqual(['M', 'L'])
  })

  it('acepta las dos formas de nombrar la erre', () => {
    expect(interpretarRespuesta('erre')).toEqual(['R'])
    expect(interpretarRespuesta('ere')).toEqual(['R'])
  })

  it('mezcla nombres de letras con números dictados', () => {
    expect(interpretarRespuesta('uno efe tres')).toEqual(['1', 'F', '3'])
  })

  it('ignora tildes en los números dictados', () => {
    expect(interpretarRespuesta('veintidós')).toEqual(['2', '2'])
  })
})

describe('separación de palabras sueltas', () => {
  it('separa por espacios y comas', () => {
    expect(interpretarPalabras('perro, gato  león')).toEqual(['perro', 'gato', 'león'])
  })

  it('separa por saltos de línea', () => {
    expect(interpretarPalabras('perro\ngato\n')).toEqual(['perro', 'gato'])
  })

  it('descarta los huecos vacíos', () => {
    expect(interpretarPalabras('  ,  , perro ,,')).toEqual(['perro'])
  })

  it('conserva las tildes, que se limpian más adelante', () => {
    expect(interpretarPalabras('león')).toEqual(['león'])
  })
})
