import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ generar: vi.fn() }))
vi.mock('../lib/recuperacion-nbme-ia', () => ({ generarRecuperacionNbme: mock.generar }))
import { RecuperacionNbme } from './RecuperacionNbme'
import { claveRecuperacion, type ContenidoRecuperacion } from './recuperacion-modelo'

const origen = { qid: 'QA-P0001', revision: 'qa-r1', optionId: 'B', attemptId: 'qa-session:0' }
const contenido: ContenidoRecuperacion = { objetivo: 'Recover the synthetic alphabet order.', ejercicios: [
  { id: 'qa-1', tipo: 'completar', pregunta: 'The first synthetic token is ____.', respuesta: 'alpha', explicacion: 'Alpha comes first.', evidencia: 'The first synthetic token is alpha.', source: { title: 'Synthetic source', page: 3, conceptId: 'QA-C1' } },
  { id: 'qa-2', tipo: 'verdadero_falso', pregunta: 'The first synthetic token is alpha.', respuesta: 'Verdadero', explicacion: 'This matches the source.', evidencia: 'The first synthetic token is alpha.' },
  { id: 'qa-3', tipo: 'seleccion', pregunta: 'The second synthetic token is ____.', respuesta: 'beta', alternativas: ['alpha', 'beta', 'gamma'], explicacion: 'Beta comes second.', evidencia: 'The second synthetic token is beta.' },
  { id: 'qa-4', tipo: 'discriminar', pregunta: 'The last synthetic token is ____.', respuesta: 'gamma', alternativas: ['beta', 'gamma'], explicacion: 'Gamma comes last.', evidencia: 'The last synthetic token is gamma.' },
] }
let host: HTMLDivElement, root: Root
const terminar = vi.fn()
const actividad = vi.fn()

const boton = (texto: string) => {
  const el = [...host.querySelectorAll('button')].find(b => b.textContent?.startsWith(texto))
  if (!el) throw new Error(`Botón no encontrado: ${texto}`)
  return el
}
const pulsar = async (texto: string) => { await act(async () => boton(texto).click()) }
const renderizar = async (ownerId: string | null = 'qa-owner', actual = origen) => {
  await act(async () => root.render(<RecuperacionNbme ownerId={ownerId} origen={actual} onTerminar={terminar} onActividad={actividad} />))
}
const escribir = async (texto: string) => {
  const input = host.querySelector<HTMLInputElement>('input[type="text"]')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, texto)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const elegir = async (valor: string) => {
  const input = [...host.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find(i => i.value === valor)!
  await act(async () => input.click())
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  localStorage.clear(); terminar.mockReset(); actividad.mockReset()
  mock.generar.mockReset().mockResolvedValue({ estado: 'ok', data: contenido })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks() })

