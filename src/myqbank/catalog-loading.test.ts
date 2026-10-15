import { beforeEach, expect, it, vi } from 'vitest'
import { myqbankConcepts } from '../../e2e/arnes/myqbank-fixture'
import type { Indice } from '../schema/concept'

const mock = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), session: vi.fn(), query: vi.fn(), modules: vi.fn() }))
vi.mock('../store/db', () => ({ leer: mock.read, escribir: mock.write }))
vi.mock('../data/corpus', () => ({ cargarTodo: mock.modules }))
vi.mock('../lib/supabase', () => ({ supabase: { auth: { getSession: mock.session }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mock.query }) }) }) } }))
import { buildConceptCatalog, loadConceptCatalog } from './catalog'
const index = { corpus_version: '1.2.3', modulos: [{ sesiones: [{ conceptos: myqbankConcepts.map(c => c.concept_id) }] }] } as Indice
beforeEach(() => {
  vi.resetAllMocks()
  mock.read.mockResolvedValue(null); mock.write.mockResolvedValue(undefined)
  mock.session.mockResolvedValue({ data: { session: { user: { id: 'test-owner' } } } })
  mock.modules.mockResolvedValue(myqbankConcepts)
})

it('derives a missing selector catalog from validated private modules of the current version', async () => {
  mock.query.mockResolvedValue({ data: null, error: null })
  expect(await loadConceptCatalog(index)).toEqual(buildConceptCatalog(index, myqbankConcepts).items)
  expect(mock.modules).toHaveBeenCalledWith(index.modulos)
  expect(mock.write).toHaveBeenCalledWith('myqbank-catalog:test-owner:1.2.3', buildConceptCatalog(index, myqbankConcepts))
})

it('never derives a catalog on a network or authorization error', async () => {
  mock.query.mockResolvedValue({ data: null, error: { status: 403 } })
  await expect(loadConceptCatalog(index)).rejects.toThrow('Could not load')
  expect(mock.modules).not.toHaveBeenCalled()
  expect(mock.write).not.toHaveBeenCalled()
})

it('reuses only a valid current-version cache belonging to this account', async () => {
  mock.read.mockResolvedValue(buildConceptCatalog(index, myqbankConcepts))
  await loadConceptCatalog(index)
  expect(mock.read).toHaveBeenCalledWith('myqbank-catalog:test-owner:1.2.3')
  expect(mock.query).not.toHaveBeenCalled()
  mock.read.mockResolvedValue({ ...buildConceptCatalog(index, myqbankConcepts), corpusVersion: '1.2.2' })
  mock.query.mockResolvedValue({ data: { payload: buildConceptCatalog(index, myqbankConcepts) }, error: null })
  await loadConceptCatalog(index)
  expect(mock.query).toHaveBeenCalledTimes(1)
})
