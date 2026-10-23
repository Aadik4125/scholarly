import { Link, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ShieldAlert, PenLine, Fingerprint, Sparkles, ArrowRight, CheckCircle2, FileStack, Bot } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'
import SeverityBadge from '../components/SeverityBadge'
import SeverityBar from '../components/SeverityBar'
import Polaroid from '../components/Polaroid'
import DocumentViewerCard from '../components/DocumentViewerCard'
import { useCurrentPaper } from '../hooks/useCurrentPaper'
import type { Severity } from '../types'

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
}
const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as const } },
}

function truncateWords(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  const cut = text.slice(0, maxLen)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trim() + '...'
}

export default function OverviewPage() {
  const { paperId } = useParams()
  const { paper } = useCurrentPaper()
  if (!paper) return null

  const isHeuristic = paper.analysisMode === 'heuristic'
  const corpusChecked = paper.analysisMode === 'ai' && paper.similarityCorpusChecked === true
  const noSimilarityCorpus = paper.analysisMode !== 'demo' && !corpusChecked
  const openIssues = paper.consistencyIssues.filter((i) => i.status === 'open')
  const highSeverity = openIssues.filter((i) => i.severity === 'high').length
  const pendingWriting = paper.writingSuggestions.filter((s) => s.status === 'pending').length

  const severityCounts = openIssues.reduce(
    (acc, issue) => {
      acc[issue.severity] += 1
      return acc
    },
    { high: 0, medium: 0, low: 0 } as Record<Severity, number>,
  )

  const versions = paper.versions
  const prevVersion = versions[versions.length - 2]
  const issueDelta = prevVersion ? openIssues.length - prevVersion.consistencyOpenCount : 0
  const issueTrend = versions.map((v) => v.consistencyOpenCount)

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-6">
        <PageHeader
          eyebrow="analysis for"
          title="Overview"
          description={
            isHeuristic
              ? `${paper.fileName} · ${paper.wordCount.toLocaleString()} words (extracted) · uploaded ${new Date(paper.uploadedAt).toLocaleDateString()}`
              : `${paper.pageCount} pages · ${paper.wordCount.toLocaleString()} words · uploaded ${new Date(paper.uploadedAt).toLocaleDateString()}`
          }
        />
        <div className="mt-6 flex items-center gap-4 sm:mt-7">
          <Polaroid caption={truncateWords(paper.title, 18)} rotate={4} tape="blue" width={104} className="hidden md:block">
            <FileStack size={34} className="text-ink/60" />
          </Polaroid>
          <Link
            to={`/paper/${paperId}/consistency`}
            className="ink-border flex items-center gap-1.5 rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-paper shadow-[var(--shadow-pop)] transition-transform hover:-translate-y-0.5 active:translate-y-0"
          >
            Review findings
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>

      <DocumentViewerCard />

      <motion.div variants={container} initial="hidden" animate="show">
        <motion.div variants={item} className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${paper.aiContent?.checked ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
          <StatCard
            icon={ShieldAlert}
            label="Open consistency issues"
            value={openIssues.length}
            tone={highSeverity > 0 ? 'pink' : 'yellow'}
            delta={prevVersion ? { value: issueDelta, goodDirection: 'down', caption: 'vs last draft' } : undefined}
            trend={issueTrend}
            rotate={-1.5}
          />
          <StatCard icon={PenLine} label="Writing suggestions pending" value={pendingWriting} tone="peach" rotate={1} />
          {noSimilarityCorpus ? (
            <div
              style={{ transform: 'rotate(-1deg)' }}
              className="ink-border flex flex-col justify-center rounded-2xl bg-surface-hover p-5 shadow-[var(--shadow-card)]"
            >
              <div className="ink-border flex h-10 w-10 items-center justify-center rounded-full bg-white text-ink-muted">
                <Fingerprint size={18} />
              </div>
              <p className="mt-4 font-display text-2xl leading-none text-ink-muted">Not available</p>
              <p className="mt-2 text-sm font-semibold text-ink-muted">
                {paper.similarityWarning ? 'Sources unreachable — see Similarity' : 'Similarity needs a corpus provider'}
              </p>
            </div>
          ) : (
            <StatCard
              icon={Fingerprint}
              label={paper.similarityWarning ? 'Overall similarity (incomplete check)' : 'Overall similarity'}
              value={paper.overallSimilarityPercent}
              suffix="%"
              decimals={1}
              tone="blue"
              rotate={-1}
            />
          )}
          <StatCard icon={Sparkles} label="Citation gaps" value={paper.citationGaps.length} tone="purple" rotate={1.5} />
          {paper.aiContent?.checked && (
            <Link to={`/paper/${paperId}/ai-content`} className="block">
              <StatCard
                icon={Bot}
                label="Likely AI-generated text"
                value={paper.aiContent.aiPercent}
                suffix="%"
                decimals={1}
                tone="green"
                rotate={-1.5}
              />
            </Link>
          )}
        </motion.div>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <motion.div variants={item} className="ink-border card-pop rounded-3xl bg-surface shadow-[var(--shadow-card)] lg:col-span-2">
            <div className="flex items-center justify-between border-b-[1.5px] border-line px-5 py-4">
              <h2 className="font-display text-lg tracking-wide text-ink uppercase">Top findings</h2>
              <Link to={`/paper/${paperId}/consistency`} className="text-sm font-bold text-ink underline decoration-dotted underline-offset-4">
                View all
              </Link>
            </div>
            <div className="divide-y-[1.5px] divide-line">
              {openIssues.slice(0, 3).map((issue) => (
                <div key={issue.id} className="px-5 py-4 transition-colors hover:bg-surface-hover">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-bold text-ink">{issue.title}</p>
                    <SeverityBadge severity={issue.severity} />
                  </div>
                  <p className="mt-1 text-sm text-ink-2">{issue.explanation}</p>
                </div>
              ))}
              {openIssues.length === 0 && (
                <div className="flex items-center gap-2 px-5 py-6 text-sm font-semibold text-emerald-800">
                  <CheckCircle2 size={18} />
                  {isHeuristic
                    ? 'No contradictions matched by the pattern-based checks. This is a narrow scan, not a guarantee.'
                    : 'No open consistency issues — nice work.'}
                </div>
              )}
            </div>
          </motion.div>

          <motion.div variants={item} className="flex flex-col gap-6">
            <div className="ink-border card-pop rounded-3xl bg-surface p-5 shadow-[var(--shadow-card)]">
              <h2 className="font-display text-base tracking-wide text-ink uppercase">By severity</h2>
              <div className="mt-4">
                <SeverityBar counts={severityCounts} />
              </div>
            </div>

            <div className="ink-border card-pop rounded-3xl bg-sticky-yellow p-5 shadow-[var(--shadow-card)]">
              <h2 className="font-display text-base tracking-wide text-ink-on-sticky uppercase">Fix → Verify</h2>
              <p className="mt-2 text-sm text-ink-on-sticky/85">
                This draft still has <span className="font-bold">{openIssues.length} open issue(s)</span>. Resolve
                them, then re-upload to verify the fix and compare against earlier drafts.
              </p>
              <Link
                to={`/paper/${paperId}/versions`}
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-ink-on-sticky underline decoration-dotted underline-offset-4"
              >
                View version history
                <ArrowRight size={14} />
              </Link>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  )
}