describe('recuperar un fallo con una pregunta por turno', () => {
  it('requiere trigger manual, oculta soluciones y termina los cuatro formatos regresando al NBME', async () => {
    await renderizar()
    expect(mock.generar).not.toHaveBeenCalled()
    expect(actividad).not.toHaveBeenCalled()
    await pulsar('Practicar este error con IA')
    expect(actividad).toHaveBeenCalledExactlyOnceWith(true)
    expect(mock.generar).toHaveBeenCalledOnce()
    expect(host.textContent).toContain('Ejercicio 1 de 4')
    expect(host.textContent).not.toContain('Alpha comes first.')
    expect(host.textContent).not.toContain('Synthetic source')
    expect(host.textContent).not.toContain('The second synthetic token')
    expect(boton('Comprobar respuesta').disabled).toBe(true)
    await escribir('alpha'); await pulsar('Comprobar respuesta')
    expect(host.textContent).toContain('Correcto.')
    expect(host.querySelector('.recuperacion-feedback.correct')).not.toBeNull()
    expect(host.textContent).toContain('Alpha comes first.')
    expect(host.textContent).toContain('Synthetic source · página 3')
    expect(host.querySelector<HTMLInputElement>('input[type="text"]')!.disabled).toBe(true)
    await pulsar('Siguiente ejercicio')
    expect(host.querySelector('.recuperacion-opcion.correct, .recuperacion-opcion.incorrect')).toBeNull()
    expect(host.textContent).not.toContain('Respuesta correcta')
    await elegir('Falso')
    expect(host.querySelector('.recuperacion-opcion.elegida input')?.getAttribute('value')).toBe('Falso')
    expect(host.querySelector('.recuperacion-opcion.correct, .recuperacion-opcion.incorrect')).toBeNull()
    await pulsar('Comprobar respuesta')
    expect(host.textContent).toContain('Revisa el dato decisivo.')
    expect(host.querySelector('.recuperacion-feedback.incorrect')).not.toBeNull()
    expect(host.querySelector('.recuperacion-opcion.correct input')?.getAttribute('value')).toBe('Verdadero')
    expect(host.querySelector('.recuperacion-opcion.incorrect input')?.getAttribute('value')).toBe('Falso')
    expect(host.querySelector('.recuperacion-opcion.elegida')).toBeNull()
    expect(host.textContent).toContain('Tu respuesta · incorrecta')
    await pulsar('Siguiente ejercicio')
    await elegir('beta'); await pulsar('Comprobar respuesta'); await pulsar('Siguiente ejercicio')
    await elegir('gamma'); await pulsar('Comprobar respuesta'); await pulsar('Terminar recuperación')
    expect(host.textContent).toContain('Recuperación terminada')
    expect(host.textContent).toContain('4 ejercicios; 3 acertados')
    const guardado = JSON.parse(localStorage.getItem(claveRecuperacion('qa-owner', origen)!)!)
    expect(guardado.cerrada).toBe(true)
    expect(guardado.cursor).toBe(4)
    await pulsar('Ir a la siguiente pregunta')
    expect(terminar).toHaveBeenCalledExactlyOnceWith('siguiente')
    expect(actividad.mock.calls.map(c => c[0])).toEqual([true])
    expect(mock.generar).toHaveBeenCalledOnce()
  })

  it('reload retoma el mismo ejercicio y borrador sin otra llamada ni nueva sesión', async () => {
    await renderizar(); await pulsar('Practicar este error con IA')
    await escribir('alpha'); await pulsar('Comprobar respuesta'); await pulsar('Siguiente ejercicio')
    await elegir('Falso')
    await act(async () => root.unmount())
    root = createRoot(host); await renderizar()
    expect(actividad).toHaveBeenCalledExactlyOnceWith(true)
    expect(host.textContent).toContain('Retomar recuperación · 2 de 4')
    await pulsar('Retomar recuperación')
    expect(actividad.mock.calls.map(c => c[0])).toEqual([true, true])
    expect(host.querySelector<HTMLInputElement>('input[value="Falso"]')!.checked).toBe(true)
    expect(host.textContent).not.toContain('This matches the source.')
    await pulsar('Comprobar respuesta')
    expect(host.textContent).toContain('Revisa el dato decisivo.')
    expect(mock.generar).toHaveBeenCalledOnce()
    await pulsar('Pausar y volver al NBME')
    expect(terminar).toHaveBeenCalledExactlyOnceWith('original')
    expect(actividad.mock.calls.map(c => c[0])).toEqual([true, true])
  })

  it('abre y retoma la práctica de fuente verificada con procedencia visible y termina regresando al NBME', async () => {
    const procedencia = 'Preparada desde el material verificado; la IA no pudo completar la selección.'
    const nbmePrevio = JSON.stringify({ sessions: { 'qa-session': { status: 'active' } }, attempts: { 'qa-session:0': { optionId: 'B', correct: false } } })
    localStorage.setItem('step1-backup:nbme-state:qa-owner', nbmePrevio)
    mock.generar.mockResolvedValue({ estado: 'ok', data: { ...contenido, preparacion: 'fuente_verificada' } })
    await renderizar()
    expect(host.textContent).not.toContain(procedencia)
    await pulsar('Practicar este error con IA')
    expect(host.textContent).toContain(procedencia)
    await escribir('alpha'); await pulsar('Comprobar respuesta'); await pulsar('Siguiente ejercicio')
    await elegir('Falso')
    await act(async () => root.unmount())
    root = createRoot(host); await renderizar()
    expect(host.textContent).not.toContain(procedencia)
    await pulsar('Retomar recuperación')
    expect(host.textContent).toContain(procedencia)
    expect(host.querySelector<HTMLInputElement>('input[value="Falso"]')!.checked).toBe(true)
    await pulsar('Comprobar respuesta'); await pulsar('Siguiente ejercicio')
    await elegir('beta'); await pulsar('Comprobar respuesta'); await pulsar('Siguiente ejercicio')
    await elegir('gamma'); await pulsar('Comprobar respuesta'); await pulsar('Terminar recuperación')
    await pulsar('Volver a la pregunta original')
    expect(terminar).toHaveBeenCalledExactlyOnceWith('original')
    expect(mock.generar).toHaveBeenCalledOnce()
    expect(localStorage.getItem('step1-backup:nbme-state:qa-owner')).toBe(nbmePrevio)
    const guardada = JSON.parse(localStorage.getItem(claveRecuperacion('qa-owner', origen)!)!)
    expect(guardada).toMatchObject({ cursor: 4, cerrada: true, contenido: { preparacion: 'fuente_verificada' } })
  })

  it.each([undefined, 'ia'] as const)('la preparación %s carga sin atribuirla a una selección fallida', async preparacion => {
    mock.generar.mockResolvedValue({ estado: 'ok', data: { ...contenido, ...(preparacion ? { preparacion } : {}) } })
    await renderizar(); await pulsar('Practicar este error con IA')
    expect(host.textContent).toContain('Ejercicio 1 de 4')
    expect(host.textContent).not.toContain('la IA no pudo completar la selección')
    await escribir('alpha'); await pulsar('Comprobar respuesta')
    expect(host.textContent).toContain('El ejercicio y su respuesta se apoyan en este fragmento.')
  })

  it('mantiene la cuenta y revisión separadas, y cancela la generación antigua al cambiarlas', async () => {
    let resolver: (v: unknown) => void = () => {}
    mock.generar.mockImplementation(() => new Promise(resolve => { resolver = resolve }))
    await renderizar(); await pulsar('Practicar este error con IA')
    const signal = mock.generar.mock.calls[0][1] as AbortSignal
    await renderizar('qa-other')
    expect(signal.aborted).toBe(true)
    expect(actividad.mock.calls.map(c => c[0])).toEqual([true])
    await act(async () => { resolver({ estado: 'ok', data: contenido }) })
    expect(localStorage.getItem(claveRecuperacion('qa-owner', origen)!)).toBeNull()
    expect(host.textContent).not.toContain(contenido.objetivo)
    mock.generar.mockResolvedValue({ estado: 'ok', data: contenido })
    await pulsar('Practicar este error con IA')
    expect(localStorage.getItem(claveRecuperacion('qa-other', origen)!)).not.toBeNull()
    await renderizar('qa-owner')
    expect(host.textContent).not.toContain('Retomar recuperación')
    await renderizar('qa-other', { ...origen, revision: 'qa-r2' })
    expect(host.textContent).not.toContain('Retomar recuperación')
  })

  it('logout desmonta la ayuda y aborta sin dejar contenido de la cuenta anterior', async () => {
    mock.generar.mockImplementation(() => new Promise(() => {}))
    await renderizar(); await pulsar('Practicar este error con IA')
    const signal = mock.generar.mock.calls[0][1] as AbortSignal
    await renderizar(null)
    expect(signal.aborted).toBe(true)
    expect(host.textContent).toBe('')
    expect(actividad.mock.calls.map(c => c[0])).toEqual([true])
  })

  it('sin cuota muestra alternativa y permite regresar sin reintentar automáticamente', async () => {
    mock.generar.mockResolvedValue({ estado: 'sin_ia', motivo: 'Cuota agotada.' })
    await renderizar(); await pulsar('Practicar este error con IA')
    expect(host.textContent).toContain('Cuota agotada.')
    expect(host.textContent).toContain('Conservas el material y puedes continuar.')
    expect(mock.generar).toHaveBeenCalledOnce()
    expect(actividad.mock.calls.map(c => c[0])).toEqual([true, false])
    expect(localStorage.getItem(claveRecuperacion('qa-owner', origen)!)).toBeNull()
    await pulsar('Volver a la pregunta original')
    expect(terminar).toHaveBeenCalledExactlyOnceWith('original')
    expect(actividad.mock.calls.map(c => c[0])).toEqual([true, false])
  })

  it('un error del servidor permite un reintento manual y muestra la espera mientras se prepara', async () => {
    let completar: (v: unknown) => void = () => {}
    mock.generar.mockResolvedValueOnce({ estado: 'sin_ia', motivo: 'No se pudo preparar la recuperación. Puedes volver a intentarlo en 60 s.' })
      .mockImplementationOnce(() => new Promise(resolve => { completar = resolve }))
    await renderizar(); await pulsar('Practicar este error con IA')
    expect(host.textContent).toContain('Puedes volver a intentarlo en 60 s.')
    expect(host.querySelector('section')!.getAttribute('aria-busy')).toBe('false')
    expect(mock.generar).toHaveBeenCalledOnce()
    expect(localStorage.getItem(claveRecuperacion('qa-owner', origen)!)).toBeNull()
    await pulsar('Practicar este error con IA')
    expect(mock.generar).toHaveBeenCalledTimes(2)
    expect(host.querySelector('section')!.getAttribute('aria-busy')).toBe('true')
    expect(host.querySelector('progress')!.getAttribute('aria-label')).toBe('Generando ejercicios de recuperación')
    expect(host.querySelector('progress')!.hasAttribute('value')).toBe(false)
    expect(host.textContent).toContain('Puede tardar hasta un minuto.')
    expect(host.textContent).not.toContain('Puedes volver a intentarlo en 60 s.')
    expect(boton('Practicar este error con IA').disabled).toBe(true)
    expect(boton('Volver a la pregunta original').disabled).toBe(false)
    expect(boton('Ir a la siguiente pregunta').disabled).toBe(false)
    expect(localStorage.getItem(claveRecuperacion('qa-owner', origen)!)).toBeNull()
    await act(async () => { completar({ estado: 'ok', data: contenido }) })
    expect(host.textContent).toContain('Ejercicio 1 de 4')
    expect(host.querySelector('progress')).toBeNull()
    expect(host.querySelector('section')!.getAttribute('aria-busy')).toBe('false')
    expect(mock.generar).toHaveBeenCalledTimes(2)
    expect(terminar).not.toHaveBeenCalled()
    expect(actividad.mock.calls.map(c => c[0])).toEqual([true, false, true])
    expect(localStorage.getItem(claveRecuperacion('qa-owner', origen)!)).not.toBeNull()
  })

  it.each([
    ['Volver a la pregunta original', 'original'],
    ['Ir a la siguiente pregunta', 'siguiente'],
  ] as const)('%s cancela la generación pendiente e ignora una respuesta tardía', async (botonSalida, destino) => {
    let completar: (v: unknown) => void = () => {}
    mock.generar.mockImplementation(() => new Promise(resolve => { completar = resolve }))
    await renderizar(); await pulsar('Practicar este error con IA')
    const signal = mock.generar.mock.calls[0][1] as AbortSignal
    expect(host.textContent).toContain('Puede tardar hasta un minuto.')
    expect(boton(botonSalida).disabled).toBe(false)
    await pulsar(botonSalida)
    expect(signal.aborted).toBe(true)
    expect(terminar).toHaveBeenCalledExactlyOnceWith(destino)
    expect(host.querySelector('section')!.getAttribute('aria-busy')).toBe('false')
    expect(host.querySelector('progress')).toBeNull()
    await act(async () => { completar({ estado: 'ok', data: contenido }) })
    expect(host.textContent).not.toContain(contenido.objetivo)
    expect(host.textContent).not.toContain('Ejercicio 1 de 4')
    expect(localStorage.getItem(claveRecuperacion('qa-owner', origen)!)).toBeNull()
    expect(mock.generar).toHaveBeenCalledOnce()
    expect(terminar).toHaveBeenCalledOnce()
  })

  it('una copia ilegible no se usa ni modifica el intento, y una falla de guardado queda visible', async () => {
    localStorage.setItem(claveRecuperacion('qa-owner', origen)!, '{ broken')
    await renderizar()
    expect(host.textContent).toContain('La recuperación guardada no se pudo leer.')
    expect(mock.generar).not.toHaveBeenCalled()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('disk full') })
    await pulsar('Practicar este error con IA')
    expect(host.textContent).toContain('No se pudo guardar esta práctica')
    expect(host.textContent).toContain('Ejercicio 1 de 4')
    await escribir('alpha'); await pulsar('Comprobar respuesta')
    expect(host.textContent).toContain('Correcto.')
  })
})
