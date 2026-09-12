// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * La copia local de un módulo es válida mientras no cambie la versión del
 * corpus. Estas pruebas fijan esa garantía por los dos extremos: no se vuelve a
 * descargar lo ya guardado, y una versión nueva nunca se sirve desde la antigua.
 */
const almacen = new Map<string, unknown>()
const consultas = vi.fn()

vi.mock('../store/db', () => ({
  leer: async (clave: string) => almacen.get(clave) ?? null,
  escribir: async (clave: string, valor: unknown) => { almacen.set(clave, valor) },
  clavesConPrefijo: async (prefijo: string) => [...almacen.keys()].filter(c => c.startsWith(prefijo)),
  borrar: async (claves: string[]) => { for (const clave of claves) almacen.delete(clave) },
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'estudiante' } } } }) },
    from: () => ({
      select: () => ({
        eq: (_columna: string, path: string) => ({
          maybeSingle: async () => {
            consultas(path)
            if (errorRemoto) return { data: null, error: { status: 403, message: 'Unavailable' } }
            return { data: { payload: respuestas.get(path) ?? null }, error: null }
          },
        }),
      }),
    }),
  },
}))

const respuestas = new Map<string, unknown>()
let errorRemoto = false

function indice(version: string) {
  return {
    corpus_version: version,
    modulos: [{
      module_id: 'MOD-PRUEBA', orden: 1, titulo: 'Módulo de prueba', n_conceptos: 1,
      sesiones: [{ sesion_id: 'S1', titulo: 'Sesión', conceptos: ['c1'] }],
    }],
  }
}

function modulo(version: string, objetivo: string) {
  return {
    corpus_version: version,
    conceptos: [{ concept_id: 'c1', objetivo }],
  }
}

vi.mock('../data/integridad', () => ({
  validarIndicePublicado: (crudo: unknown) => crudo,
  validarModuloPublicado: (crudo: any) => crudo.conceptos,
}))

async function cargarModuloLimpio() {
  vi.resetModules()
  return await import('../data/corpus')
}

beforeEach(() => {
  almacen.clear()
  respuestas.clear()
  consultas.mockClear()
  errorRemoto = false
})
afterEach(() => vi.restoreAllMocks())

