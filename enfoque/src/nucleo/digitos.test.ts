import { describe, it, expect } from 'vitest'
import {
  generarSerieDigitos,
  generarSerieLetrasNumeros,
  respuestaEsperada,
  calificarAmplitud,
  type Azar,
} from './digitos'

/** Azar reproducible, para que las series de prueba sean siempre las mismas. */
function azarFijo(semilla: number): Azar {
  let estado = semilla
  return () => {
    estado = (estado * 1664525 + 1013904223) % 4294967296
    return estado / 4294967296
  }
}

describe('respuesta esperada', () => {
  it('invierte la serie en la variante de dígitos inversos', () => {
    expect(respuestaEsperada(['3', '7', '1'], 'inversos')).toEqual(['1', '7', '3'])
  })

  it('ordena de menor a mayor en la variante creciente', () => {
    expect(respuestaEsperada(['7', '3', '9', '1'], 'creciente')).toEqual(['1', '3', '7', '9'])
  })

  it('pone números y después letras en la variante mixta', () => {
    expect(respuestaEsperada(['F', '3', 'A', '1'], 'letras-numeros')).toEqual(['1', '3', 'A', 'F'])
  })

  it('no modifica la serie original', () => {
    const serie = ['3', '7', '1']
    respuestaEsperada(serie, 'inversos')
    expect(serie).toEqual(['3', '7', '1'])
  })
})

describe('calificación', () => {
  it('acepta la respuesta correcta', () => {
    expect(calificarAmplitud(['3', '7', '1'], ['1', '7', '3'], 'inversos').acierto).toBe(true)
  })

  it('rechaza el orden equivocado', () => {
    expect(calificarAmplitud(['3', '7', '1'], ['3', '7', '1'], 'inversos').acierto).toBe(false)
  })

  it('rechaza una respuesta incompleta aunque el comienzo esté bien', () => {
    const resultado = calificarAmplitud(['3', '7', '1'], ['1', '7'], 'inversos')
    expect(resultado.acierto).toBe(false)
    expect(resultado.aciertosParciales).toBe(2)
  })

  it('rechaza una respuesta con elementos de más', () => {
    expect(calificarAmplitud(['3', '1'], ['1', '3', '5'], 'inversos').acierto).toBe(false)
  })

  it('acepta letras en minúscula', () => {
    expect(calificarAmplitud(['F', '3'], ['3', 'f'], 'letras-numeros').acierto).toBe(true)
  })

  it('cuenta los aciertos parciales por posición', () => {
    const resultado = calificarAmplitud(['1', '2', '3'], ['3', '9', '1'], 'inversos')
    expect(resultado.aciertosParciales).toBe(2)
    expect(resultado.acierto).toBe(false)
  })

  it('trata la respuesta vacía como fallo', () => {
    expect(calificarAmplitud(['3', '1'], [], 'inversos').acierto).toBe(false)
  })
})

describe('generación de series', () => {
  it('produce la longitud pedida', () => {
    for (let longitud = 2; longitud <= 9; longitud += 1) {
      expect(generarSerieDigitos(longitud, azarFijo(longitud)).length).toBe(longitud)
    }
  })

  it('no repite el mismo dígito dos veces seguidas', () => {
    for (let semilla = 1; semilla <= 60; semilla += 1) {
      const serie = generarSerieDigitos(8, azarFijo(semilla))
      for (let i = 1; i < serie.length; i += 1) {
        expect(serie[i]).not.toBe(serie[i - 1])
      }
    }
  })

  it('evita tramos consecutivos de tres, que se recuerdan como un bloque', () => {
    for (let semilla = 1; semilla <= 60; semilla += 1) {
      const serie = generarSerieDigitos(8, azarFijo(semilla)).map(Number)
      for (let i = 2; i < serie.length; i += 1) {
        const paso1 = (serie[i - 1] as number) - (serie[i - 2] as number)
        const paso2 = (serie[i] as number) - (serie[i - 1] as number)
        const tramo = paso1 === paso2 && Math.abs(paso1) === 1
        expect(tramo).toBe(false)
      }
    }
  })

  it('termina aunque el azar devuelva siempre lo mismo', () => {
    const constante: Azar = () => 0.5
    expect(generarSerieDigitos(5, constante).length).toBe(5)
  })

  it('alterna letras y números sin repetir elementos', () => {
    for (let semilla = 1; semilla <= 40; semilla += 1) {
      const serie = generarSerieLetrasNumeros(6, azarFijo(semilla))
      expect(serie.length).toBe(6)
      expect(new Set(serie).size).toBe(6)
      const hayLetras = serie.some((e) => /[A-Z]/.test(e))
      const hayNumeros = serie.some((e) => /\d/.test(e))
      expect(hayLetras && hayNumeros).toBe(true)
    }
  })

  it('usa solo letras que no se confunden al oírlas', () => {
    const permitidas = new Set(['A', 'E', 'F', 'J', 'L', 'M', 'O', 'R', 'S', 'U'])
    for (let semilla = 1; semilla <= 40; semilla += 1) {
      for (const elemento of generarSerieLetrasNumeros(6, azarFijo(semilla))) {
        if (/[A-Z]/.test(elemento)) expect(permitidas.has(elemento)).toBe(true)
      }
    }
  })
})
