// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cargarAdherencia, cargarPlanSemana, marcarCheckpoint, PlanEscrituraError } from './api'

/**
 * El cliente del plan no puede tumbar la portada. Leer nunca lanza: sin plan la
 * pantalla cae a las sesiones preparadas. Escribir sí distingue el fallo, porque
 * quien llama ya pintó la marca y tiene que poder volver atrás.
 */

const token = 'x'.repeat(30)
const checkpoint = { id: 64, idx: 5, dia: 1, kind: 'tarjetas', label: 'Sesión 1/4', done: true, doneAt: '2026-09-14T10:00:00Z' }
const semana = {
  eventoId: '3f04384a-f8fa-4fd8-a913-f44933157279',
  titulo: 'S2 · 14–19 sep · Reproductivo (1/2)',
  inicio: '2026-09-14', fin: '2026-09-19', nota: 'Por qué esta semana es así.',
  checkpoints: [checkpoint, { ...checkpoint, id: 19, idx: 18, dia: 4, kind: 'descanso', label: 'Descanso', done: false, doneAt: null }],
}
afterEach(() => vi.unstubAllGlobals())

describe('cliente del plan de la semana', () => {
  it('degrada a null sin token, con 503 y con la red caída', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    expect(await cargarPlanSemana('')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()

    fetch.mockResolvedValue(Response.json({ error: 'plan no configurado' }, { status: 503 }))
    expect(await cargarPlanSemana(token)).toBeNull()

    fetch.mockRejectedValue(new Error('offline'))
    expect(await cargarPlanSemana(token)).toBeNull()
  })

  it('descarta una semana cuyos checkpoints no se pueden leer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ...semana, checkpoints: [{ ...checkpoint, kind: 'inventado' }] })))
    expect(await cargarPlanSemana(token)).toBeNull()
  })

  it('lee la semana y la ordena por idx', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(semana))
    vi.stubGlobal('fetch', fetch)
    const plan = await cargarPlanSemana(token, '2026-09-14')
    expect(plan?.checkpoints.map(c => c.idx)).toEqual([5, 18])
    expect(plan?.nota).toBe('Por qué esta semana es así.')
    expect(fetch.mock.calls[0][0]).toBe('/api/plan/semana?hoy=2026-09-14')
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${token}`)
  })

  it('marcarCheckpoint devuelve lo releído, no lo enviado', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ ...checkpoint, done: false, doneAt: null }))
    vi.stubGlobal('fetch', fetch)
    const guardado = await marcarCheckpoint(64, true, token)
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ done: true })
    expect(guardado.done).toBe(false)
  })

  it('marcarCheckpoint avisa cuando el PATCH falla, para que la marca local se revierta', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)

    // El estado local es de quien llama: aquí se comprueba que el fallo llega y se puede deshacer.
    let enPantalla = false
    const marcar = async (done: boolean) => {
      const antes = enPantalla
      enPantalla = done
      try { enPantalla = (await marcarCheckpoint(64, done, token)).done } catch (causa) {
        enPantalla = antes
        return causa
      }
      return null
    }

    fetch.mockResolvedValue(Response.json({ error: 'no' }, { status: 503 }))
    expect(await marcar(true)).toBeInstanceOf(PlanEscrituraError)
    expect(enPantalla).toBe(false)

    fetch.mockRejectedValue(new Error('offline'))
    expect(await marcar(true)).toBeInstanceOf(PlanEscrituraError)
    expect(enPantalla).toBe(false)

    // Una respuesta ilegible tampoco deja una marca que la base no aceptó.
    fetch.mockResolvedValue(Response.json({ id: 64 }))
    expect(await marcar(true)).toBeInstanceOf(PlanEscrituraError)
    expect(enPantalla).toBe(false)

    fetch.mockResolvedValue(Response.json(checkpoint))
    expect(await marcar(true)).toBeNull()
    expect(enPantalla).toBe(true)
  })

  it('la adherencia junta las semanas por evento y descarta las que no responden', async () => {
    const otra = { ...semana, eventoId: 'S1', titulo: 'S1 · 7–12 sep', inicio: '2026-09-07' }
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json(semana))
      .mockResolvedValueOnce(Response.json(semana))
      .mockResolvedValueOnce(Response.json(otra))
      .mockResolvedValue(Response.json({ error: 'no' }, { status: 503 }))
    vi.stubGlobal('fetch', fetch)
    const bandas = await cargarAdherencia(token, 5)
    expect(bandas.map(b => b.eventoId)).toEqual(['S1', semana.eventoId])
    // El descanso no cuenta: sólo queda la tarea de la semana.
    expect(bandas[1]).toMatchObject({ hechas: 1, tareas: 1 })
  })
})
