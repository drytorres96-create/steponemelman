import { createClient } from '@supabase/supabase-js'
import projectConfig from '../../project.config.json'

// These are public application coordinates. Authorization lives in database RLS.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || projectConfig.supabaseUrl,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || projectConfig.supabasePublishableKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
)
