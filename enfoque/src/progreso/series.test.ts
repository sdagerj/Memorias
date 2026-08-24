import { describe, it, expect } from 'vitest'
import { serieDe, cruzarConDiario, etiquetaFecha, rangoDeFechas } from './series'
import type { ResultadoEjercicio, RegistroDiario } from '../datos/db'

function resultado(
  fecha: string,
  ejercicio: string,
  metricas: Record<string, number>,
): ResultadoEjercicio {
  return {
    id: Math.random(),
    sesionId: 1,
    ejercicio: ejercicio as ResultadoEjercicio['ejercicio'],
    fecha,
    momento: Date.parse(`${fecha}T10:00:00`),
    duracionMs: 1000,
    metricas,
  }
}

describe('extracción de series', () => {
  const datos = [
    resultado('2026-01-05', 'digitos-inversos', { spanMaximo: 4 }),
    resultado('2026-01-07', 'digitos-inversos', { spanMaximo: 5 }),
    resultado('2026-01-07', 'digitos-inversos', { spanMaximo: 3 }),
    resultado('2026-01-06', 'fluidez-semantica', { validas: 20 }),
  ]

  it('filtra por ejercicio y métrica', () => {
    const serie = serieDe(datos, 'digitos-inversos', 'spanMaximo')
    expect(serie.map((p) => p.fecha)).toEqual(['2026-01-05', '2026-01-07'])
  })

  it('ordena por fecha aunque los datos lleguen desordenados', () => {
    const serie = serieDe([...datos].reverse(), 'digitos-inversos', 'spanMaximo')
    expect(serie[0]?.fecha).toBe('2026-01-05')
  })

  it('toma el mejor del día, no el promedio', () => {
    const serie = serieDe(datos, 'digitos-inversos', 'spanMaximo')
    expect(serie[1]?.valor).toBe(5)
  })

  it('puede sumar cuando la métrica es acumulativa', () => {
    const serie = serieDe(datos, 'digitos-inversos', 'spanMaximo', 'suma')
    expect(serie[1]?.valor).toBe(8)
  })

  it('ignora métricas ausentes en vez de inventar ceros', () => {
    expect(serieDe(datos, 'digitos-inversos', 'inexistente')).toEqual([])
  })

  it('devuelve lista vacía sin datos', () => {
    expect(serieDe([], 'digitos-inversos', 'spanMaximo')).toEqual([])
  })
})

describe('cruce con el diario', () => {
  const diario: RegistroDiario[] = [
    { fecha: '2026-01-05', energia: 3, sueno: 2, niebla: 4, nota: '' },
  ]

  it('adjunta el registro del día cuando existe', () => {
    const serie = serieDe(
      [resultado('2026-01-05', 'digitos-inversos', { spanMaximo: 4 })],
      'digitos-inversos',
      'spanMaximo',
    )
    expect(cruzarConDiario(serie, diario)[0]?.energia).toBe(3)
  })

  it('deja el punto intacto cuando ese día no se registró nada', () => {
    const serie = serieDe(
      [resultado('2026-01-09', 'digitos-inversos', { spanMaximo: 4 })],
      'digitos-inversos',
      'spanMaximo',
    )
    expect(cruzarConDiario(serie, diario)[0]?.energia).toBeUndefined()
  })
})

describe('etiquetas y rango', () => {
  it('abrevia la fecha', () => {
    expect(etiquetaFecha('2026-03-12')).toBe('12 mar')
    expect(etiquetaFecha('2026-01-01')).toBe('1 ene')
  })

  it('describe el rango cubierto', () => {
    const datos = [
      resultado('2026-01-05', 'digitos-inversos', { spanMaximo: 4 }),
      resultado('2026-02-01', 'digitos-inversos', { spanMaximo: 5 }),
    ]
    expect(rangoDeFechas(datos)).toBe('2026-01-05 a 2026-02-01')
  })

  it('no repite la fecha cuando solo hay un día', () => {
    expect(rangoDeFechas([resultado('2026-01-05', 'x', {})])).toBe('2026-01-05')
  })

  it('avisa cuando no hay nada', () => {
    expect(rangoDeFechas([])).toBe('Sin datos')
  })
})
