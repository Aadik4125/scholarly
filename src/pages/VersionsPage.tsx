import { motion } from 'framer-motion'
import { CheckCircle2, Circle } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import TrendChart from '../components/TrendChart'
import { useCurrentPaper } from '../hooks/useCurrentPaper'

export default function VersionsPage() {
  const { paper } = useCurrentPaper()
  if (!paper) return null

  const chartData = paper.versions.map((v) => ({ label: v.label.replace(' (current)', ''), openIssues: v.consistencyOpenCount }))

  return (
    <div>
      <PageHeader
        eyebrow="the paper trail"
        title="Version History"
        description="Compare drafts over time to see whether issues were actually resolved."
      />

      {paper.versions.length > 1 ? (
        <div className="ink-border card-pop mb-6 rounded-3xl bg-surface p-5 shadow-[var(--shadow-card)]">
          <h2 className="font-display text-lg tracking-wide text-ink uppercase">Open issues across drafts</h2>
          <p className="mb-2 text-xs font-semibold text-ink-muted">Fewer is better — this should trend down as you fix flagged issues.</p>
          <TrendChart data={chartData} />
        </div>
      ) : (
        <div className="ink-border card-pop mb-6 rounded-3xl bg-surface-hover p-5 text-sm text-ink-muted shadow-[var(--shadow-card)]">
          Only one draft so far. Accept some writing suggestions and save a new version from the Writing tab, or
          re-upload a file with the same name from the home screen, to start tracking a real trend here.
        </div>
      )}

      <div className="relative flex flex-col gap-0">
        {paper.versions
          .slice()
          .reverse()
          .map((v, idx) => (
            <motion.div
              key={v.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: idx * 0.07, ease: [0.16, 1, 0.3, 1] }}
              className="relative flex gap-4 pb-8 last:pb-0"
            >
              {idx !== paper.versions.length - 1 && (
                <div className="absolute top-7 left-[13px] h-full w-0.5 bg-line-soft" />
              )}
              <div className="z-10 pt-1.5">
                {idx === 0 ? (
                  <CheckCircle2 size={26} className="rounded-full bg-sticky-yellow text-ink-on-sticky" />
                ) : (
                  <Circle size={26} className="text-ink-muted/40" />
                )}
              </div>
              <div className="ink-border card-pop flex-1 rounded-3xl bg-surface p-4 shadow-[var(--shadow-card)]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-display text-lg tracking-wide text-ink">{v.label.toUpperCase()}</p>
                  <p className="text-xs font-semibold text-ink-muted">{new Date(v.uploadedAt).toLocaleString()}</p>
                </div>
                <p className="mt-1 text-sm text-ink-2">{v.note}</p>
                <div className="mt-3 flex gap-4 text-xs font-semibold text-ink-muted">
                  <span>{v.consistencyOpenCount} open consistency issues</span>
                  <span>{v.writingAcceptedCount} writing suggestions accepted</span>
                </div>
              </div>
            </motion.div>
          ))}
      </div>
    </div>
  )
}
