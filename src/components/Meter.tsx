import { motion } from 'framer-motion'

interface MeterProps {
  value: number
  max?: number
  thresholds?: { warning: number; critical: number }
}

export default function Meter({ value, max = 100, thresholds = { warning: 15, critical: 30 } }: MeterProps) {
  const pct = Math.min(100, (value / max) * 100)
  const tier = value >= thresholds.critical ? 'var(--sticky-pink)' : value >= thresholds.warning ? 'var(--sticky-yellow)' : 'var(--sticky-green)'

  return (
    <div className="w-full">
      <div className="ink-border relative h-4 w-full overflow-hidden rounded-full bg-surface-hover">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          className="h-full"
          style={{ background: tier }}
        />
        {[thresholds.warning, thresholds.critical].map((t) => (
          <div
            key={t}
            className="absolute top-0 h-full w-px bg-ink/40"
            style={{ left: `${Math.min(100, (t / max) * 100)}%` }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] font-semibold text-ink-muted">
        <span>0%</span>
        <span>{max}%</span>
      </div>
    </div>
  )
}
