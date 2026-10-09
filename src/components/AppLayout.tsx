import { useEffect } from 'react'
import { NavLink, Navigate, Outlet, useLocation, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  LayoutDashboard,
  ShieldAlert,
  MessageCircleQuestion,
  PenLine,
  Fingerprint,
  Sparkles,
  History,
  FileText,
  Moon,
  Sun,
  UploadCloud,
  Loader2,
} from 'lucide-react'
import { useTheme } from '../hooks/useTheme'
import { CurrentPaperProvider, useCurrentPaper } from '../hooks/useCurrentPaper'

const navItems = [
  { to: '', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: 'consistency', label: 'Consistency', icon: ShieldAlert },
  { to: 'ask', label: 'Ask Paper', icon: MessageCircleQuestion },
  { to: 'writing', label: 'Writing', icon: PenLine },
  { to: 'similarity', label: 'Similarity', icon: Fingerprint },
  { to: 'novelty', label: 'Novelty', icon: Sparkles },
  { to: 'versions', label: 'Versions', icon: History },
]

export default function AppLayout() {
  const { paperId } = useParams()
  if (!paperId) return <Navigate to="/" replace />

  return (
    <CurrentPaperProvider paperId={paperId}>
      <AppLayoutInner paperId={paperId} />
    </CurrentPaperProvider>
  )
}

function AppLayoutInner({ paperId }: { paperId: string }) {
  const location = useLocation()
  const { theme, toggle } = useTheme()
  const { paper, loading, notFound } = useCurrentPaper()
  const openIssues = paper ? paper.consistencyIssues.filter((i) => i.status === 'open').length : 0

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  return (
    <div className="flex min-h-screen flex-col">
      <div className="sticky top-0 z-30 bg-paper/90 px-3 pt-3 pb-2 backdrop-blur-sm sm:px-5">
        <nav className="ink-border mx-auto flex max-w-6xl items-center gap-2 rounded-full bg-surface-raised px-2 py-2 shadow-[var(--shadow-card)]">
          <NavLink to="/" className="flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-ink">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-paper">
              <FileText size={14} />
            </span>
            <span className="font-display text-base tracking-wide">SCHOLARLY</span>
          </NavLink>

          <div className="relative flex flex-1 items-center gap-1 overflow-x-auto scroll-px-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {navItems.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={label}
                to={`/paper/${paperId}/${to}`}
                end={end}
                className="relative shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold whitespace-nowrap text-ink-2 transition-colors hover:text-ink"
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.span
                        layoutId="nav-active"
                        transition={{ type: 'spring', stiffness: 500, damping: 36 }}
                        className="ink-border absolute inset-0 rounded-full bg-sticky-yellow"
                      />
                    )}
                    <span className={`relative z-10 flex items-center gap-1.5 ${isActive ? 'text-ink-on-sticky' : ''}`}>
                      <Icon size={14} />
                      {label}
                      {label === 'Consistency' && openIssues > 0 && (
                        <span className="ink-border flex h-4 min-w-4 items-center justify-center rounded-full bg-sticky-pink px-1 text-[10px] text-ink-on-sticky">
                          {openIssues}
                        </span>
                      )}
                    </span>
                  </>
                )}
              </NavLink>
            ))}
          </div>

          <button
            onClick={toggle}
            title="Toggle theme"
            className="ink-border flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink hover:bg-surface-hover"
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          <NavLink
            to="/"
            className="ink-border flex shrink-0 items-center gap-1.5 rounded-full bg-ink px-3.5 py-2 text-sm font-bold text-paper shadow-[var(--shadow-pop)] transition-transform hover:-translate-y-0.5 active:translate-y-0"
          >
            <UploadCloud size={14} />
            <span className="hidden sm:inline">New paper</span>
          </NavLink>
        </nav>
      </div>

      <main className="min-w-0 flex-1">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-32 text-ink-muted">
            <Loader2 size={22} className="animate-spin" />
            <p className="text-sm font-semibold">Loading your paper...</p>
          </div>
        ) : notFound ? (
          <div className="mx-auto flex max-w-xl flex-col items-center gap-3 px-5 py-32 text-center">
            <p className="font-display text-3xl tracking-wide text-ink uppercase">Paper not found</p>
            <p className="text-sm text-ink-2">
              This paper isn't in this browser's storage — it may have been uploaded on a different device, or
              cleared.
            </p>
            <NavLink
              to="/"
              className="ink-border mt-2 flex items-center gap-1.5 rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-paper shadow-[var(--shadow-pop)]"
            >
              <UploadCloud size={14} />
              Upload a paper
            </NavLink>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="mx-auto max-w-6xl px-3 pb-16 sm:px-5"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        )}
      </main>
    </div>
  )
}
