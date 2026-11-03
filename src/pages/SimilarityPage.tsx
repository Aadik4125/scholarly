import { motion } from 'framer-motion'
import { AlertTriangle, PlugZap, Copy } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Meter from '../components/Meter'
import CountUp from '../components/CountUp'
import { useCurrentPaper } from '../hooks/useCurrentPaper'

export default function SimilarityPage() {
  const { paper } = useCurrentPaper()
  if (!paper) return null

  const corpusChecked = paper.analysisMode === 'ai' && paper.similarityCorpusChecked === true
  const showScore = paper.analysisMode === 'demo' || corpusChecked
  const score = paper.overallSimilarityPercent

  return (
    <div>
      <PageHeader
        eyebrow="checked word for word and by meaning"
        title="Similarity & Citations"
        description="Your paper compared with 250M+ research papers from OpenAlex and CORE, for copied and reworded passages."
      />

      {paper.analysisMode === 'ai' && paper.similarityWarning && (
        <div className="ink-border mb-6 flex items-start gap-2.5 rounded-2xl bg-sticky-yellow px-5 py-4">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-ink-on-sticky" />
          <p className="text-sm text-ink-on-sticky">
            <span className="font-bold">{corpusChecked ? 'Similarity check incomplete. ' : 'Similarity check failed. '}</span>
            {paper.similarityWarning} Try re-analyzing later for a full score.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {!showScore ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="ink-border card-pop flex flex-col items-start justify-center gap-2 rounded-3xl bg-surface-hover p-6 shadow-[var(--shadow-card)]"
          >
            <span className="ink-border flex h-10 w-10 items-center justify-center rounded-full bg-white text-ink-muted">
              <PlugZap size={18} />
            </span>
            <p className="mt-2 text-sm font-bold text-ink">
              {paper.similarityWarning ? 'Similarity sources unreachable' : 'No similarity provider connected'}
            </p>
            <p className="text-xs text-ink-muted">
              {paper.similarityWarning
                ? 'Every search to OpenAlex and CORE failed, so no score was calculated — see the note above.'
                : paper.analysisMode === 'ai'
                ? 'The external similarity check needs OPENAI_API_KEY set in the backend .env — add it and re-analyze.'
                : "This runs entirely in your browser, with no corpus to check against. A similarity score requires a licensed provider or a cross-document corpus — this demo doesn't fabricate one."}
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
            {paper.similarityBreakdown && (
              <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-ink-on-sticky">
                <span className="ink-border rounded-full bg-sticky-pink px-2.5 py-1">
                  {paper.similarityBreakdown.copiedPercent}% word for word
                </span>
                <span className="ink-border rounded-full bg-sticky-blue px-2.5 py-1">
                  {paper.similarityBreakdown.rewordedPercent}% reworded
                </span>
              </div>
            )}
            <p className="mt-3 text-xs font-semibold text-ink-muted">
              Across {paper.similaritySources.length} matched {paper.similaritySources.length === 1 ? 'source' : 'sources'}
            </p>
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
                    {s.passageCount && s.passageCount > 1 && (
                      <p className="mt-1 text-xs font-semibold text-ink-2">
                        {s.passageCount} passages of your paper match this source
                      </p>
                    )}
                  </div>
                  <span
                    title={
                      s.matchType === 'fulltext'
                        ? 'Share of this passage’s wording found word for word in the source'
                        : 'This passage restates the source in other words. The number is how close the meaning is.'
                    }
                    className={`ink-border shrink-0 rounded-full px-2.5 py-1 text-xs font-bold text-ink-on-sticky ${
                      s.matchType === 'fulltext' ? 'bg-sticky-pink' : 'bg-sticky-blue'
                    }`}
                  >
                    {s.matchType === 'fulltext' ? `Word for word · ${s.matchPercent}%` : `Reworded · ${s.matchPercent}% similar`}
                  </span>
                </div>
                {s.sourceExcerpt ? (
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl bg-surface-hover p-3">
                      <p className="mb-1 text-[11px] font-bold tracking-wide text-ink-muted uppercase">Your paper</p>
                      <p className="text-sm text-ink-2 italic">&ldquo;{s.matchedExcerpt}&rdquo;</p>
                    </div>
                    <div className="rounded-xl bg-surface-hover p-3">
                      <p className="mb-1 text-[11px] font-bold tracking-wide text-ink-muted uppercase">Source</p>
                      <p className="text-sm text-ink-2 italic">&ldquo;{s.sourceExcerpt}&rdquo;</p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-ink-2 italic">&ldquo;{s.matchedExcerpt}&rdquo;</p>
                )}
              </div>
            ))}
            {paper.similaritySources.length === 0 && corpusChecked && paper.similarityStats ? (
              <div className="px-5 py-6">
                <p className="text-sm font-bold text-ink">No copied or reworded passages found.</p>
                <p className="mt-1 text-sm text-ink-2">Here is what was checked:</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-2">
                  <li>{paper.similarityStats.passagesChecked} passages of your paper, word for word and by meaning</li>
                  <li>{paper.similarityStats.papersFound} related papers found by searching OpenAlex and CORE</li>
                  {paper.similarityStats.fullTextsCompared.length > 0 && (
                    <li>
                      Full text of the {paper.similarityStats.fullTextsCompared.length} closest, compared passage by passage:
                      <ul className="mt-1 list-[circle] space-y-0.5 pl-5 text-xs text-ink-muted">
                        {paper.similarityStats.fullTextsCompared.map((t) => (
                          <li key={t}>{t}</li>
                        ))}
                      </ul>
                    </li>
                  )}
                  {paper.similarityStats.rewordingReviewed > 0 && (
                    <li>{paper.similarityStats.rewordingReviewed} possible rewordings reviewed by AI, none confirmed</li>
                  )}
                </ul>
                <p className="mt-3 text-xs text-ink-muted">
                  0% means no passage closely matched published research in these databases. Your own paper isn&rsquo;t
                  in them yet, so it can&rsquo;t match itself, but text taken from other published work would still show
                  up here.
                </p>
              </div>
            ) : paper.similaritySources.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-ink-muted">
                {corpusChecked
                  ? 'No matching sources found across OpenAlex or CORE.'
                  : paper.similarityWarning
                    ? 'No sources could be searched.'
                    : 'No similarity provider connected.'}
              </p>
            ) : null}
          </div>
          {paper.analysisMode === 'ai' && (
            <p className="border-t-[1.5px] border-line px-5 py-3 text-xs text-ink-muted">
              Reworded matches are confirmed by AI reading both passages side by side. Reference lists are not counted.
              Full papers are compared when they are open access; for others, only the abstract. Websites and other
              students’ work are not included, so treat this as an early check, not a final verdict.
            </p>
          )}
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
            This checks the document against itself, via embeddings, for passages that are suspiciously close to
            each other in different sections — separate from the external corpus check above.
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
