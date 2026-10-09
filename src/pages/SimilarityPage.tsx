import { motion } from 'framer-motion'
import { AlertTriangle, PlugZap, Copy } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Meter from '../components/Meter'
import CountUp from '../components/CountUp'
import { useCurrentPaper } from '../hooks/useCurrentPaper'

export default function SimilarityPage() {
  const { paper } = useCurrentPaper()
  if (!paper) return null

  const noCorpus = paper.analysisMode !== 'demo'
  const score = paper.overallSimilarityPercent

  return (
    <div>
      <PageHeader
        eyebrow="a secondary signal"
        title="Similarity & Citations"
        description="Provider-abstracted and swappable — not the primary differentiator of this product."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {noCorpus ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="ink-border card-pop flex flex-col items-start justify-center gap-2 rounded-3xl bg-surface-hover p-6 shadow-[var(--shadow-card)]"
          >
            <span className="ink-border flex h-10 w-10 items-center justify-center rounded-full bg-white text-ink-muted">
              <PlugZap size={18} />
            </span>
            <p className="mt-2 text-sm font-bold text-ink">No similarity provider connected</p>
            <p className="text-xs text-ink-muted">
              This runs entirely in your browser, with no corpus to check against. A similarity score requires a
              licensed provider or a cross-document corpus — this demo doesn't fabricate one.
            </p>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="ink-border card-pop flex flex-col justify-center rounded-3xl bg-surface p-6 shadow-[var(--shadow-card)]"
          >
            <p className="text-sm font-bold text-ink-2">Overall similarity</p>
            <p className="mt-1 font-display text-5xl text-ink">
              <CountUp value={score} decimals={1} suffix="%" />
            </p>
            <div className="mt-5">
              <Meter value={score} />
            </div>
            <p className="mt-3 text-xs font-semibold text-ink-muted">Across {paper.similaritySources.length} matched sources</p>
          </motion.div>
        )}

        <div className="ink-border card-pop rounded-3xl bg-surface shadow-[var(--shadow-card)] lg:col-span-2">
          <div className="border-b-[1.5px] border-line px-5 py-4">
            <h2 className="font-display text-lg tracking-wide text-ink uppercase">Matched sources</h2>
          </div>
          <div className="divide-y-[1.5px] divide-line">
            {paper.similaritySources.map((s) => (
              <div key={s.id} className="px-5 py-4 transition-colors hover:bg-surface-hover">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-ink">{s.title}</p>
                    <p className="text-xs text-ink-muted">{s.authors}</p>
                  </div>
                  <span className="ink-border shrink-0 rounded-full bg-sticky-blue px-2.5 py-1 text-xs font-bold text-ink-on-sticky">
                    {s.matchPercent}% match
                  </span>
                </div>
                <p className="mt-2 text-sm text-ink-2 italic">&ldquo;{s.matchedExcerpt}&rdquo;</p>
              </div>
            ))}
            {paper.similaritySources.length === 0 && (
              <p className="px-5 py-8 text-center text-sm text-ink-muted">No similarity provider connected.</p>
            )}
          </div>
        </div>
      </div>

      <div className="ink-border card-pop mt-6 rounded-3xl bg-surface shadow-[var(--shadow-card)]">
        <div className="border-b-[1.5px] border-line px-5 py-4">
          <h2 className="font-display text-lg tracking-wide text-ink uppercase">Citation gaps</h2>
        </div>
        <div className="divide-y-[1.5px] divide-line">
          {paper.citationGaps.map((g) => (
            <div key={g.id} className="flex items-start gap-3 px-5 py-4">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
              <div>
                <p className="text-xs font-bold tracking-wide text-ink-muted uppercase">{g.section}</p>
                <p className="text-sm text-ink-2">{g.claim}</p>
              </div>
            </div>
          ))}
          {paper.citationGaps.length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-ink-muted">
              {paper.analysisMode === 'ai'
                ? "No strong claims found without a nearby citation."
                : 'No unsupported strong claims matched by the pattern checks.'}
            </p>
          )}
        </div>
      </div>

      {paper.analysisMode === 'ai' && (
        <div className="ink-border card-pop mt-6 rounded-3xl bg-surface shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-2 border-b-[1.5px] border-line px-5 py-4">
            <Copy size={16} className="text-ink-muted" />
            <h2 className="font-display text-lg tracking-wide text-ink uppercase">Internal repetition check</h2>
          </div>
          <p className="px-5 pt-4 text-xs text-ink-muted">
            There's no external corpus here — this checks the document against itself, via embeddings, for
            passages that are suspiciously close to each other in different sections.
          </p>
          <div className="divide-y-[1.5px] divide-line">
            {(paper.selfSimilarityMatches ?? []).map((m) => (
              <div key={m.id} className="px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-bold tracking-wide text-ink-muted uppercase">
                    {m.sectionA} &harr; {m.sectionB}
                  </p>
                  <span className="ink-border shrink-0 rounded-full bg-sticky-peach px-2.5 py-1 text-xs font-bold text-ink-on-sticky">
                    {m.similarityPercent}% match
                  </span>
                </div>
                <p className="mt-2 text-sm text-ink-2 italic">&ldquo;{m.excerptA}&rdquo;</p>
                <p className="mt-1 text-sm text-ink-2 italic">&ldquo;{m.excerptB}&rdquo;</p>
              </div>
            ))}
            {(paper.selfSimilarityMatches ?? []).length === 0 && (
              <p className="px-5 py-8 text-center text-sm text-ink-muted">No near-duplicate passages found.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
