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
    <Pantalla titulo="Enfoque" entrada="Práctica breve, los días que quieras.">
      <Tarjeta>
        <p className="text-[1.125rem] leading-relaxed text-texto-suave">
          Una sesión dura entre quince y dieciocho minutos, y termina sola. Cada ejercicio es
          corto.
        </p>
        <Boton onClick={alEmpezar} ancho className="mt-6">
          Empezar sesión
        </Boton>
        {ultima !== null && (
          <p className="mt-4 text-center text-[1rem] text-texto-tenue">
            Última sesión: {ultima}
          </p>
        )}
      </Tarjeta>

      <Tarjeta className="mt-5">
        <p className="rotulo">Antes de empezar</p>
        <h2 className="mt-2">¿Cómo amaneciste?</h2>
        <p className="mt-2 text-[1.0625rem] leading-relaxed text-texto-tenue">
          Opcional. Sirve para cruzar el rendimiento con cómo te sentías ese día.
        </p>

        <div className="mt-7 space-y-6">
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
            <label htmlFor="nota" className="mb-2.5 block text-[1.0625rem] font-semibold">
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
              className="w-full resize-none rounded-suave border border-borde bg-velo px-4 py-3.5 leading-relaxed transition-colors focus:border-acento-borde focus:outline-none"
            />
          </div>

          <Boton
            tono="secundario"
            ancho
            disabled={!hayAlgo || guardado}
            onClick={() => void guardarRegistro()}
          >
            {guardado ? 'Registro guardado' : 'Guardar registro'}
          </Boton>
        </div>
      </Tarjeta>

      <div className="mt-5 flex gap-3">
        <Boton tono="secundario" ancho onClick={alVerProgreso}>
          Progreso
        </Boton>
        <Boton tono="secundario" ancho onClick={alVerAjustes}>
          Ajustes
        </Boton>
      </div>

      <div className="mt-10 border-t border-borde pt-6">
        <p className="rotulo">Advertencia</p>
        <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-texto-tenue">{AVISO_CLINICO}</p>
      </div>
    </Pantalla>
  )
}
