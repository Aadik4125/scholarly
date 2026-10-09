import StickyTag from './StickyTag'
import type { Severity } from '../types'

const colorFor: Record<Severity, 'pink' | 'yellow' | 'green'> = {
  high: 'pink',
  medium: 'yellow',
  low: 'green',
}

const labels: Record<Severity, string> = {
  high: 'High severity',
  medium: 'Medium severity',
  low: 'Low severity',
}

export default function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <StickyTag color={colorFor[severity]} rotate={0}>
      {labels[severity]}
    </StickyTag>
  )
}
