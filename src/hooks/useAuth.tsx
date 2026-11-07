import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { track } from '../lib/analytics'

interface AuthContextValue {
  user: User | null
  session: Session | null
  /** True until the initial session (including an OAuth redirect return) has been resolved. */
  loading: boolean
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/** A sign-up is the first sign-in: Supabase stamps created_at and last_sign_in_at together. */
function maybeTrackSignUp(user: User) {
  const created = Date.parse(user.created_at)
  const last = Date.parse(user.last_sign_in_at ?? '')
  if (!Number.isFinite(created) || !Number.isFinite(last) || Math.abs(last - created) > 60_000) return
  const key = `scholarly.signUpTracked.${user.id}`
  try {
    if (localStorage.getItem(key)) return
    localStorage.setItem(key, '1')
  } catch {
    /* fall through and track anyway */
  }
  track('sign_up', { method: 'Google' })
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next)
      setLoading(false)
      if (event === 'SIGNED_IN' && next?.user) maybeTrackSignUp(next.user)
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      // Come back to the page the visitor signed in from (the home page for the upload flow).
      options: { redirectTo: `${window.location.origin}${window.location.pathname}` },
    })
    if (error) throw error
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const value = useMemo(
    () => ({ user: session?.user ?? null, session, loading, signInWithGoogle, signOut }),
    [session, loading, signInWithGoogle, signOut],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
