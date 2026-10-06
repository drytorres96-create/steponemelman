import { parseNbmeState } from '../../src/nbme/model'
import { estadoNbmeReal, NBME_REAL_TOKEN, NBME_REAL_USER } from './nbme-real-fixture'

/** Synthetic in-memory remote progress. No network/database client is imported here. */
const parametros = new URL(location.href).searchParams
const conProveedorReal = parametros.get('proveedor') === 'nbme-real'
let row = { user_id: NBME_REAL_USER, state: estadoNbmeReal(), revision: 1,
  generation: 'synthetic-nbme-generation', updated_at: new Date().toISOString() }
export const supabase = {
  auth: { getSession: async () => ({ data: { session: conProveedorReal
    ? { access_token: NBME_REAL_TOKEN, user: { id: NBME_REAL_USER } }
    : parametros.get('ia') === '1' ? { access_token: NBME_REAL_TOKEN, user: { id: 'QA-user' } } : null }, error: null }) },
  from(table: string) {
    if (!conProveedorReal || table !== 'nbme_state') throw new Error('Only synthetic nbme_state is available in this harness.')
    return { select: () => ({ eq: (_field: string, userId: string) => ({ maybeSingle: async () => ({
      data: userId === NBME_REAL_USER ? structuredClone(row) : null, error: null,
    }) }) }) }
  },
  async rpc(name: string, args: { p_state: unknown; p_expected_revision: number; p_generation: string | null }) {
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
