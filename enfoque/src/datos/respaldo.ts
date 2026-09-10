/**
 * Respaldo completo en un archivo JSON.
 *
 * Es la única forma de que estos datos sobrevivan a un cambio de teléfono o
 * al borrado de los datos del navegador. IndexedDB no es almacenamiento
 * permanente: el sistema puede vaciarlo si necesita espacio. Por eso la
 * pantalla de ajustes insiste en exportar de vez en cuando.
 */

import { db } from './db'
import type { Sesion, RegistroIntento, ResultadoEjercicio, RegistroDiario, Ajuste } from './db'

const VERSION_RESPALDO = 1

export interface Respaldo {
  aplicacion: 'enfoque'
  version: number
  exportadoEn: string
  sesiones: Sesion[]
  intentos: RegistroIntento[]
  resultados: ResultadoEjercicio[]
  diario: RegistroDiario[]
  ajustes: Ajuste[]
}

export async function construirRespaldo(): Promise<Respaldo> {
  const [sesiones, intentos, resultados, diario, ajustes] = await Promise.all([
    db.sesiones.toArray(),
    db.intentos.toArray(),
    db.resultados.toArray(),
    db.diario.toArray(),
    db.ajustes.toArray(),
  ])

  return {
    aplicacion: 'enfoque',
    version: VERSION_RESPALDO,
    exportadoEn: new Date().toISOString(),
    sesiones,
    intentos,
    resultados,
    diario,
    ajustes,
  }
}

export interface ResultadoImportacion {
  ok: boolean
  mensaje: string
  sesionesAgregadas: number
}

/**
 * Valida la forma del archivo antes de tocar la base.
 *
 * Un respaldo mal formado que se escriba a medias dejaría los datos
 * inconsistentes, así que se revisa todo primero y se escribe después,
 * dentro de una sola transacción.
 */
export function validarRespaldo(dato: unknown): dato is Respaldo {
  if (typeof dato !== 'object' || dato === null) return false
  const r = dato as Partial<Respaldo>
  if (r.aplicacion !== 'enfoque') return false
  if (typeof r.version !== 'number') return false
  return (
    Array.isArray(r.sesiones) &&
    Array.isArray(r.intentos) &&
    Array.isArray(r.resultados) &&
    Array.isArray(r.diario) &&
    Array.isArray(r.ajustes)
  )
}

/**
 * Importa un respaldo reemplazando por completo el contenido actual.
 *
 * Se eligió reemplazar y no mezclar: fusionar dos historiales con
 * identificadores propios produciría sesiones duplicadas y gráficas
 * imposibles de interpretar. La pantalla avisa antes de hacerlo.
 */
export async function importarRespaldo(dato: unknown): Promise<ResultadoImportacion> {
  if (!validarRespaldo(dato)) {
    return {
      ok: false,
      mensaje: 'El archivo no tiene el formato de un respaldo de Enfoque.',
      sesionesAgregadas: 0,
    }
  }

  await db.transaction(
    'rw',
    [db.sesiones, db.intentos, db.resultados, db.diario, db.ajustes],
    async () => {
      await Promise.all([
        db.sesiones.clear(),
        db.intentos.clear(),
        db.resultados.clear(),
        db.diario.clear(),
        db.ajustes.clear(),
      ])
      await Promise.all([
        db.sesiones.bulkAdd(dato.sesiones),
        db.intentos.bulkAdd(dato.intentos),
        db.resultados.bulkAdd(dato.resultados),
        db.diario.bulkAdd(dato.diario),
        db.ajustes.bulkAdd(dato.ajustes),
      ])
    },
  )

  return {
    ok: true,
    mensaje: 'Respaldo restaurado.',
    sesionesAgregadas: dato.sesiones.length,
  }
}

/** Nombre de archivo con la fecha, para que los respaldos no se pisen. */
export function nombreArchivoRespaldo(): string {
  const hoy = new Date()
  const mes = String(hoy.getMonth() + 1).padStart(2, '0')
  const dia = String(hoy.getDate()).padStart(2, '0')
  return `enfoque-respaldo-${hoy.getFullYear()}-${mes}-${dia}.json`
}
