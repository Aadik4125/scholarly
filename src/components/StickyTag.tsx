import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export type StickyColor = 'yellow' | 'pink' | 'green' | 'blue' | 'purple' | 'peach'

const colorClass: Record<StickyColor, string> = {
  yellow: 'bg-sticky-yellow',
  pink: 'bg-sticky-pink',
  green: 'bg-sticky-green',
  blue: 'bg-sticky-blue',
  purple: 'bg-sticky-purple',
  peach: 'bg-sticky-peach',
}

interface StickyTagProps {
  color?: StickyColor
  icon?: LucideIcon
  rotate?: number
  className?: string
  children: ReactNode
}

export default function StickyTag({ color = 'yellow', icon: Icon, rotate = -2, className = '', children }: StickyTagProps) {
  return (
    <span
      style={{ transform: `rotate(${rotate}deg)` }}
      className={`ink-border inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold text-ink-on-sticky shadow-sm ${colorClass[color]} ${className}`}
    >
      {Icon && <Icon size={12} strokeWidth={2.5} />}
      {children}
    </span>
  )
}
