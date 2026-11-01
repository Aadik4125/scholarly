import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { FileText } from 'lucide-react'
import SiteFooter from './SiteFooter'

/** Shared layout for the About, Privacy, Terms and Not-found pages. */
export default function InfoPageLayout({ title, updated, children }: { title: string; updated?: string; children: ReactNode }) {
  useEffect(() => {
    document.title = `${title} | Scholarly`
    window.scrollTo(0, 0)
  }, [title])

  return (
    <div className="relative flex min-h-screen flex-col">
      <header className="relative z-10 mx-auto flex w-full max-w-3xl items-center px-5 py-6">
        <Link to="/" className="flex items-center gap-2">
          <span className="ink-border flex h-8 w-8 items-center justify-center rounded-full bg-ink text-paper">
            <FileText size={16} />
          </span>
          <span className="font-display text-xl tracking-wide text-ink">SCHOLARLY</span>
        </Link>
      </header>
      <main className="relative z-10 mx-auto w-full max-w-3xl flex-1 px-5 pb-12">
        <article className="ink-border rounded-3xl bg-surface p-6 text-ink-2 shadow-[var(--shadow-card)] sm:p-10 [&_a]:underline [&_a]:decoration-dotted [&_a]:underline-offset-2 [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:font-display [&_h2]:text-lg [&_h2]:tracking-wide [&_h2]:text-ink [&_h2]:uppercase [&_li]:mb-1.5 [&_p]:mb-3 [&_p]:leading-relaxed [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5">
          <h1 className="font-display text-3xl tracking-wide text-ink uppercase">{title}</h1>
          {updated && <p className="mt-1 text-xs text-ink-muted">Last updated: {updated}</p>}
          <div className="mt-6 text-sm">{children}</div>
        </article>
      </main>
      <SiteFooter />
    </div>
  )
}
