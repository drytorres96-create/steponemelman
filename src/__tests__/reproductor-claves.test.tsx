// @vitest-environment jsdom
// El reproductor daba a dos hermanos del mismo contenedor la misma `key`, así que React
// duplicaba el control de confianza en cada pregunta: en la novena había ocho copias.
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ESTADO_INICIAL } from '../store/model'
import { ConceptoZ, type Concepto } from '../schema/concept'

const mock = vi.hoisted(() => ({ app: vi.fn() }))
vi.mock('../store/estado', () => ({ useApp: mock.app }))
vi.mock('../components/AyudaIA', () => ({ AyudaIA: () => <div>ayuda</div> }))

import { Reproductor } from '../screens/Reproductor'

const concepto = (n: number) => ConceptoZ.parse({
  concept_id: `QA-${n}`,
  source: { doc: 'QA', doc_title: 'Fuente sintética', page: 1, item_id: `QA-${n}`, fragment: 'Alfa es el primero.' },
  objetivo: 'Reconocer', afirmacion: 'Alfa es el primero.',
  respuesta_canonica: `alfa${n}`, sinonimos: [], explicacion: 'Porque sí.',
  distractores_cercanos: [{ texto: 'beta', por_que_incorrecto: 'No.' }],
  clasificacion: { disciplina_primaria: 'Bioquímica', sistema_primario: 'Multisistémico', tema: 'Ejemplo', tipo_conocimiento: 'Definición', dificultad: 1 },
  step: 'step1', interaccion: { recomendada: 'recuperacion_libre', permitidas: ['recuperacion_libre'] },
  evaluacion: { pregunta: `¿Pregunta ${n}?` }, pistas: ['una', 'dos', 'tres'],
  calidad: { estado: 'aprobado', confianza: 1 },
})

let host: HTMLDivElement
let root: Root
let estado: Record<string, unknown>
const forzar = { fn: (() => {}) as (f: (n: number) => number) => void }

function Envoltura({ conceptos }: { conceptos: Concepto[] }) {
  const [, set] = useState(0)
  forzar.fn = set
  return <Reproductor cola={{ titulo: 'QA', subtitulo: '', ruta: 'aprendizaje', modulo: 'mod-qa', conceptos }} onSalir={vi.fn()} />
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  estado = { ...ESTADO_INICIAL, reanudable: null, progreso: {} }
  mock.app.mockImplementation(() => ({
    estado,
    registrarIntento: vi.fn(),
    cerrarSesion: vi.fn(),
    iniciarSesion: () => 'sesion-qa',
    progresoDe: (id: string) => ({ concept_id: id, intentos: [], estado: 'nuevo' }),
    guardarReanudable: (r: { indice: number }) => {
      const previo = estado.reanudable as { indice?: number } | null
      estado.reanudable = r
      if (!previo || previo.indice !== r.indice) forzar.fn(n => n + 1)
    },
  }))
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks() })

const controlesConfianza = () => [...host.querySelectorAll('summary')].filter(s => s.textContent?.includes('Registrar confianza')).length

async function responderYAvanzar(respuesta: string) {
  const input = host.querySelector('input')
  expect(input, `falta el campo de respuesta: ${host.textContent?.slice(0, 200)}`).not.toBeNull()
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input!, respuesta)
    input!.dispatchEvent(new Event('input', { bubbles: true }))
  })
  const comprobar = [...host.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Comprobar')!
  await act(async () => comprobar.click())
  const siguiente = [...host.querySelectorAll('button')].find(b => b.textContent?.includes('Siguiente pregunta'))
  if (siguiente) await act(async () => siguiente.click())
}

describe('claves del reproductor', () => {
  it('el control de confianza sigue siendo uno solo después de varias preguntas', async () => {
    const avisos = vi.spyOn(console, 'error').mockImplementation(() => {})
    const conceptos: Concepto[] = [1, 2, 3, 4].map(concepto)
    await act(async () => root.render(<Envoltura conceptos={conceptos} />))

    expect(controlesConfianza()).toBe(1)
    for (let vuelta = 1; vuelta <= 3; vuelta++) {
      await responderYAvanzar(`alfa${vuelta}`)
      expect(controlesConfianza(), `se acumuló en la pregunta ${vuelta + 1}`).toBe(1)
    }

    // Dos hermanos con la misma clave: React lo avisa antes de duplicarlos.
    const duplicadas = avisos.mock.calls.filter(c => String(c[0]).includes('same key'))
    expect(duplicadas).toHaveLength(0)
    avisos.mockRestore()
  })
})
