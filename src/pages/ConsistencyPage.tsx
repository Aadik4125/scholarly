import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, X, Quote } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import SeverityBadge from '../components/SeverityBadge'
import StickyTag from '../components/StickyTag'
import { useCurrentPaper } from '../hooks/useCurrentPaper'
import { useToast } from '../hooks/useToast'
import type { ConsistencyCategory, ConsistencyIssue, Severity } from '../types'

const categoryLabels: Record<ConsistencyCategory, string> = {
  methodology: 'Methodology',
  dataset: 'Dataset',
  numbers: 'Numbers',
  model: 'Model',
  'abstract-vs-results': 'Abstract vs. Results',
  other: 'Other',
}

const severityStripe: Record<Severity, string> = {
  high: 'var(--sticky-pink)',
  medium: 'var(--sticky-yellow)',
  low: 'var(--sticky-green)',
}

export default function ConsistencyPage() {
  const { paper, setConsistencyStatus } = useCurrentPaper()
  const [filter, setFilter] = useState<'open' | 'all'>('open')
  const { push } = useToast()

  if (!paper) return null
  const issues = paper.consistencyIssues

  const setStatus = (id: string, status: ConsistencyIssue['status']) => {
    setConsistencyStatus(id, status)
    push(status === 'resolved' ? 'Marked as resolved' : 'Dismissed', status === 'resolved' ? 'success' : 'neutral')
  }

  const visible = filter === 'open' ? issues.filter((i) => i.status === 'open') : issues
  const openCount = issues.filter((i) => i.status === 'open').length

  return (
    <div>
      <PageHeader
        eyebrow="catching contradictions"
        title="Consistency Engine"
        description={
          paper.analysisMode === 'heuristic'
            ? 'Pattern-based checks across your extracted text — numeric mismatches, model-name conflicts, and dataset-size conflicts. This is a narrow heuristic scan, not full semantic understanding, so it will miss subtler contradictions and can occasionally misfire.'
            : 'Internal contradictions found across methodology, datasets, numbers, and models — every flag is anchored to evidence from the document.'
        }
      />

      <div className="mb-5 flex items-center gap-2">
        {(['open', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`ink-border rounded-full px-3.5 py-1.5 text-sm font-bold transition-colors ${
              filter === f ? 'bg-sticky-yellow text-ink-on-sticky' : 'bg-surface text-ink-2 hover:bg-surface-hover'
            }`}
          >
            {f === 'open' ? `Open (${openCount})` : `All (${issues.length})`}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        <AnimatePresence initial={false}>
          {visible.map((issue, idx) => (
            <motion.div
              layout
              key={issue.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.18 } }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="ink-border card-pop overflow-hidden rounded-3xl bg-surface shadow-[var(--shadow-card)]"
              style={{ borderLeftWidth: 8, borderLeftColor: severityStripe[issue.severity] }}
            >
              <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <StickyTag color="purple" rotate={idx % 2 === 0 ? -2 : 2}>
                        {categoryLabels[issue.category]}
                      </StickyTag>
                      <SeverityBadge severity={issue.severity} />
                      {issue.status !== 'open' && (
                        <StickyTag color="green" rotate={0}>
                          {issue.status === 'resolved' ? 'Resolved' : 'Dismissed'}
                        </StickyTag>
                      )}
                    </div>
                    <h3 className="font-display text-xl tracking-wide text-ink">{issue.title}</h3>
                    <p className="mt-1 text-sm text-ink-2">{issue.explanation}</p>
                  </div>

                  {issue.status === 'open' && (
                    <div className="flex shrink-0 gap-2">
                      <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={() => setStatus(issue.id, 'resolved')}
                        title="Mark resolved"
                        className="ink-border flex h-9 w-9 items-center justify-center rounded-full bg-sticky-green text-ink-on-sticky"
                      >
                        <Check size={16} />
                      </motion.button>
                      <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={() => setStatus(issue.id, 'dismissed')}
                        title="Dismiss"
                        className="ink-border flex h-9 w-9 items-center justify-center rounded-full bg-surface text-ink-muted hover:bg-surface-hover"
                      >
                        <X size={16} />
                      </motion.button>
                    </div>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {issue.locations.map((loc, i) => (
                    <div key={i} className="ink-border rounded-2xl bg-paper p-3">
                      <p className="mb-1 text-xs font-bold tracking-wide text-ink-muted uppercase">{loc.section}</p>
                      <div className="flex gap-2 text-sm text-ink-2">
                        <Quote size={14} className="mt-0.5 shrink-0 text-ink-muted" />
                        <span className="italic">&ldquo;{loc.quote}&rdquo;</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {visible.length === 0 && (
          <div className="ink-border rounded-3xl border-dashed bg-surface p-10 text-center text-sm font-semibold text-ink-muted">
            No issues in this view.
          </div>
        )}
      </div>
    </div>
  )
}
