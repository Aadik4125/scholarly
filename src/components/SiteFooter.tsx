import { Link } from 'react-router-dom'
import { CONTACT_EMAIL, OWNER_NAME } from '../siteInfo'

export default function SiteFooter() {
  return (
    <footer className="relative z-10 border-t-[1.5px] border-line px-5 pt-6 pb-20 text-xs text-ink-muted">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 sm:flex-row">
        <p>
          © {new Date().getFullYear()} {OWNER_NAME}. Scholarly is an AI research and academic integrity tool.
        </p>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-1" aria-label="Legal and contact">
          <Link to="/about" className="hover:text-ink hover:underline">About &amp; Contact</Link>
          <Link to="/privacy" className="hover:text-ink hover:underline">Privacy Policy</Link>
          <Link to="/terms" className="hover:text-ink hover:underline">Terms of Use</Link>
          <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-ink hover:underline">{CONTACT_EMAIL}</a>
        </nav>
      </div>
    </footer>
  )
}
