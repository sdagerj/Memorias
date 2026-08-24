import { useEffect, useState } from 'react'
import { Pantalla } from '../ui/Pantalla'
import { Tarjeta } from '../ui/Tarjeta'
import { Boton } from '../ui/Boton'
import { Escala } from '../ui/Escala'
import { AVISO_CLINICO } from '../datos/basales'
import { diarioDe, guardarDiario, ultimaSesion } from '../datos/repositorio'
import { fechaLocal } from '../datos/db'

interface Props {
  alEmpezar: () => void
  alVerProgreso: () => void
  alVerAjustes: () => void
}

export function Inicio({ alEmpezar, alVerProgreso, alVerAjustes }: Props) {
  const hoy = fechaLocal()

  const [energia, setEnergia] = useState<number | null>(null)
  const [sueno, setSueno] = useState<number | null>(null)
  const [niebla, setNiebla] = useState<number | null>(null)
  const [nota, setNota] = useState('')
  const [guardado, setGuardado] = useState(false)
  const [ultima, setUltima] = useState<string | null>(null)

  useEffect(() => {
    void diarioDe(hoy).then((registro) => {
      if (!registro) return
      setEnergia(registro.energia)
      setSueno(registro.sueno)
      setNiebla(registro.niebla)
      setNota(registro.nota)
      setGuardado(true)
    })
    void ultimaSesion().then((sesion) => setUltima(sesion?.fecha ?? null))
  }, [hoy])

  const guardarRegistro = async () => {
    await guardarDiario({
      fecha: hoy,
      energia: energia ?? 0,
      sueno: sueno ?? 0,
      niebla: niebla ?? 0,
      nota,
    })
    setGuardado(true)
  }

  const hayAlgo = energia !== null || sueno !== null || niebla !== null

  return (
    <Pantalla titulo="Enfoque">
      <Tarjeta>
        <p className="text-texto-suave">
          Una sesión dura entre quince y dieciocho minutos, y termina sola. Cada ejercicio es
          corto.
        </p>
        {ultima !== null && (
          <p className="mt-2 text-sm text-texto-tenue">Última sesión: {ultima}</p>
        )}
        <Boton onClick={alEmpezar} ancho className="mt-5">
          Empezar la sesión de hoy
        </Boton>
      </Tarjeta>

      <Tarjeta className="mt-4">
        <h2 className="font-medium">¿Cómo amaneciste?</h2>
        <p className="mt-1 text-sm text-texto-tenue">
          Opcional. Sirve para cruzar el rendimiento con cómo te sentías ese día.
        </p>

        <div className="mt-5 space-y-5">
          <Escala
            etiqueta="Energía"
            valor={energia}
            alCambiar={(v) => {
              setEnergia(v)
              setGuardado(false)
            }}
            extremos={['Muy poca', 'Mucha']}
          />
          <Escala
            etiqueta="Calidad del sueño"
            valor={sueno}
            alCambiar={(v) => {
              setSueno(v)
              setGuardado(false)
            }}
            extremos={['Muy mala', 'Muy buena']}
          />
          <Escala
            etiqueta="Niebla mental"
            valor={niebla}
            alCambiar={(v) => {
              setNiebla(v)
              setGuardado(false)
            }}
            extremos={['Ninguna', 'Mucha']}
          />

          <div>
            <label htmlFor="nota" className="mb-2 block font-medium">
              Nota del día
            </label>
            <textarea
              id="nota"
              value={nota}
              onChange={(e) => {
                setNota(e.target.value)
                setGuardado(false)
              }}
              rows={2}
              placeholder="Medicamentos, cambios de dosis, lo que quieras recordar"
              className="w-full resize-none rounded-suave border border-borde bg-fondo px-4 py-3"
            />
          </div>

          <Boton
            tono="secundario"
            ancho
            disabled={!hayAlgo || guardado}
            onClick={() => void guardarRegistro()}
          >
            {guardado ? 'Registro guardado' : 'Guardar el registro de hoy'}
          </Boton>
        </div>
      </Tarjeta>

      <div className="mt-4 flex gap-3">
        <Boton tono="secundario" ancho onClick={alVerProgreso}>
          Progreso
        </Boton>
        <Boton tono="secundario" ancho onClick={alVerAjustes}>
          Ajustes
        </Boton>
      </div>

      <Tarjeta className="mt-4 border-transparent bg-transparent px-0">
        <p className="text-sm leading-relaxed text-texto-tenue">{AVISO_CLINICO}</p>
      </Tarjeta>
    </Pantalla>
  )
}
