import { describe, it, expect } from 'vitest'
import {
  iniciarEscalera,
  registrarEnsayo,
  porcentajeAciertos,
  type ConfigEscalera,
  type EstadoEscalera,
} from './escalera'

const CONFIG: ConfigEscalera = {
  nivelInicial: 3,
  nivelMinimo: 2,
  nivelMaximo: 6,
  aciertosParaSubir: 2,
  maxEnsayos: 20,
  fallosParaTerminar: 3,
}

/** Aplica una secuencia de resultados y devuelve el estado final. */
function correr(resultados: boolean[], config: ConfigEscalera = CONFIG): EstadoEscalera {
  return resultados.reduce(
    (estado, acierto) => registrarEnsayo(estado, acierto, config),
    iniciarEscalera(config),
  )
}

describe('escalera adaptativa', () => {
  it('empieza en el nivel configurado y sin span', () => {
    const estado = iniciarEscalera(CONFIG)
    expect(estado.nivel).toBe(3)
    expect(estado.spanMaximo).toBe(0)
    expect(estado.terminado).toBe(false)
  })

  it('no sube con un solo acierto', () => {
    expect(correr([true]).nivel).toBe(3)
  })

  it('sube un nivel tras dos aciertos seguidos', () => {
    expect(correr([true, true]).nivel).toBe(4)
  })

  it('baja un nivel tras un solo fallo', () => {
    expect(correr([false]).nivel).toBe(2)
  })

  it('un fallo reinicia el contador de aciertos seguidos', () => {
    // Acierto, fallo, acierto. El fallo baja de 3 a 2 y borra el acierto
    // previo, así que el acierto final deja un solo acierto acumulado y no
    // alcanza para volver a subir.
    const estado = correr([true, false, true])
    expect(estado.aciertosSeguidos).toBe(1)
    expect(estado.nivel).toBe(2)
  })

  it('un acierto reinicia el contador de fallos seguidos', () => {
    const estado = correr([false, false, true])
    expect(estado.fallosSeguidos).toBe(0)
    expect(estado.terminado).toBe(false)
  })

  it('respeta el techo configurado', () => {
    const estado = correr(Array(30).fill(true), { ...CONFIG, maxEnsayos: 40 })
    expect(estado.nivel).toBe(6)
  })

  it('respeta el piso configurado', () => {
    const estado = correr([false, false, false, false], { ...CONFIG, fallosParaTerminar: 99 })
    expect(estado.nivel).toBe(2)
  })

  it('registra como span el nivel superado, no el presentado', () => {
    // Sube a 4 con dos aciertos y falla el 4: el span debe quedarse en 3.
    const estado = correr([true, true, false])
    expect(estado.spanMaximo).toBe(3)
  })

  it('registra el span más alto aunque después se baje', () => {
    // 3,3 → sube a 4; 4,4 → sube a 5; falla 5 dos veces → baja, pero el span fue 4.
    const estado = correr([true, true, true, true, false, false])
    expect(estado.spanMaximo).toBe(4)
  })

  it('termina al agotar el número máximo de ensayos', () => {
    const config = { ...CONFIG, maxEnsayos: 4 }
    const estado = correr([true, true, true, true], config)
    expect(estado.ensayos).toBe(4)
    expect(estado.terminado).toBe(true)
  })

  it('termina antes cuando se acumulan fallos seguidos, para no alargar el ejercicio', () => {
    const estado = correr([false, false, false])
    expect(estado.terminado).toBe(true)
    expect(estado.ensayos).toBe(3)
  })

  it('ignora ensayos posteriores al cierre', () => {
    const cerrado = correr([false, false, false])
    const despues = registrarEnsayo(cerrado, true, CONFIG)
    expect(despues).toEqual(cerrado)
  })

  it('no modifica el estado que recibe', () => {
    const inicial = iniciarEscalera(CONFIG)
    const copia = { ...inicial }
    registrarEnsayo(inicial, true, CONFIG)
    expect(inicial).toEqual(copia)
  })
})

describe('porcentajeAciertos', () => {
  it('redondea al entero', () => {
    expect(porcentajeAciertos(1, 3)).toBe(33)
    expect(porcentajeAciertos(2, 3)).toBe(67)
  })

  it('no divide por cero', () => {
    expect(porcentajeAciertos(0, 0)).toBe(0)
  })
})
