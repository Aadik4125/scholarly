import { createClient } from '@supabase/supabase-js'

// Both values are public by design (the publishable key is safe to ship in the browser);
// the secret/service_role key is never used by this app.
const url = import.meta.env.VITE_SUPABASE_URL || 'https://eevyickklkpxhusbudim.supabase.co'
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_AjPc2wC8y8m_n60XcOT2Yg_Sb5oJsNU'

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})
