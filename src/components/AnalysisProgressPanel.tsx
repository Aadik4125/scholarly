import { useEffect, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { ANALYSIS_CHECKS, type AnalysisCheck, type AnalysisProgress } from '../lib/aiEngine'

const CHECK_LABELS: Record<AnalysisCheck, string> = {
  consistency: 'Checking consistency & novelty',
  writing: 'Reviewing writing & citations',
  similarity: 'Comparing with published papers',
  repetition: 'Looking for repeated passages',
  aiContent: 'Detecting AI-written text',
}

function formatDuration(totalSeconds: number) {
  const s = Math.max(0, Math.round(totalSeconds))
  if (s < 60) return `${s} sec`
  const m = Math.floor(s / 60)
  const rest = s % 60
  return rest ? `${m} min ${rest} sec` : `${m} min`
}

interface Props {
  /** 0 = reading the file, 1 = server checks running, 2+ = finishing up. */
  stage: number
  progress: AnalysisProgress
  /** When the server checks started (Date.now()), or null before that. */
  serverStartedAt: number | null
}

/** Progress bar, time estimate and per-check list for a real (server-side) analysis. The bar
 *  follows whichever is further along: elapsed time against the server's estimate, or the
 *  share of checks finished. It holds below 100% until the result actually arrives. */
export default function AnalysisProgressPanel({ stage, progress, serverStartedAt }: Props) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const elapsed = serverStartedAt ? (now - serverStartedAt) / 1000 : 0
  const doneCount = ANALYSIS_CHECKS.filter((c) => progress.done[c] !== undefined).length
  const estimate = progress.estimateSeconds

  let fraction: number
  if (stage === 0) fraction = 0.03
  else if (stage >= 2) fraction = 1
  else {
    const byTime = estimate ? Math.min(elapsed / estimate, 0.97) : 0
    fraction = 0.05 + 0.9 * Math.max(doneCount / ANALYSIS_CHECKS.length, byTime)
  }

  let timeLabel: string
  if (stage === 0) timeLabel = 'Reading your file…'
  else if (stage >= 2) timeLabel = 'Done! Opening your dashboard…'
  else if (!estimate) timeLabel = 'Estimating time…'
  else if (estimate - elapsed > 5) timeLabel = `About ${formatDuration(estimate - elapsed)} left`
  else timeLabel = 'Almost there, taking a little longer than usual…'

  return (
    <div className="flex w-full flex-col gap-4">
      <div>
        <div
          className="ink-border h-3.5 w-full overflow-hidden rounded-full bg-surface"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(fraction * 100)}
          aria-label="Analysis progress"
        >
          <div
            className="h-full rounded-full bg-sticky-yellow transition-[width] duration-1000 ease-linear"
            style={{ width: `${Math.round(fraction * 100)}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="font-bold text-ink">{timeLabel}</span>
          {stage === 1 && <span className="text-ink-muted tabular-nums">{formatDuration(elapsed)} elapsed</span>}
        </div>
      </div>

      <div className="flex w-full flex-col gap-2.5">
        <Row label="Reading document structure" done={stage > 0} active={stage === 0} />
        {ANALYSIS_CHECKS.map((c) => (
          <Row key={c} label={CHECK_LABELS[c]} done={progress.done[c] !== undefined || stage >= 2} active={stage === 1} />
        ))}
      </div>

      {stage === 1 && (
        <p className="text-xs leading-relaxed text-ink-muted">
          Long papers can take a few minutes. You can switch tabs, but keep this one open.
        </p>
      )}
    </div>
  )
}

function Row({ label, done, active }: { label: string; done: boolean; active: boolean }) {
  return (
    <div className="flex items-center gap-3 text-left">
      <div
        className={`ink-border flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors ${
          done ? 'bg-sticky-green text-ink-on-sticky' : active ? 'bg-sticky-yellow text-ink-on-sticky' : 'bg-surface text-transparent'
        }`}
      >
        {done ? <Check size={12} /> : active ? <Loader2 size={12} className="animate-spin" /> : null}
      </div>
      <span className={`text-sm font-medium ${done || active ? 'text-ink' : 'text-ink-muted'}`}>{label}</span>
    </div>
  )
}
