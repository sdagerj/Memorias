/**
 * Exportación a CSV, para que los datos se puedan abrir en una hoja de
 * cálculo o entregarse a la internista junto con los del tiroides.
 *
 * Se usa punto y coma como separador porque Excel en español interpreta la
 * coma como separador decimal, y con coma las columnas salen corridas.
 */

import type { ResultadoEjercicio, RegistroDiario } from '../datos/db'

const SEPARADOR = ';'

function escapar(valor: string | number): string {
  const texto = String(valor)
  if (texto.includes(SEPARADOR) || texto.includes('"') || texto.includes('\n')) {
    return `"${texto.replace(/"/g, '""')}"`
  }
  return texto
}

function fila(campos: Array<string | number>): string {
  return campos.map(escapar).join(SEPARADOR)
}

/** Todas las métricas de todos los ejercicios, una fila por resultado. */
export function csvDeResultados(resultados: ResultadoEjercicio[]): string {
  const columnas = new Set<string>()
  for (const r of resultados) for (const clave of Object.keys(r.metricas)) columnas.add(clave)
  const metricas = [...columnas].sort()

  const lineas = [fila(['fecha', 'hora', 'ejercicio', 'consigna', 'duracion_s', ...metricas])]

  for (const r of resultados) {
    const hora = new Date(r.momento).toTimeString().slice(0, 5)
    lineas.push(
      fila([
        r.fecha,
        hora,
        r.ejercicio,
        r.consigna ?? '',
        Math.round(r.duracionMs / 1000),
        ...metricas.map((m) => r.metricas[m] ?? ''),
      ]),
    )
  }

  return lineas.join('\n')
}

/** Registro diario, para cruzarlo con el rendimiento. */
export function csvDeDiario(diario: RegistroDiario[]): string {
  const lineas = [fila(['fecha', 'energia', 'sueno', 'niebla_mental', 'nota'])]
  for (const d of diario) {
    lineas.push(fila([d.fecha, d.energia, d.sueno, d.niebla, d.nota]))
  }
  return lineas.join('\n')
}

/**
 * Palabra por palabra de las pruebas de fluidez, con su clasificación y el
 * segundo en que se dijo. Es el detalle que permite auditar el conteo de
 * perseveraciones en vez de tener que creerle a la aplicación.
 */
export function csvDeFluidez(resultados: ResultadoEjercicio[]): string {
  const lineas = [fila(['fecha', 'prueba', 'consigna', 'orden', 'palabra', 'clase', 'segundo'])]

  for (const r of resultados) {
    if (!r.palabras) continue
    r.palabras.forEach((palabra, i) => {
      lineas.push(
        fila([
          r.fecha,
          r.ejercicio,
          r.consigna ?? '',
          i + 1,
          palabra.texto,
          palabra.clase,
          Math.round(palabra.tMs / 1000),
        ]),
      )
    })
  }

  return lineas.join('\n')
}

/** Antepone la marca de orden de bytes para que Excel respete las tildes. */
export function conMarcaUTF8(texto: string): string {
  return `﻿${texto}`
}
