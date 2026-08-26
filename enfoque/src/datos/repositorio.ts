/**
 * Operaciones de lectura y escritura sobre la base local.
 * Ningún componente habla con Dexie directamente.
 */

import { db, fechaLocal } from './db'
import type {
  Sesion,
  RegistroIntento,
  ResultadoEjercicio,
  RegistroDiario,
} from './db'
import type { Ejercicio, MotivoCierre } from '../nucleo/tipos'

export async function abrirSesion(momento: number = Date.now()): Promise<number> {
  return db.sesiones.add({
    inicio: momento,
    fin: null,
    duracionMs: 0,
    motivoCierre: null,
    fecha: fechaLocal(momento),
  } as Sesion)
}

export async function cerrarSesion(
  sesionId: number,
  motivo: MotivoCierre,
  momento: number = Date.now(),
): Promise<void> {
  const sesion = await db.sesiones.get(sesionId)
  if (!sesion) return
  await db.sesiones.update(sesionId, {
    fin: momento,
    duracionMs: momento - sesion.inicio,
    motivoCierre: motivo,
  })
}

export async function guardarIntento(
  intento: Omit<RegistroIntento, 'id'>,
): Promise<void> {
  await db.intentos.add(intento as RegistroIntento)
}

export async function guardarResultado(
  resultado: Omit<ResultadoEjercicio, 'id'>,
): Promise<void> {
  await db.resultados.add(resultado as ResultadoEjercicio)
}

export async function resultadosDe(ejercicio: Ejercicio): Promise<ResultadoEjercicio[]> {
  const filas = await db.resultados.where('ejercicio').equals(ejercicio).toArray()
  return filas.sort((a, b) => a.momento - b.momento)
}

export async function todosLosResultados(): Promise<ResultadoEjercicio[]> {
  const filas = await db.resultados.toArray()
  return filas.sort((a, b) => a.momento - b.momento)
}

export async function todasLasSesiones(): Promise<Sesion[]> {
  const filas = await db.sesiones.toArray()
  return filas.sort((a, b) => a.inicio - b.inicio)
}

export async function guardarDiario(registro: RegistroDiario): Promise<void> {
  await db.diario.put(registro)
}

export async function diarioDe(fecha: string): Promise<RegistroDiario | undefined> {
  return db.diario.get(fecha)
}

export async function todoElDiario(): Promise<RegistroDiario[]> {
  const filas = await db.diario.toArray()
  return filas.sort((a, b) => a.fecha.localeCompare(b.fecha))
}

export async function leerAjuste<T>(clave: string, porDefecto: T): Promise<T> {
  const fila = await db.ajustes.get(clave)
  return fila === undefined ? porDefecto : (fila.valor as T)
}

export async function guardarAjuste(clave: string, valor: unknown): Promise<void> {
  await db.ajustes.put({ clave, valor })
}

/** Fecha de la última sesión registrada, o null si no hay ninguna. */
export async function ultimaSesion(): Promise<Sesion | undefined> {
  const sesiones = await todasLasSesiones()
  return sesiones[sesiones.length - 1]
}
