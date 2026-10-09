import { motion } from 'framer-motion'
import type { Severity } from '../types'

interface SeverityBarProps {
  counts: Record<Severity, number>
}

const order: Severity[] = ['high', 'medium', 'low']

const colors: Record<Severity, string> = {
  high: 'var(--sticky-pink)',
  medium: 'var(--sticky-yellow)',
  low: 'var(--sticky-green)',
}

const labels: Record<Severity, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

export default function SeverityBar({ counts }: SeverityBarProps) {
  const total = order.reduce((sum, k) => sum + counts[k], 0)

  if (total === 0) {
    return <p className="text-sm text-ink-muted">No open issues to break down.</p>
  }

  return (
    <div>
      <div className="ink-border flex h-4 w-full overflow-hidden rounded-full bg-surface-hover">
        {order.map((key, i) => {
          const pct = (counts[key] / total) * 100
          if (pct === 0) return null
          return (
            <motion.div
              key={key}
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.6, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
              style={{ background: colors[key] }}
              className="h-full"
            />
          )
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {order.map((key) => (
          <div key={key} className="flex items-center gap-1.5 text-xs font-semibold text-ink-2">
            <span className="ink-border h-2.5 w-2.5 rounded-full" style={{ background: colors[key] }} />
            {labels[key]} <span className="text-ink">{counts[key]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
