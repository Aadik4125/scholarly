interface SparklineProps {
  points: number[]
  color: string
  width?: number
  height?: number
}

export default function Sparkline({ points, color, width = 56, height = 24 }: SparklineProps) {
  if (points.length < 2) return null
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const step = width / (points.length - 1)

  const coords = points.map((p, i) => {
    const x = i * step
    const y = height - ((p - min) / range) * (height - 4) - 2
    return [x, y] as const
  })

  const path = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const [lastX, lastY] = coords[coords.length - 1]

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none">
      <path d={path} stroke="var(--ink-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
      <circle cx={lastX} cy={lastY} r="2.5" fill={color} stroke="var(--surface)" strokeWidth="1.5" />
    </svg>
  )
}
