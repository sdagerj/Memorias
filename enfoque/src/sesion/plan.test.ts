import { describe, it, expect } from 'vitest'
import { planDeSesion, nombreDePaso, ejercicioDePaso } from './plan'
import { TOPE_EJERCICIO_MS, CORTE_SESION_MS } from '../nucleo/fatiga'

describe('plan de sesión', () => {
  it('siempre empieza por el déficit principal', () => {
    for (let n = 0; n < 12; n += 1) {
      expect(planDeSesion(n)[0]?.tipo).toBe('amplitud')
    }
  })

  it('cabe en el tope de la sesión sumando los topes de cada ejercicio', () => {
    for (let n = 0; n < 12; n += 1) {
      const total = planDeSesion(n)
        .map((paso) => TOPE_EJERCICIO_MS[ejercicioDePaso(paso)] ?? 0)
        .reduce((a, b) => a + b, 0)
      expect(total).toBeLessThanOrEqual(CORTE_SESION_MS)
    }
  })

  it('rota las categorías para no repetir en sesiones seguidas', () => {
    const consignaDe = (n: number) => {
      const paso = planDeSesion(n).find((p) => p.tipo === 'fluidez' && p.subtipo === 'semantica')
      return paso && paso.tipo === 'fluidez' ? paso.consigna : ''
    }
    expect(consignaDe(0)).not.toBe(consignaDe(1))
    expect(consignaDe(1)).not.toBe(consignaDe(2))
  })

  it('rota las letras de la prueba fonológica', () => {
    const letraDe = (n: number) => {
      const paso = planDeSesion(n).find((p) => p.tipo === 'fluidez' && p.subtipo === 'fonologica')
      return paso && paso.tipo === 'fluidez' ? paso.consigna : ''
    }
    expect(letraDe(0)).not.toBe(letraDe(1))
  })

  it('presenta los dígitos inversos con más frecuencia que las otras variantes', () => {
    const variantes = Array.from({ length: 12 }, (_, n) => {
      const paso = planDeSesion(n)[0]
      return paso?.tipo === 'amplitud' ? paso.variante : ''
    })
    const inversos = variantes.filter((v) => v === 'inversos').length
    expect(inversos).toBeGreaterThan(variantes.filter((v) => v === 'creciente').length)
  })

  it('alterna parejas al oído con el ordenamiento alfabético', () => {
    const terceroDe = (n: number) => planDeSesion(n)[2]?.tipo
    for (let n = 0; n < 12; n += 2) {
      expect(terceroDe(n)).toBe('parejas')
      expect(terceroDe(n + 1)).toBe('alfabetico')
    }
  })

  it('no mete los dos ejercicios de manipulación en la misma sesión', () => {
    for (let n = 0; n < 12; n += 1) {
      const tipos = planDeSesion(n).map((p) => p.tipo)
      expect(tipos.filter((t) => t === 'parejas' || t === 'alfabetico').length).toBe(1)
    }
  })

  it('mantiene la sesión en cuatro pasos', () => {
    for (let n = 0; n < 12; n += 1) {
      expect(planDeSesion(n).length).toBe(4)
    }
  })

  it('da nombre a todos los pasos', () => {
    for (const paso of [...planDeSesion(0), ...planDeSesion(1)]) {
      expect(nombreDePaso(paso)).not.toBe('')
      expect(TOPE_EJERCICIO_MS[ejercicioDePaso(paso)]).toBeDefined()
    }
  })
})
