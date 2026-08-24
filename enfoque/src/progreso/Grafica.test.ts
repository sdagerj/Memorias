import { describe, it, expect } from 'vitest'
import { calcularMarcas } from './Grafica'

describe('marcas del eje vertical', () => {
  it('usa números redondos, no repartos arbitrarios', () => {
    // El caso que motivó la función: span de 3 con basal de 18 producía
    // una escala 2, 7, 12, 19.
    expect(calcularMarcas(3, 18)).toEqual([0, 5, 10, 15, 20])
  })

  it('empieza siempre en cero, para no exagerar la pendiente', () => {
    // Recortando el eje por abajo, pasar de 3 a 4 se dibujaría como si el
    // rendimiento se hubiera duplicado. Estas gráficas van al médico.
    expect(calcularMarcas(1, 4)[0]).toBe(0)
    expect(calcularMarcas(12, 13)[0]).toBe(0)
    expect(calcularMarcas(40, 45)[0]).toBe(0)
  })

  it('reparte con números redondos también en rangos grandes', () => {
    expect(calcularMarcas(0, 45)).toEqual([0, 10, 20, 30, 40, 50])
    expect(calcularMarcas(2, 97)).toEqual([0, 20, 40, 60, 80, 100])
  })

  it('abarca siempre el valor más alto, para que la basal quede dentro', () => {
    for (const [minimo, maximo] of [[3, 18], [1, 4], [0, 45], [12, 13], [2, 97]]) {
      const marcas = calcularMarcas(minimo as number, maximo as number)
      expect(marcas[marcas.length - 1]).toBeGreaterThanOrEqual(maximo as number)
      expect(marcas[0]).toBe(0)
    }
  })

  it('mantiene una cantidad de marcas legible', () => {
    for (const [minimo, maximo] of [[0, 3], [3, 18], [0, 45], [2, 97], [0, 400]]) {
      const marcas = calcularMarcas(minimo as number, maximo as number)
      expect(marcas.length).toBeGreaterThanOrEqual(2)
      expect(marcas.length).toBeLessThanOrEqual(8)
    }
  })

  it('devuelve marcas separadas de forma regular', () => {
    const marcas = calcularMarcas(0, 45)
    const pasos = marcas.slice(1).map((v, i) => v - (marcas[i] as number))
    expect(new Set(pasos).size).toBe(1)
  })

  it('no devuelve una sola marca cuando todos los valores son iguales', () => {
    expect(calcularMarcas(5, 5).length).toBeGreaterThanOrEqual(2)
  })
})
