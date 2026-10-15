import { supabase } from './supabase'
import { NBME_SOURCE_SAFETY_PATH, readNbmeSourceSafety } from '../nbme/source-safety'

/** Never use a persisted/previous policy to authorize original teaching material. */
export async function loadNbmeSourceSafety() {
  if (!navigator.onLine) return null
  try {
    const { data, error } = await supabase.from('nbme_assets').select('payload')
      .eq('path', NBME_SOURCE_SAFETY_PATH).abortSignal(AbortSignal.timeout(10000)).maybeSingle()
    return error || !navigator.onLine ? null : readNbmeSourceSafety(data?.payload)
  } catch { return null }
}
