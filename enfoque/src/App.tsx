import { Suspense, lazy, useEffect, useState } from 'react'
import { Inicio } from './rutas/Inicio'
import { Ajustes, type Preferencias } from './rutas/Ajustes'

// Las gráficas pesan y solo se ven en esta pantalla: se cargan al entrar.
const Progreso = lazy(() =>
  import('./rutas/Progreso').then((m) => ({ default: m.Progreso })),
)
import { MotorSesion } from './sesion/MotorSesion'
import { leerAjuste, todasLasSesiones } from './datos/repositorio'
import { vocesEnEspanol, elegirVoz } from './audio/voz'

type Vista = 'inicio' | 'sesion' | 'progreso' | 'ajustes'

const PREFERENCIAS_INICIALES: Preferencias = {
  velocidadVoz: 0.9,
  nombreVoz: '',
  usarMicrofono: true,
}

export function App() {
  const [vista, setVista] = useState<Vista>('inicio')
  const [preferencias, setPreferencias] = useState<Preferencias>(PREFERENCIAS_INICIALES)
  const [voz, setVoz] = useState<SpeechSynthesisVoice | undefined>()
  const [numeroSesion, setNumeroSesion] = useState(0)
  const [listo, setListo] = useState(false)

  useEffect(() => {
    void (async () => {
      const guardadas = await leerAjuste<Preferencias>('preferencias', PREFERENCIAS_INICIALES)
      setPreferencias({ ...PREFERENCIAS_INICIALES, ...guardadas })
      const sesiones = await todasLasSesiones()
      setNumeroSesion(sesiones.length)
      setListo(true)
    })()
  }, [])

  // La voz se resuelve cada vez que cambia la preferencia, y también al
  // arrancar, porque la lista de voces llega de forma asíncrona en Safari.
  useEffect(() => {
    void vocesEnEspanol().then((voces) => setVoz(elegirVoz(voces, preferencias.nombreVoz)))
  }, [preferencias.nombreVoz])

  if (!listo) return null

  if (vista === 'sesion') {
    return (
      <MotorSesion
        numeroSesion={numeroSesion}
        velocidadVoz={preferencias.velocidadVoz}
        voz={voz}
        usarMicrofono={preferencias.usarMicrofono}
        alSalir={() => {
          setNumeroSesion((n) => n + 1)
          setVista('inicio')
        }}
      />
    )
  }

  if (vista === 'progreso') {
    return (
      <Suspense fallback={<p className="p-6 text-texto-tenue">Cargando…</p>}>
        <Progreso alVolver={() => setVista('inicio')} />
      </Suspense>
    )
  }

  if (vista === 'ajustes') {
    return (
      <Ajustes
        preferencias={preferencias}
        alCambiar={setPreferencias}
        alVolver={() => setVista('inicio')}
      />
    )
  }

  return (
    <Inicio
      alEmpezar={() => setVista('sesion')}
      alVerProgreso={() => setVista('progreso')}
      alVerAjustes={() => setVista('ajustes')}
    />
  )
}
