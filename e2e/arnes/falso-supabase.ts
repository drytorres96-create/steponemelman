import { parseNbmeState } from '../../src/nbme/model'
import { estadoNbmeReal, NBME_REAL_TOKEN, NBME_REAL_USER } from './nbme-real-fixture'
import { myqbankConcepts } from './myqbank-fixture'

/** Synthetic in-memory remote progress. No network/database client is imported here. */
const parametros = new URL(location.href).searchParams
const conProveedorReal = parametros.get('proveedor') === 'nbme-real'
const annotations = new Map<string, any>(JSON.parse(localStorage.getItem('qa-myqbank-annotations') ?? '[]'))
declare global { interface Window { __qaEditorialAssets?: Record<string, unknown>; __qaEditorialDelay?: Record<string, number>; __qaCatalogFailure?: boolean } }
let row = { user_id: NBME_REAL_USER, state: estadoNbmeReal(), revision: 1,
  generation: 'synthetic-nbme-generation', updated_at: new Date().toISOString() }
export const supabase = {
  auth: { getSession: async () => ({ data: { session: conProveedorReal
    ? { access_token: NBME_REAL_TOKEN, user: { id: NBME_REAL_USER } }
    : parametros.get('ia') === '1' ? { access_token: NBME_REAL_TOKEN, user: { id: 'QA-user' } } : null }, error: null }) },
  from(table: string) {
    if (table === 'myqbank_annotations') return { select: () => ({ eq: () => ({ order: () => ({ range: async (start: number, end: number) => ({ data: [...annotations.values()].slice(start,end+1), error: null }) }) }) }) }
    if (table === 'corpus_assets' || table === 'nbme_assets') return { select: () => ({ eq: (_field: string, path: string) => ({ maybeSingle: async () => {
      const payload = structuredClone(window.__qaEditorialAssets?.[path] ?? null)
      if (window.__qaEditorialDelay?.[path]) await new Promise(resolve => setTimeout(resolve, window.__qaEditorialDelay![path]))
      if (path.startsWith('myqbank/explanations/')) return {data:payload ? {payload} : null,error:null}
      if (window.__qaCatalogFailure) return {data:null,error: new Error('Synthetic unavailable catalog')}
      return ({
      data: table === 'corpus_assets' && path === 'myqbank/catalogs/1.0.5.json'
        ? {payload:{schemaVersion:1,corpusVersion:'1.0.5',items:myqbankConcepts.map(({concept_id,objetivo,clasificacion,calidad})=>({concept_id,objetivo,clasificacion,calidad}))}} : null,error:null }) } }) }) }
    if (!conProveedorReal || table !== 'nbme_state') throw new Error('Only synthetic nbme_state is available in this harness.')
    return { select: () => ({ eq: (_field: string, userId: string) => ({ maybeSingle: async () => ({
      data: userId === NBME_REAL_USER ? structuredClone(row) : null, error: null,
    }) }) }) }
  },
  async rpc(name: string, args: any) {
    if (name === 'sync_myqbank_annotation') {
      const prior = annotations.get(args.p_id)
      if ((prior?.revision ?? 0) !== args.p_expected_revision) return { data:{ok:false,row:prior},error:null }
      const saved = {id:args.p_id,user_id:NBME_REAL_USER,payload:args.p_payload,revision:(prior?.revision??0)+1}
      annotations.set(args.p_id,saved); localStorage.setItem('qa-myqbank-annotations',JSON.stringify([...annotations]))
      return {data:{ok:true,row:saved},error:null}
    }
    if (!conProveedorReal || name !== 'sync_nbme_state') throw new Error('Only synthetic sync_nbme_state is available in this harness.')
    const state = parseNbmeState(args.p_state)
    if (!state) return { data: null, error: new Error('Invalid synthetic state.') }
    if (args.p_generation !== row.generation || args.p_expected_revision !== row.revision) {
      return { data: { ok: false, kind: args.p_generation && args.p_generation !== row.generation ? 'reset' : 'conflict', row: structuredClone(row) }, error: null }
    }
    row = { ...row, state: structuredClone(state), revision: row.revision + 1, updated_at: new Date().toISOString() }
    return { data: { ok: true, kind: 'saved', row: structuredClone(row) }, error: null }
  },
}
