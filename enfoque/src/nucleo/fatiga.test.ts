import { describe, it, expect } from 'vitest'
import {
  estadoDeSesion,
  alcanzaParaOtroEjercicio,
  evaluarCaida,
  evaluarTiempo,
  AVISO_SESION_MS,
  CORTE_SESION_MS,
} from './fatiga'

const MINUTO = 60_000

describe('estado de la sesión por tiempo', () => {
  it('está en curso al principio', () => {
    expect(estadoDeSesion(0)).toBe('en-curso')
    expect(estadoDeSesion(10 * MINUTO)).toBe('en-curso')
  })

  it('avisa a los quince minutos', () => {
    expect(estadoDeSesion(AVISO_SESION_MS)).toBe('por-terminar')
  })

  it('corta a los dieciocho', () => {
    expect(estadoDeSesion(CORTE_SESION_MS)).toBe('agotado')
    expect(estadoDeSesion(30 * MINUTO)).toBe('agotado')
  })
})

describe('¿alcanza para otro ejercicio?', () => {
  it('sí al empezar', () => {
    expect(alcanzaParaOtroEjercicio(0, 'digitos-inversos')).toBe(true)
  })

  it('no cuando ya no cabe ni la mitad del ejercicio', () => {
    expect(alcanzaParaOtroEjercicio(17 * MINUTO, 'digitos-inversos')).toBe(false)
  })

  it('sí para un ejercicio corto donde uno largo ya no cabría', () => {
    expect(alcanzaParaOtroEjercicio(16.5 * MINUTO, 'digitos-inversos')).toBe(false)
    expect(alcanzaParaOtroEjercicio(16.5 * MINUTO, 'fluidez-semantica')).toBe(true)
  })

  it('usa un tope prudente para un ejercicio desconocido', () => {
    expect(alcanzaParaOtroEjercicio(17.5 * MINUTO, 'ejercicio-nuevo')).toBe(false)
  })
})

describe('detección de caída dentro de la sesión', () => {
  it('no dice nada con pocos ensayos', () => {
    expect(evaluarCaida([true, false, true, false]).sugerirParar).toBe(false)
  })

  it('no confunde la convergencia normal de la escalera con fatiga', () => {
    // La escalera sube hasta el techo, así que la precisión baja sola hacia
    // la mitad. Eso es el ejercicio funcionando, no cansancio.
    const resultados = [...Array(6).fill(true), true, true, true, false, false, false]
    expect(evaluarCaida(resultados).sugerirParar).toBe(false)
  })

  it('tampoco reacciona a una mala racha corta al final', () => {
    const resultados = [...Array(6).fill(true), true, true, true, true, false, false]
    expect(evaluarCaida(resultados).sugerirParar).toBe(false)
  })

  it('sí reacciona cuando el desplome es profundo', () => {
    // Un solo acierto en los últimos seis: eso ya no es la escalera.
    const resultados = [...Array(6).fill(true), false, false, false, true, false, false]
    expect(evaluarCaida(resultados).sugerirParar).toBe(true)
  })

  it('sugiere parar cuando el rendimiento se desploma', () => {
    const resultados = [...Array(6).fill(true), ...Array(6).fill(false)]
    const senal = evaluarCaida(resultados)
    expect(senal.sugerirParar).toBe(true)
    expect(senal.motivo).not.toMatch(/error|fall|mal/i)
  })

  it('no sugiere parar si el rendimiento se mantiene', () => {
    expect(evaluarCaida(Array(12).fill(true)).sugerirParar).toBe(false)
  })

  it('no sugiere parar si el inicio ya venía en cero', () => {
    // Sin una referencia inicial no hay caída que medir.
    expect(evaluarCaida(Array(12).fill(false)).sugerirParar).toBe(false)
  })
})

describe('señal por tiempo', () => {
  it('sugiere parar al agotarse el tiempo', () => {
    expect(evaluarTiempo(CORTE_SESION_MS).sugerirParar).toBe(true)
  })

  it('avisa sin obligar a los quince minutos', () => {
    const senal = evaluarTiempo(AVISO_SESION_MS)
    expect(senal.sugerirParar).toBe(false)
    expect(senal.motivo).not.toBe('')
  })

  it('calla al principio', () => {
    expect(evaluarTiempo(MINUTO).motivo).toBe('')
  })
})
