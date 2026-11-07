import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Loader2 } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

/**
 * `required`: shown when a signed-out visitor starts a second analysis.
 * `optional`: opened from the header "Sign in" button; signing in is never needed for the first analysis.
 */
export default function SignInModal({
  open,
  fileName,
  onClose,
  mode = 'required',
}: {
  open: boolean
  fileName?: string | null
  onClose: () => void
  mode?: 'required' | 'optional'
}) {
  const { signInWithGoogle } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const go = async () => {
    setBusy(true)
    setError(null)
    try {
      await signInWithGoogle() // redirects away on success
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.')
      setBusy(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-labelledby="signin-title"
        >
          <motion.div
            initial={{ y: 12, scale: 0.97 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 12, scale: 0.97 }}
            onClick={(e) => e.stopPropagation()}
            className="ink-border relative w-full max-w-sm rounded-3xl bg-surface p-7 text-center shadow-[var(--shadow-card)]"
          >
            <button onClick={onClose} aria-label="Close" className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full text-ink-muted hover:bg-surface-hover">
              <X size={16} />
            </button>
            <h2 id="signin-title" className="font-display text-2xl tracking-wide text-ink">
              {mode === 'optional' ? 'SIGN IN TO SCHOLARLY' : 'CREATE A FREE ACCOUNT'}
            </h2>
            {mode === 'optional' ? (
              <p className="mt-3 text-sm text-ink-2">
                Your first analysis doesn't need an account. Sign in now with Google and you won't be asked again for
                your next paper.
              </p>
            ) : (
              <p className="mt-3 text-sm text-ink-2">
                Your first analysis was free. Sign up to keep analysing papers
                {fileName ? <> — we'll continue with <b className="text-ink">{fileName}</b> right after.</> : '.'}
              </p>
            )}
            <button
              onClick={go}
              disabled={busy}
              className="ink-border mt-5 flex w-full items-center justify-center gap-2.5 rounded-full bg-ink px-5 py-3 text-sm font-bold text-paper shadow-[var(--shadow-pop)] transition-transform hover:-translate-y-0.5 disabled:opacity-60"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <GoogleG />}
              Continue with Google
            </button>
            {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
            <p className="mt-4 text-xs text-ink-muted">
              We store your name and email. Papers stay in your browser. See our <a href="/privacy" className="underline">Privacy Policy</a> and <a href="/terms" className="underline">Terms</a>.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.5 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.2 5.5-4.7 7.2l7.6 5.9c4.4-4.1 6.9-10.1 6.9-17.6z" />
      <path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  )
}
