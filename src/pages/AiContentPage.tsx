import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, Info, PlugZap } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Meter from '../components/Meter'
import CountUp from '../components/CountUp'
import { useCurrentPaper } from '../hooks/useCurrentPaper'
import type { AiContentSection } from '../types'

// Sentence bands for highlighting. The server counts a sentence toward the overall score at
// >= 0.5; the stronger band just makes the most confident flags stand out.
const LIKELY = 0.5
const VERY_LIKELY = 0.8

function sentenceClass(score: number) {
  if (score >= VERY_LIKELY) return 'bg-sticky-pink text-ink-on-sticky'
  if (score >= LIKELY) return 'bg-highlight text-highlight-ink'
  return ''
}

/** Splits a section's text into plain runs and scored-sentence runs, using the detector's
 *  character offsets. */
function segmentsFor(section: AiContentSection) {
  const segments: { text: string; score: number | null }[] = []
  let cursor = 0
  for (const s of [...section.sentences].sort((a, b) => a.start - b.start)) {
    if (s.start < cursor) continue
    if (s.start > cursor) segments.push({ text: section.text.slice(cursor, s.start), score: null })
    segments.push({ text: section.text.slice(s.start, s.end), score: s.score })
    cursor = s.end
  }
  if (cursor < section.text.length) segments.push({ text: section.text.slice(cursor), score: null })
  return segments
}

function flaggedCount(section: AiContentSection) {
  return section.sentences.filter((s) => s.score >= LIKELY).length
}

export default function AiContentPage() {
  const { paper } = useCurrentPaper()
  const [flaggedOnly, setFlaggedOnly] = useState(true)
  const result = paper?.aiContent

  const totals = useMemo(() => {
    const sentences = result?.sections.flatMap((s) => s.sentences) ?? []
    return { total: sentences.length, flagged: sentences.filter((s) => s.score >= LIKELY).length }
  }, [result])

  if (!paper) return null

  const header = (
    <PageHeader
      eyebrow="an indicator, not a verdict"
      title="AI Content"
      description="How likely each passage is to be AI-generated, according to an automated detector."
    />
  )

  if (!result || !result.checked) {
    let title = 'AI-content check not run'
    let body = 'Re-upload the paper to run the AI-content check.'
    if (paper.analysisMode !== 'ai') {
      body = 'The AI-content check runs on uploaded papers — upload your own paper to see it.'
    } else if (result?.warning) {
      title = 'AI-content check failed'
      body = result.warning
    } else if (result) {
      title = 'No AI-content detector connected'
      body = 'Add SAPLING_API_KEY to the server environment, then re-upload the paper.'
    }
    return (
      <div>
        {header}
        <div className="ink-border card-pop flex max-w-xl flex-col items-start gap-2 rounded-3xl bg-surface-hover p-6 shadow-[var(--shadow-card)]">
          <span className="ink-border flex h-10 w-10 items-center justify-center rounded-full bg-white text-ink-muted">
            <PlugZap size={18} />
          </span>
          <p className="mt-2 text-sm font-bold text-ink">{title}</p>
          <p className="text-xs text-ink-muted">{body}</p>
        </div>
      </div>
    )
  }

  const visibleSections = flaggedOnly ? result.sections.filter((s) => flaggedCount(s) > 0) : result.sections

  return (
    <div>
      {header}

      {result.warning && (
        <div className="ink-border mb-6 flex items-start gap-2.5 rounded-2xl bg-sticky-yellow px-5 py-4">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-ink-on-sticky" />
          <p className="text-sm text-ink-on-sticky">{result.warning}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="ink-border card-pop flex flex-col justify-center rounded-3xl bg-surface p-6 shadow-[var(--shadow-card)]"
        >
          <p className="text-sm font-bold text-ink-2">Likely AI-generated text</p>
          <p className="mt-1 font-display text-5xl text-ink">
            <CountUp value={result.aiPercent} decimals={1} suffix="%" />
          </p>
          <div className="mt-5">
            <Meter value={result.aiPercent} thresholds={{ warning: 20, critical: 50 }} />
          </div>
          <p className="mt-3 text-xs font-semibold text-ink-muted">
            {totals.flagged} of {totals.total} sentences flagged
          </p>
        </motion.div>

        <div className="ink-border card-pop rounded-3xl bg-surface p-6 shadow-[var(--shadow-card)] lg:col-span-2">
          <div className="flex items-center gap-2">
            <Info size={16} className="text-ink-muted" />
            <h2 className="font-display text-lg tracking-wide text-ink uppercase">How to read this</h2>
          </div>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-ink-2">
            <li>
              The score is the share of your text in sentences the detector rates as more likely AI-written than not.
              It is a statistical estimate, not proof of how the paper was written.
            </li>
            <li>
              Detectors can flag human writing — especially formal, formulaic passages (methods, definitions) and
              text by non-native English writers. Review the highlighted passages rather than relying on the number.
            </li>
            <li>
              This checks your paper as uploaded. Accepting Scholarly&rsquo;s writing suggestions (which are
              AI-generated) can raise the score of the edited text.
            </li>
          </ul>
          <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-ink-muted">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm bg-highlight" /> Likely AI (50–80%)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm bg-sticky-pink" /> Very likely AI (80%+)
            </span>
          </div>
        </div>
      </div>

      <div className="ink-border card-pop mt-6 rounded-3xl bg-surface shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-[1.5px] border-line px-5 py-4">
          <h2 className="font-display text-lg tracking-wide text-ink uppercase">Passages by section</h2>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-ink-2">
            <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} />
            Flagged sections only
          </label>
        </div>
        <div className="divide-y-[1.5px] divide-line">
          {visibleSections.map((section, i) => {
            const flagged = flaggedCount(section)
            return (
              <div key={`${section.heading}-${i}`} className="px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-bold tracking-wide text-ink-muted uppercase">{section.heading}</p>
                  <span
                    className={`ink-border shrink-0 rounded-full px-2.5 py-1 text-xs font-bold text-ink-on-sticky ${
                      flagged > 0 ? 'bg-sticky-yellow' : 'bg-sticky-green'
                    }`}
                  >
                    {flagged} of {section.sentences.length} sentences flagged
                  </span>
                </div>
                <p className="mt-2 max-h-80 overflow-y-auto text-sm leading-relaxed text-ink-2">
                  {segmentsFor(section).map((seg, k) =>
                    seg.score !== null && seg.score >= LIKELY ? (
                      <mark
                        key={k}
                        title={`${Math.round(seg.score * 100)}% likely AI-generated`}
                        className={`rounded px-0.5 ${sentenceClass(seg.score)}`}
                      >
                        {seg.text}
                      </mark>
                    ) : (
                      <span key={k}>{seg.text}</span>
                    ),
                  )}
                </p>
              </div>
            )
          })}
          {visibleSections.length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-ink-muted">
              No passages were flagged as likely AI-generated.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
