import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * La carga de la semana es tolerante por diseño: una fila con el guion roto se
 * descarta con un aviso y las demás siguen siendo estudiables. El guardado del
 * avance, en cambio, reintenta antes de rendirse porque la posición es lo único
 * que esta tabla aporta.
 */
let respuesta: { data: unknown[] | null; error: unknown } = { data: [], error: null }
const actualizaciones = vi.fn()
let fallosDeActualizacion = 0

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => {
        const constructor = {
          neq: () => constructor,
          order: () => constructor,
          then: (resolver: (valor: typeof respuesta) => unknown) => Promise.resolve(respuesta).then(resolver),
        }
        return constructor
      },
      update: (patch: Record<string, unknown>) => ({
        eq: async (_columna: string, id: string) => {
          actualizaciones({ id, patch })
          if (fallosDeActualizacion > 0) { fallosDeActualizacion--; return { error: { message: 'offline' } } }
          return { error: null }
        },
      }),
    }),
  },
}))

const { cargarHistorialSesiones, guardarAvance, leerSesionSemanal } = await import('../semana/api')

const fila = (extra: Record<string, unknown> = {}) => ({
  id: '11111111-1111-4111-8111-111111111111',
  semana: 'S2', semana_inicio: '2026-09-14', dia: 3, orden: 1,
  titulo: 'Farmacología endocrina 1/4', subtitulo: 'Tiroides y suprarrenal',
  guion: [
    { kind: 'concepto', id: 'CPT-ENDOCRINE-012-9b1b8eed' },
    { kind: 'concepto', id: 'CPT-ENDOCRINE-012-2dee0672' },
    { kind: 'concepto', id: 'CPT-ENDOCRINE-012-f4c5531a' },
    { kind: 'pregunta', id: 'NBME27-P0009', revision: '4d17821c2539f7c3' },
  ],
  presupuesto_min: 30, estado: 'pendiente', cursor: 0,
  nbme_session_id: null, completada_en: null,
  created_at: '2026-09-12T00:00:00Z', updated_at: '2026-09-12T00:00:00Z',
  ...extra,
})

beforeEach(() => {
  vi.clearAllMocks()
  fallosDeActualizacion = 0
  respuesta = { data: [], error: null }
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('lectura de las sesiones de la semana', () => {
  it('mapea entera una fila válida', async () => {
    respuesta = { data: [fila()], error: null }
    const [sesion] = await cargarHistorialSesiones()
    expect(sesion).toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      semana: 'S2', semanaInicio: '2026-09-14', dia: 3, orden: 1,
      titulo: 'Farmacología endocrina 1/4', subtitulo: 'Tiroides y suprarrenal',
      guion: fila().guion, presupuestoMin: 30, estado: 'pendiente', cursor: 0,
      nbmeSessionId: null, completadaEn: null,
    })
  })

  it('descarta la fila con el guion corrupto sin tumbar la carga', async () => {
    respuesta = {
      data: [
        fila({ id: '22222222-2222-4222-8222-222222222222', guion: [{ kind: 'ejercicio', id: 'X' }] }),
        fila({ id: '33333333-3333-4333-8333-333333333333', guion: 'no es un guion' }),
        fila({ id: '44444444-4444-4444-8444-444444444444', guion: [{ kind: 'pregunta', id: 'NBME27-P0009' }] }),
        fila(),
      ],
      error: null,
    }
    const sesiones = await cargarHistorialSesiones()
    expect(sesiones).toHaveLength(1)
    expect(sesiones[0].id).toBe('11111111-1111-4111-8111-111111111111')
    expect(console.warn).toHaveBeenCalledTimes(3)
  })

  it('nunca deja el cursor fuera del guion y normaliza un presupuesto desconocido', () => {
    const sesion = leerSesionSemanal(fila({ cursor: 99, presupuesto_min: 17 }))!
    expect(sesion.cursor).toBe(4)
    expect(sesion.presupuestoMin).toBe(30)
  })

  it('avisa cuando la consulta falla en lugar de devolver una semana vacía', async () => {
    respuesta = { data: null, error: { message: 'offline' } }
    await expect(cargarHistorialSesiones()).rejects.toThrow(/historial de sesiones/)
  })
})

describe('guardado del avance', () => {
  it('envía sólo los campos que cambian', async () => {
    expect(await guardarAvance('sesion-1', { cursor: 4, estado: 'en_curso' })).toEqual({ ok: true })
    const { patch } = actualizaciones.mock.calls[0][0]
    expect(patch).toMatchObject({ cursor: 4, estado: 'en_curso' })
    expect(patch).not.toHaveProperty('nbme_session_id')
    expect(patch).not.toHaveProperty('completada_en')
  })

  it('reintenta una vez antes de avisar', async () => {
    fallosDeActualizacion = 1
    expect(await guardarAvance('sesion-1', { cursor: 1 })).toEqual({ ok: true })
    expect(actualizaciones).toHaveBeenCalledTimes(2)

    actualizaciones.mockClear()
    fallosDeActualizacion = 5
    const resultado = await guardarAvance('sesion-1', { cursor: 1 })
    expect(resultado.ok).toBe(false)
    expect(resultado.aviso).toMatch(/quedó registrado/)
    expect(actualizaciones).toHaveBeenCalledTimes(2)
  })
})
