import { describe, it, expect } from 'vitest'
import { csvDeResultados, csvDeDiario, csvDeFluidez, conMarcaUTF8 } from './exportarCSV'
import type { ResultadoEjercicio } from '../datos/db'

function resultado(extra: Partial<ResultadoEjercicio> = {}): ResultadoEjercicio {
  return {
    id: 1,
    sesionId: 1,
    ejercicio: 'digitos-inversos',
    fecha: '2026-01-05',
    momento: Date.parse('2026-01-05T10:30:00'),
    duracionMs: 120_000,
    metricas: { spanMaximo: 4, ensayos: 10 },
    ...extra,
  }
}

describe('CSV de resultados', () => {
  it('pone una columna por métrica, en orden estable', () => {
    const csv = csvDeResultados([resultado()])
    expect(csv.split('\n')[0]).toBe(
      'fecha;hora;ejercicio;consigna;duracion_s;ensayos;spanMaximo',
    )
  })

  it('reúne las métricas de ejercicios distintos en las mismas columnas', () => {
    const csv = csvDeResultados([
      resultado(),
      resultado({ ejercicio: 'fluidez-semantica', metricas: { validas: 20 } }),
    ])
    const encabezado = csv.split('\n')[0] as string
    expect(encabezado).toContain('validas')
    expect(encabezado).toContain('spanMaximo')
  })

  it('deja vacía la celda de una métrica que ese ejercicio no tiene', () => {
    const csv = csvDeResultados([
      resultado(),
      resultado({ ejercicio: 'fluidez-semantica', metricas: { validas: 20 } }),
    ])
    expect(csv.split('\n')[2]).toContain(';;')
  })

  it('convierte la duración a segundos', () => {
    expect(csvDeResultados([resultado()]).split('\n')[1]).toContain(';120;')
  })

  it('devuelve solo el encabezado si no hay datos', () => {
    expect(csvDeResultados([]).split('\n').length).toBe(1)
  })
})

describe('escapado', () => {
  it('entrecomilla lo que lleva punto y coma', () => {
    const csv = csvDeDiario([
      { fecha: '2026-01-05', energia: 3, sueno: 2, niebla: 4, nota: 'mal día; dormí poco' },
    ])
    expect(csv).toContain('"mal día; dormí poco"')
  })

  it('duplica las comillas internas', () => {
    const csv = csvDeDiario([
      { fecha: '2026-01-05', energia: 3, sueno: 2, niebla: 4, nota: 'dijo "bien"' },
    ])
    expect(csv).toContain('"dijo ""bien"""')
  })
})

describe('CSV de fluidez palabra por palabra', () => {
  it('escribe una fila por palabra con su clasificación', () => {
    const csv = csvDeFluidez([
      resultado({
        ejercicio: 'fluidez-semantica',
        consigna: 'animales',
        palabras: [
          { texto: 'perro', tMs: 1500, clase: 'valida' },
          { texto: 'perros', tMs: 4200, clase: 'perseveracion' },
        ],
      }),
    ])
    const lineas = csv.split('\n')
    expect(lineas.length).toBe(3)
    expect(lineas[1]).toContain('perro;valida;2')
    expect(lineas[2]).toContain('perros;perseveracion;4')
  })

  it('ignora los resultados sin palabras', () => {
    expect(csvDeFluidez([resultado()]).split('\n').length).toBe(1)
  })
})

describe('marca UTF-8', () => {
  it('antepone la marca para que Excel muestre bien las tildes', () => {
    expect(conMarcaUTF8('árbol').charCodeAt(0)).toBe(0xfeff)
  })
})
