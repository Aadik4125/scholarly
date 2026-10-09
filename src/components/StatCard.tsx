import type { LucideIcon } from 'lucide-react'
import { motion } from 'framer-motion'
import { ArrowDown, ArrowUp } from 'lucide-react'
import CountUp from './CountUp'
import Sparkline from './Sparkline'
import type { StickyColor } from './StickyTag'

interface StatCardProps {
  icon: LucideIcon
  label: string
  value: number
  suffix?: string
  decimals?: number
  tone?: StickyColor
  delta?: { value: number; goodDirection: 'up' | 'down'; caption: string }
  trend?: number[]
  rotate?: number
}

const toneBg: Record<StickyColor, string> = {
  yellow: 'bg-sticky-yellow',
  pink: 'bg-sticky-pink',
  green: 'bg-sticky-green',
  blue: 'bg-sticky-blue',
  purple: 'bg-sticky-purple',
  peach: 'bg-sticky-peach',
}

export default function StatCard({
  icon: Icon,
  label,
  value,
  suffix = '',
  decimals = 0,
  tone = 'yellow',
  delta,
  trend,
  rotate = 0,
}: StatCardProps) {
  const deltaIsGood = delta ? (delta.value <= 0 ? delta.goodDirection === 'down' : delta.goodDirection === 'up') : false

  return (
    <motion.div
      whileHover={{ y: -3, rotate: 0 }}
      style={{ transform: `rotate(${rotate}deg)` }}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      className={`ink-border relative overflow-hidden rounded-2xl p-5 shadow-[var(--shadow-card)] ${toneBg[tone]}`}
    >
      <div className="flex items-start justify-between">
        <div className="ink-border flex h-10 w-10 items-center justify-center rounded-full bg-white text-ink-on-sticky">
          <Icon size={18} strokeWidth={2.25} />
        </div>
        {trend && trend.length > 1 && <Sparkline points={trend} color="#16140f" />}
      </div>

      <p className="mt-4 font-display text-4xl leading-none text-ink-on-sticky">
        <CountUp value={value} suffix={suffix} decimals={decimals} />
      </p>
      <p className="mt-2 text-sm font-semibold text-ink-on-sticky/80">{label}</p>

      {delta && (
        <div className="mt-2 flex items-center gap-1 text-xs font-bold">
          <span className={`flex items-center gap-0.5 ${deltaIsGood ? 'text-emerald-800' : 'text-red-800'}`}>
            {delta.value <= 0 ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
            {Math.abs(delta.value)}
          </span>
          <span className="text-ink-on-sticky/70">{delta.caption}</span>
        </div>
      )}
    </motion.div>
  )
}
