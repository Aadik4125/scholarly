import { AnimatePresence, motion } from 'framer-motion'
import { Check, X, ArrowRight } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import StickyTag from '../components/StickyTag'
import type { StickyColor } from '../components/StickyTag'
import { useCurrentPaper } from '../hooks/useCurrentPaper'
import { useToast } from '../hooks/useToast'
import type { WritingSuggestion } from '../types'

const typeLabels: Record<WritingSuggestion['type'], string> = {
  clarity: 'Clarity',
  concision: 'Concision',
  tone: 'Academic tone',
}

const typeColor: Record<WritingSuggestion['type'], StickyColor> = {
  clarity: 'blue',
  concision: 'peach',
  tone: 'purple',
}

export default function WritingPage() {
  const { paper, setWritingStatus } = useCurrentPaper()
  const { push } = useToast()

  if (!paper) return null
  const suggestions = paper.writingSuggestions

  const setStatus = (id: string, status: WritingSuggestion['status']) => {
    setWritingStatus(id, status)
    push(status === 'accepted' ? 'Suggestion accepted' : 'Suggestion rejected', status === 'accepted' ? 'success' : 'neutral')
  }

  const pending = suggestions.filter((s) => s.status === 'pending')
  const accepted = suggestions.filter((s) => s.status === 'accepted')

  return (
    <div>
      <PageHeader
        eyebrow="sharpen the prose"
        title="Writing Improvement"
        description={
          paper.analysisMode === 'heuristic'
            ? 'Mechanical fixes found in your extracted text: filler phrases removed for concision, contractions expanded for formal tone. These are confident, rule-based edits, not a style rewrite.'
            : 'Suggestions for clarity, concision, and academic tone. Numbers, citations, and equations are preserved.'
        }
      />

      <p className="mb-4 inline-block w-fit font-hand text-xl text-ink-2" style={{ transform: 'rotate(-1deg)' }}>
        {pending.length} pending · {accepted.length} accepted
      </p>

      {suggestions.length === 0 && (
        <div className="ink-border rounded-3xl border-dashed bg-surface p-10 text-center text-sm font-semibold text-ink-muted">
          {paper.analysisMode === 'ai'
            ? "No writing issues worth flagging — the draft reads clean."
            : 'No filler phrases or informal contractions found by the pattern checks.'}
        </div>
      )}

      <div className="flex flex-col gap-4">
        <AnimatePresence initial={false}>
          {suggestions.map((s) => (
            <motion.div
              layout
              key={s.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="ink-border card-pop rounded-3xl bg-surface p-5 shadow-[var(--shadow-card)]"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <StickyTag color={typeColor[s.type]}>{typeLabels[s.type]}</StickyTag>
                  <span className="text-xs font-semibold text-ink-muted">{s.section}</span>
                  {s.status === 'accepted' && (
                    <StickyTag color="green" rotate={0}>
                      Accepted
                    </StickyTag>
                  )}
                  {s.status === 'rejected' && (
                    <span className="ink-border rounded-full bg-surface-hover px-2.5 py-1 text-xs font-bold text-ink-muted">
                      Rejected
                    </span>
                  )}
                </div>
                {s.status === 'pending' && (
                  <div className="flex shrink-0 gap-2">
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={() => setStatus(s.id, 'accepted')}
                      title="Accept"
                      className="ink-border flex h-9 w-9 items-center justify-center rounded-full bg-sticky-green text-ink-on-sticky"
                    >
                      <Check size={16} />
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={() => setStatus(s.id, 'rejected')}
                      title="Reject"
                      className="ink-border flex h-9 w-9 items-center justify-center rounded-full bg-surface text-ink-muted hover:bg-surface-hover"
                    >
                      <X size={16} />
                    </motion.button>
                  </div>
                )}
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-stretch">
                <div className="ink-border flex-1 rounded-2xl bg-paper p-3">
                  <p className="mb-1 text-xs font-bold tracking-wide text-ink-muted uppercase">Original</p>
                  <p className="text-sm text-ink-2 line-through decoration-[var(--sticky-pink)] decoration-2">{s.original}</p>
                </div>
                <div className="flex items-center justify-center text-ink-muted">
                  <ArrowRight size={16} className="rotate-90 sm:rotate-0" />
                </div>
                <div className="ink-border flex-1 rounded-2xl bg-sticky-green p-3">
                  <p className="mb-1 text-xs font-bold tracking-wide text-ink-on-sticky/70 uppercase">Suggested</p>
                  <p className="text-sm text-ink-on-sticky">{s.suggested}</p>
                </div>
              </div>
              <p className="mt-3 text-xs text-ink-muted">{s.reason}</p>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
