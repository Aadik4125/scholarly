import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-left">
      <Link to="/" className="font-display text-lg tracking-wide text-ink">← SCHOLARLY</Link>
      <h1 className="mt-6 font-display text-4xl tracking-wide text-ink">{title}</h1>
      <p className="mt-1 text-xs text-ink-muted">Last updated: November 2026</p>
      <div className="mt-6 space-y-4 text-sm leading-relaxed text-ink-2 [&_h2]:mt-6 [&_h2]:font-bold [&_h2]:text-ink">{children}</div>
    </main>
  )
}

export function PrivacyPage() {
  return (
    <Shell title="Privacy Policy">
      <h2>What we store</h2>
      <p>
        If you create an account, we store your name, email address, profile picture and sign-up date, provided by Google
        sign-in. Accounts are managed by our authentication provider, Supabase. We do not receive your Google password.
      </p>
      <h2>Your papers</h2>
      <p>
        Papers and analysis results are saved only in your own browser. Scholarly's server keeps no copy. To analyse a
        paper, its text is sent to Anthropic (Claude), OpenAI and Sapling (AI-content detection), and short passages are
        searched against OpenAlex and CORE to check similarity. You can delete saved papers from your browser at any time.
      </p>
      <h2>Usage limits</h2>
      <p>
        To prevent abuse we keep a random identifier in your browser and temporarily process your IP address to enforce
        free-use and daily limits.
      </p>
      <h2>Analytics</h2>
      <p>We may use Google Analytics to count visits and sign-ups.</p>
      <h2>Deleting your data</h2>
      <p>To delete your account and the data we hold about you, email us from the address on your account and we will remove it.</p>
    </Shell>
  )
}

export function TermsPage() {
  return (
    <Shell title="Terms of Service">
      <h2>The service</h2>
      <p>
        Scholarly provides automated checks on documents you upload: consistency, writing, similarity and AI-content
        indicators. Results are automated estimates and can be wrong; they are not proof of plagiarism, AI use or
        misconduct, and should not be the sole basis for any academic decision.
      </p>
      <h2>Your content</h2>
      <p>You keep ownership of your papers. Only upload content you have the right to analyse.</p>
      <h2>Acceptable use</h2>
      <p>Do not abuse the service, bypass usage limits, or attempt to disrupt it. We may limit or suspend access to protect the service.</p>
      <h2>No warranty</h2>
      <p>The service is provided “as is”, without warranties of any kind, to the extent permitted by law.</p>
    </Shell>
  )
}
