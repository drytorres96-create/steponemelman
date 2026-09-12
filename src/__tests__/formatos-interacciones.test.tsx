// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Interaccion, type Resultado } from '../components/interacciones'
import { ConceptoZ, type Concepto } from '../schema/concept'

// Ejemplos sintéticos: ejercitan los controles reales sin publicar contenido del corpus privado.
const base = ConceptoZ.parse({
  concept_id: 'QA-FORMATO',
  source: { doc: 'QA', doc_title: 'Fuente sintética', page: 1, item_id: 'QA-1', fragment: 'Alfa corresponde al primer grupo.' },
  objetivo: 'Reconocer la relación sintética', afirmacion: 'Alfa corresponde al primer grupo.',
  respuesta_canonica: 'alfa', sinonimos: ['alpha'], explicacion: 'Alfa es el primer término del ejemplo.',
  distractores_cercanos: [{ texto: 'beta', por_que_incorrecto: 'Beta es otro término del ejemplo.' }],
  clasificacion: { disciplina_primaria: 'Fisiología', sistema_primario: 'Multisistémico', tema: 'Ejemplo sintético', tipo_conocimiento: 'Definición', dificultad: 1 },
  step: 'step1', interaccion: { recomendada: 'recuperacion_libre', permitidas: ['recuperacion_libre'] },
  evaluacion: { pregunta: '¿Cuál es el primer término?' }, pistas: ['Pista uno', 'Pista dos', 'Pista tres'],
  calidad: { estado: 'aprobado', confianza: 1 },
})
const ejemplo = (tipo: Concepto['interaccion']['recomendada'], evaluacion: Partial<Concepto['evaluacion']> = {}) =>
  ConceptoZ.parse({ ...base, interaccion: { recomendada: tipo, permitidas: [tipo] }, evaluacion: { ...base.evaluacion, ...evaluacion } })

