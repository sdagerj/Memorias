/**
 * Almacenamiento local con Dexie sobre IndexedDB.
 *
 * No hay servidor, no hay nube, no hay analítica. Todo vive en este
 * dispositivo y solo sale de él cuando la usuaria pulsa exportar.
 *
 * Se guarda el ensayo crudo además del resumen. Ocupa más, pero permite
 * recalcular cualquier métrica más adelante sin repetir sesiones: si mañana
 * cambia un criterio de corrección, el histórico completo se puede volver a
 * puntuar.
 */

import Dexie, { type EntityTable } from 'dexie'
import type { Ejercicio, MotivoCierre, PalabraProducida } from '../nucleo/tipos'

export interface Sesion {
  id: number
  /** Marca de tiempo de inicio, en milisegundos. */
  inicio: number
  fin: number | null
  duracionMs: number
  motivoCierre: MotivoCierre | null
  /** Fecha en formato AAAA-MM-DD, para agrupar y filtrar. */
  fecha: string
}

export interface RegistroIntento {
  id: number
  sesionId: number
  ejercicio: Ejercicio
  /** Marca de tiempo del ensayo. */
  momento: number
  nivel: number
  estimulo: string
  respuesta: string
  acierto: boolean
  tiempoRespuestaMs: number
}

/** Resumen de un ejercicio terminado. Es lo que alimenta las gráficas. */
export interface ResultadoEjercicio {
  id: number
  sesionId: number
  ejercicio: Ejercicio
  fecha: string
  momento: number
  duracionMs: number
  /** Métricas del ejercicio. Las claves dependen del tipo. */
  metricas: Record<string, number>
  /** Consigna usada, cuando aplica: categoría o letra. */
  consigna?: string
  /** Palabras producidas, solo en los ejercicios de fluidez. */
  palabras?: PalabraProducida[]
}

export interface RegistroDiario {
  /** Fecha AAAA-MM-DD. Es la clave primaria. */
  fecha: string
  energia: number
  sueno: number
  niebla: number
  nota: string
}

export interface Ajuste {
  clave: string
  valor: unknown
}

const db = new Dexie('enfoque') as Dexie & {
  sesiones: EntityTable<Sesion, 'id'>
  intentos: EntityTable<RegistroIntento, 'id'>
  resultados: EntityTable<ResultadoEjercicio, 'id'>
  diario: EntityTable<RegistroDiario, 'fecha'>
  ajustes: EntityTable<Ajuste, 'clave'>
}

db.version(1).stores({
  sesiones: '++id, inicio, fecha',
  intentos: '++id, sesionId, ejercicio, momento',
  resultados: '++id, sesionId, ejercicio, fecha, momento',
  diario: 'fecha',
  ajustes: 'clave',
})

export { db }

/** Fecha local en formato AAAA-MM-DD. No usa UTC, para no correr el día. */
export function fechaLocal(momento: number = Date.now()): string {
  const d = new Date(momento)
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}
