import { supabase } from './supabase'
import { getAnonId } from './usage'

/** Headers that identify the caller to the server: the Supabase access token when signed in,
 *  plus the anonymous browser id used for the free-analysis limit. */
export async function apiHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Anon-Id': getAnonId() }
  try {
    const { data } = await supabase.auth.getSession()
    if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`
  } catch {
    /* continue as anonymous */
  }
  return headers
}