let host: HTMLDivElement
let root: Root
const resultado = vi.fn<(r: Resultado) => void>()
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  resultado.mockClear()
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })
async function render(c: Concepto, opciones: { bloqueado?: boolean; ocultarFeedback?: boolean; semilla?: string } = {}) {
  const semilla = opciones.semilla ?? 'QA-sesion:0'
  await act(async () => root.render(<Interaccion key={semilla} c={c} bloqueado={opciones.bloqueado ?? false}
    ocultarFeedback={opciones.ocultarFeedback} resultado={resultado.mock.calls.at(-1)?.[0] ?? null} onResponder={resultado} semilla={semilla} />))
}
function boton(texto: string) {
  const b = [...host.querySelectorAll('button')].find(x => x.textContent?.trim() === texto)
  if (!b) throw new Error(`Falta el control ${texto}: ${host.textContent}`)
  return b
}
async function pulsar(b: HTMLButtonElement) { await act(async () => b.click()) }
async function escribir(texto: string) {
  const input = host.querySelector('input')!
  expect(input).not.toBeNull()
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, texto)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('respuestas breves y formatos interactivos', () => {
  it('una pregunta antigua que exige un mecanismo largo permite consultar sin dar crédito automático', async () => {
    const c = ConceptoZ.parse({ ...base, respuesta_canonica: 'Una explicación extensa de múltiples pasos que requiere varias oraciones para quedar completa.', interaccion: { recomendada: 'tarjeta' } })
    await render(c)
    expect(host.querySelector('input')).toBeNull()
    expect(host.textContent).toContain('no se contará como acierto ni fallo')
    await pulsar(boton('Consultar explicación'))
    expect(resultado.mock.calls[0][0]).toMatchObject({ veredicto: 'revision', recuperacionActiva: false })
    await render(c, { bloqueado: true })
    expect(boton('Consultar explicación').disabled).toBe(true)
  })

  it.each(['recuperacion_libre', 'completar'] as const)('%s acepta una respuesta breve y su sinónimo documentado', async tipo => {
    await render(ejemplo(tipo))
    expect(boton('Comprobar').disabled).toBe(true)
    await escribir('alpha')
    await pulsar(boton('Comprobar'))
    expect(resultado).toHaveBeenLastCalledWith(expect.objectContaining({ veredicto: 'correcta', recuperacionActiva: true, respuestaDada: 'alpha' }))
  })

  it.each(['opcion_multiple', 'verdadero_falso'] as const)('%s evalúa la opción elegida y oculta toda corrección durante examen', async tipo => {
    const c = ejemplo(tipo, { opciones: [
      { texto: tipo === 'verdadero_falso' ? 'Verdadero' : 'alfa', correcta: true, por_que: 'EXPLICACIÓN CORRECTA' },
      { texto: tipo === 'verdadero_falso' ? 'Falso' : 'beta', correcta: false, por_que: 'EXPLICACIÓN DISTRACTOR' },
    ] })
    await render(c, { ocultarFeedback: true })
    const falso = c.evaluacion.opciones![1].texto
    const radio = [...host.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find(b => b.lastElementChild?.textContent === falso)!
    expect(boton('Comprobar respuesta').disabled).toBe(true)
    await pulsar(radio)
    // Elegir una opción no registra el intento: un toque accidental no puede dejar un fallo permanente.
    expect(resultado).not.toHaveBeenCalled()
    await pulsar(boton('Comprobar respuesta'))
    expect(resultado.mock.calls[0][0]).toMatchObject({ veredicto: 'incorrecta', respuestaDada: falso, recuperacionActiva: false })
    await render(c, { bloqueado: true, ocultarFeedback: true })
    expect(host.textContent).not.toMatch(/EXPLICACIÓN|Respuesta correcta/)
    expect(host.querySelector('.fallo, .acierto, .correcta-oculta')).toBeNull()
    expect(radio.getAttribute('aria-checked')).toBe('true')
    expect([...host.querySelectorAll<HTMLButtonElement>('[role="radio"]')].every(b => b.disabled)).toBe(true)
  })

  it('las flechas exigen completar todas las variables y distinguen una respuesta parcial', async () => {
    const c = ejemplo('prediccion_direccional', { flechas: [
      { variable: 'Variable alfa', direccion: 'sube' }, { variable: 'Variable beta', direccion: 'baja' },
    ] })
    await render(c)
    await pulsar(host.querySelector<HTMLButtonElement>('[aria-label="Variable alfa aumenta"]')!)
    expect(boton('Comprobar flechas').disabled).toBe(true)
    await pulsar(host.querySelector<HTMLButtonElement>('[aria-label="Variable beta aumenta"]')!)
    await pulsar(boton('Comprobar flechas'))
    expect(resultado.mock.calls[0][0]).toMatchObject({ veredicto: 'parcial', respuestaDada: 'Variable alfa: ↑, Variable beta: ↑' })
  })

  it('ordenar registra el orden elegido y un nuevo intento empieza con la secuencia vacía', async () => {
    const c = ejemplo('secuencia', { pasos: ['Primero', 'Después', 'Finalmente'] })
    await render(c)
    for (const texto of ['Primero', 'Después', 'Finalmente']) await pulsar(boton(texto))
    await pulsar(boton('Comprobar orden'))
    expect(resultado.mock.calls[0][0]).toMatchObject({ veredicto: 'correcta', respuestaDada: 'Primero → Después → Finalmente' })
    await render(c, { semilla: 'QA-sesion:1' })
    expect(host.querySelectorAll('ol li')).toHaveLength(0)
    expect(boton('Comprobar orden').disabled).toBe(true)
    expect(resultado).toHaveBeenCalledTimes(1)
  })

  it('relacionar acepta dos fichas derechas equivalentes, sin depender de sus índices barajados', async () => {
    const c = ejemplo('relacionar', { pares: [
      { izquierda: 'Elemento alfa', derecha: 'Grupo compartido' },
      { izquierda: 'Elemento beta', derecha: 'Grupo compartido' },
    ] })
    await render(c)
    await pulsar(boton('Elemento alfa'))
    const derechas = [...host.querySelectorAll<HTMLButtonElement>('.rejilla > div:last-child button')]
    await pulsar(derechas[1])
    await pulsar(boton('Elemento beta'))
    await pulsar(derechas[0])
    await pulsar(boton('Comprobar parejas'))
    expect(resultado.mock.calls[0][0]).toMatchObject({ veredicto: 'correcta', recuperacionActiva: true })
  })

  it('clasificar conserva cada asignación y evalúa todos los elementos', async () => {
    const c = ejemplo('clasificar', { grupos: [
      { nombre: 'Grupo uno', elementos: ['Elemento alfa'] }, { nombre: 'Grupo dos', elementos: ['Elemento beta'] },
    ] })
    await render(c)
    const grupos = [...host.querySelectorAll<HTMLButtonElement>('button.zona')]
    await pulsar(boton('Elemento alfa')); await pulsar(grupos[0])
    expect(boton('Comprobar clasificación').disabled).toBe(true)
    await pulsar(boton('Elemento beta')); await pulsar(grupos[1])
    await pulsar(boton('Comprobar clasificación'))
    expect(resultado.mock.calls[0][0]).toMatchObject({ veredicto: 'correcta', respuestaDada: 'Elemento alfa: Grupo uno; Elemento beta: Grupo dos' })
  })
})
