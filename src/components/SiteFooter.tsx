import { Link } from 'react-router-dom'
import { FileText, Lock, Mail, MessageSquareHeart } from 'lucide-react'
import { CONTACT_EMAIL, OWNER_NAME } from '../siteInfo'
import { FEEDBACK_URL } from './FeedbackButton'

const linkClass = 'text-ink-2 transition-colors hover:text-ink hover:underline decoration-dotted underline-offset-4'

export default function SiteFooter() {
  return (
    // Extra bottom padding keeps the floating "Give feedback" button clear of the footer text.
    <footer className="relative z-10 mt-8 px-5 pb-24">
      <div className="ink-border mx-auto max-w-6xl rounded-3xl bg-surface p-6 shadow-[var(--shadow-card)] sm:p-8">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr]">
          <div className="sm:col-span-2 lg:col-span-1">
            <Link to="/" className="inline-flex items-center gap-2">
              <span className="ink-border flex h-8 w-8 items-center justify-center rounded-full bg-ink text-paper">
                <FileText size={16} />
              </span>
              <span className="font-display text-xl tracking-wide text-ink">SCHOLARLY</span>
            </Link>
            <p className="mt-2 font-hand text-xl leading-snug text-ink-2">check your paper before you submit ✎</p>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-ink-muted">
              An AI copilot for research and academic integrity: consistency, writing, citations, similarity and AI content.
            </p>
          </div>

          <nav aria-label="Scholarly">
            <h2 className="mb-3 font-display text-sm tracking-wide text-ink uppercase">Scholarly</h2>
            <ul className="flex flex-col gap-2 text-sm">
              <li><Link to="/" className={linkClass}>Check a paper</Link></li>
              <li><Link to="/about" className={linkClass}>About &amp; Contact</Link></li>
              {FEEDBACK_URL && (
                <li>
                  <a href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1.5 ${linkClass}`}>
                    <MessageSquareHeart size={14} /> Give feedback
                  </a>
                </li>
              )}
            </ul>
          </nav>

          <nav aria-label="Legal">
            <h2 className="mb-3 font-display text-sm tracking-wide text-ink uppercase">Legal</h2>
            <ul className="flex flex-col gap-2 text-sm">
              <li><Link to="/privacy" className={linkClass}>Privacy Policy</Link></li>
              <li><Link to="/terms" className={linkClass}>Terms of Use</Link></li>
              <li>
                <a href={`mailto:${CONTACT_EMAIL}`} className={`inline-flex items-center gap-1.5 [overflow-wrap:anywhere] ${linkClass}`}>
                  <Mail size={14} className="shrink-0" /> {CONTACT_EMAIL}
                </a>
              </li>
            </ul>
          </nav>
        </div>

        <div className="mt-8 flex flex-col items-start justify-between gap-3 border-t-[1.5px] border-dashed border-line-soft pt-5 text-xs text-ink-muted sm:flex-row sm:items-center">
          <p>© {new Date().getFullYear()} {OWNER_NAME}. All rights reserved.</p>
          <p
            style={{ transform: 'rotate(-1.5deg)' }}
            className="ink-border inline-flex items-center gap-1.5 rounded-full bg-sticky-green px-3 py-1 font-bold text-ink-on-sticky"
          >
            <Lock size={12} strokeWidth={2.5} /> Your paper stays in your browser
          </p>
        </div>
      </div>
    </footer>
  )
}
