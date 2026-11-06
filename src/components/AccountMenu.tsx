import { useEffect, useRef, useState } from 'react'
import { LogOut, User as UserIcon } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

export default function AccountMenu() {
  const { user, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  if (!user) return null
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