describe('caché del corpus por versión', () => {
  it('no vuelve a descargar un módulo ya guardado para la misma versión', async () => {
    respuestas.set('index.json', indice('1.0.5'))
    respuestas.set('modules/MOD-PRUEBA.json', modulo('1.0.5', 'primera carga'))

    const primera = await cargarModuloLimpio()
    await primera.cargarModulo('MOD-PRUEBA')
    expect(consultas.mock.calls.map(([path]) => path)).toContain('modules/MOD-PRUEBA.json')

    // Una visita posterior parte de cero en memoria, pero conserva el almacén local.
    consultas.mockClear()
    const segunda = await cargarModuloLimpio()
    const conceptos = await segunda.cargarModulo('MOD-PRUEBA')

    expect(conceptos[0].objetivo).toBe('primera carga')
    expect(consultas.mock.calls.map(([path]) => path)).not.toContain('modules/MOD-PRUEBA.json')
  })

  it('descarga de nuevo el módulo cuando cambia la versión del corpus', async () => {
    respuestas.set('index.json', indice('1.0.5'))
    respuestas.set('modules/MOD-PRUEBA.json', modulo('1.0.5', 'versión anterior'))
    const primera = await cargarModuloLimpio()
    await primera.cargarModulo('MOD-PRUEBA')

    respuestas.set('index.json', indice('1.0.6'))
    respuestas.set('modules/MOD-PRUEBA.json', modulo('1.0.6', 'versión nueva'))
    consultas.mockClear()

    const segunda = await cargarModuloLimpio()
    const conceptos = await segunda.cargarModulo('MOD-PRUEBA')

    expect(conceptos[0].objetivo).toBe('versión nueva')
    expect(consultas.mock.calls.map(([path]) => path)).toContain('modules/MOD-PRUEBA.json')
  })

  it('descarta las copias locales de versiones anteriores', async () => {
    respuestas.set('index.json', indice('1.0.5'))
    respuestas.set('modules/MOD-PRUEBA.json', modulo('1.0.5', 'anterior'))
    const primera = await cargarModuloLimpio()
    await primera.cargarModulo('MOD-PRUEBA')
    expect([...almacen.keys()].some(clave => clave.includes(':1.0.5:'))).toBe(true)

    respuestas.set('index.json', indice('1.0.6'))
    respuestas.set('modules/MOD-PRUEBA.json', modulo('1.0.6', 'nueva'))
    const segunda = await cargarModuloLimpio()
    await segunda.cargarIndice()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect([...almacen.keys()].some(clave => clave.includes(':1.0.5:'))).toBe(false)
  })

  it('pide siempre el índice: es lo que revela una versión nueva', async () => {
    respuestas.set('index.json', indice('1.0.5'))
    const primera = await cargarModuloLimpio()
    await primera.cargarIndice()
    consultas.mockClear()

    const segunda = await cargarModuloLimpio()
    await segunda.cargarIndice()
    expect(consultas.mock.calls.map(([path]) => path)).toContain('index.json')
  })

  it('conserva índice, migraciones, progreso, otras cuentas y módulos de versiones más nuevas', async () => {
    const conservar = ['corpus:estudiante:index.json', 'corpus:estudiante:concept-id-migrations.json',
      'corpus:estudiante:quarantine.json', 'corpus:estudiante:1.0.6:modules/MOD-PRUEBA.json',
      'corpus:otra-cuenta:1.0.4:modules/MOD-PRUEBA.json', 'nbme-state:estudiante', 'state:estudiante']
    for (const key of conservar) almacen.set(key, { preserved: true })
    almacen.set('corpus:estudiante:1.0.4:modules/MOD-PRUEBA.json', {})
    respuestas.set('index.json', indice('1.0.5'))
    await (await cargarModuloLimpio()).cargarIndice()
    await vi.waitFor(() => expect(almacen.has('corpus:estudiante:1.0.4:modules/MOD-PRUEBA.json')).toBe(false))
    for (const key of conservar) expect(almacen.has(key), key).toBe(true)
  })

  it('recupera índice, migraciones y módulo de una visita previa sin conexión', async () => {
    respuestas.set('index.json', indice('1.0.5'))
    respuestas.set('modules/MOD-PRUEBA.json', modulo('1.0.5', 'copia offline'))
    respuestas.set('concept-id-migrations.json', { from_corpus_version: '1.0.0', to_corpus_version: '1.0.1', map: { anterior: 'actual' } })
    almacen.set('corpus:estudiante:1.0.4:modules/MOD-PRUEBA.json', {})
    const online = await cargarModuloLimpio()
    await Promise.all([online.cargarModulo('MOD-PRUEBA'), online.cargarMigraciones()])
    await vi.waitFor(() => expect(almacen.has('corpus:estudiante:1.0.4:modules/MOD-PRUEBA.json')).toBe(false))
    errorRemoto = true
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const offline = await cargarModuloLimpio()
    expect((await offline.cargarIndice()).corpus_version).toBe('1.0.5')
    expect(await offline.cargarMigraciones()).toEqual({ anterior: 'actual' })
    expect((await offline.cargarModulo('MOD-PRUEBA'))[0].objetivo).toBe('copia offline')
  })

  it('no sustituye una denegación online por el índice previamente guardado', async () => {
    respuestas.set('index.json', indice('1.0.5'))
    await (await cargarModuloLimpio()).cargarIndice()
    errorRemoto = true
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    await expect((await cargarModuloLimpio()).cargarIndice()).rejects.toThrow('No se pudo cargar')
  })
})
