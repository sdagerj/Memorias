import { useEffect, useRef, useState } from 'react'
import { Pantalla } from '../ui/Pantalla'
import { Tarjeta } from '../ui/Tarjeta'
import { Boton } from '../ui/Boton'
import { vocesEnEspanol, elegirVoz, decir } from '../audio/voz'
import { escuchaDisponible } from '../audio/escucha'
import { construirRespaldo, importarRespaldo, nombreArchivoRespaldo } from '../datos/respaldo'
import { guardarAjuste } from '../datos/repositorio'

export interface Preferencias {
  velocidadVoz: number
  nombreVoz: string
  usarMicrofono: boolean
}

interface Props {
  preferencias: Preferencias
  alCambiar: (preferencias: Preferencias) => void
  alVolver: () => void
}

export function Ajustes({ preferencias, alCambiar, alVolver }: Props) {
  const [voces, setVoces] = useState<SpeechSynthesisVoice[]>([])
  const [mensaje, setMensaje] = useState('')
  const archivo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void vocesEnEspanol().then(setVoces)
  }, [])

  const actualizar = (cambio: Partial<Preferencias>) => {
    const nuevas = { ...preferencias, ...cambio }
    alCambiar(nuevas)
    void guardarAjuste('preferencias', nuevas)
  }

  const probarVoz = () => {
    const voz = elegirVoz(voces, preferencias.nombreVoz)
    void decir('Siete, cuatro, nueve, dos', { voz, velocidad: preferencias.velocidadVoz })
  }

  const exportarRespaldo = async () => {
    const respaldo = await construirRespaldo()
    const enlace = document.createElement('a')
    enlace.href = URL.createObjectURL(
      new Blob([JSON.stringify(respaldo, null, 2)], { type: 'application/json' }),
    )
    enlace.download = nombreArchivoRespaldo()
    enlace.click()
    URL.revokeObjectURL(enlace.href)
    setMensaje('Respaldo descargado.')
  }

  const importar = async (entrada: File) => {
    try {
      const resultado = await importarRespaldo(JSON.parse(await entrada.text()))
      setMensaje(
        resultado.ok
          ? `${resultado.mensaje} Se restauraron ${resultado.sesionesAgregadas} sesiones.`
          : resultado.mensaje,
      )
    } catch {
      setMensaje('No se pudo leer el archivo.')
    }
  }

  return (
    <Pantalla titulo="Ajustes">
      <Tarjeta>
        <h2 className="font-medium">Voz que dicta los ejercicios</h2>
        <p className="mt-1 text-sm text-texto-tenue">
          Esta voz se genera dentro del dispositivo. No sale nada a internet.
        </p>

        <label htmlFor="voz" className="mt-4 block text-sm font-medium">
          Voz
        </label>
        <select
          id="voz"
          value={preferencias.nombreVoz}
          onChange={(e) => actualizar({ nombreVoz: e.target.value })}
          className="mt-1 w-full rounded-suave border border-borde bg-fondo px-4 py-3"
        >
          <option value="">La que elija el sistema</option>
          {voces.map((voz) => (
            <option key={voz.name} value={voz.name}>
              {voz.name} ({voz.lang})
            </option>
          ))}
        </select>

        <label htmlFor="velocidad" className="mt-5 block text-sm font-medium">
          Velocidad del dictado: {preferencias.velocidadVoz.toFixed(2)}×
        </label>
        <input
          id="velocidad"
          type="range"
          min={0.5}
          max={1.3}
          step={0.05}
          value={preferencias.velocidadVoz}
          onChange={(e) => actualizar({ velocidadVoz: Number(e.target.value) })}
          className="mt-2 w-full accent-[var(--color-acento)]"
        />
        <div className="flex justify-between text-sm text-texto-tenue">
          <span>Más lento</span>
          <span>Más rápido</span>
        </div>

        <Boton tono="secundario" ancho className="mt-4" onClick={probarVoz}>
          Escuchar una prueba
        </Boton>
      </Tarjeta>

      <Tarjeta className="mt-4">
        <h2 className="font-medium">Responder hablando</h2>
        {/* Es la única parte de la aplicación donde algo sale del dispositivo,
            y por eso se dice aquí con todas las letras en vez de en una nota
            al pie. */}
        <p className="mt-1 text-sm text-texto-suave">
          A diferencia del resto de la aplicación, el reconocimiento de voz no ocurre dentro del
          dispositivo: el navegador envía el audio a servidores de Apple o de Google para
          convertirlo en texto. El texto resultante sí se guarda solo aquí. Si lo desactivas,
          responderás con el teclado y nada saldrá del dispositivo.
        </p>

        <label className="mt-4 flex items-center justify-between gap-4">
          <span>Usar el micrófono para responder</span>
          <input
            type="checkbox"
            checked={preferencias.usarMicrofono}
            disabled={!escuchaDisponible()}
            onChange={(e) => actualizar({ usarMicrofono: e.target.checked })}
            className="h-6 w-6 accent-[var(--color-acento)]"
          />
        </label>

        {!escuchaDisponible() && (
          <p className="mt-2 text-sm text-texto-tenue">
            Este navegador no tiene reconocimiento de voz. Las respuestas van por teclado.
          </p>
        )}
      </Tarjeta>

      <Tarjeta className="mt-4">
        <h2 className="font-medium">Copia de seguridad</h2>
        <p className="mt-1 text-sm text-texto-suave">
          Los datos viven solo en este dispositivo. El navegador puede borrarlos si necesita
          espacio, y se pierden al cambiar de teléfono. Exporta de vez en cuando.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          <Boton tono="secundario" ancho onClick={() => void exportarRespaldo()}>
            Exportar respaldo (JSON)
          </Boton>
          <Boton tono="secundario" ancho onClick={() => archivo.current?.click()}>
            Importar respaldo
          </Boton>
          <input
            ref={archivo}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const elegido = e.target.files?.[0]
              if (elegido) void importar(elegido)
              e.target.value = ''
            }}
          />
        </div>

        <p className="mt-3 text-sm text-texto-tenue">
          Importar reemplaza todo lo que haya guardado en este dispositivo.
        </p>

        {mensaje !== '' && <p className="mt-3 text-sm">{mensaje}</p>}
      </Tarjeta>

      <Boton tono="secundario" ancho className="mt-4" onClick={alVolver}>
        Volver
      </Boton>
    </Pantalla>
  )
}
