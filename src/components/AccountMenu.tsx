import { useEffect, useRef, useState } from 'react'
import { LogIn, LogOut, User as UserIcon } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import SignInModal from './SignInModal'

export default function AccountMenu() {
  const { user, loading, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const [signInOpen, setSignInOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  // Wait for the session check so a signed-in visitor doesn't see "Sign in" flash first.
  if (loading) return null
  if (!user) {
    return (
      <>
        <button
          onClick={() => setSignInOpen(true)}
          title="Sign in"
          className="ink-border flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-surface px-3 text-sm font-bold text-ink hover:bg-surface-hover"
        >
          <LogIn size={15} />
          <span className="hidden sm:inline">Sign in</span>
        </button>
        <SignInModal open={signInOpen} mode="optional" onClose={() => setSignInOpen(false)} />
      </>
    )
  }
  const meta = user.user_metadata ?? {}
  const name: string = meta.full_name || meta.name || user.email || 'Account'
  const picture: string | undefined = meta.avatar_url || meta.picture

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        title={name}
        aria-haspopup="menu"
        aria-expanded={open}
        className="ink-border flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-surface text-ink hover:bg-surface-hover"
      >
        {picture ? <img src={picture} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" /> : <UserIcon size={16} />}
      </button>
      {open && (
        <div role="menu" className="ink-border absolute right-0 z-40 mt-2 w-56 rounded-2xl bg-surface p-2 text-left shadow-[var(--shadow-card)]">
          <div className="px-3 py-2">
            <p className="truncate text-sm font-bold text-ink">{name}</p>
            {user.email && <p className="truncate text-xs text-ink-muted">{user.email}</p>}
          </div>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false)
              void signOut()
            }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-ink hover:bg-surface-hover"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}
