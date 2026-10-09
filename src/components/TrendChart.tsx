import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useTheme } from '../hooks/useTheme'
import { getChartPalette } from '../lib/chartTheme'

interface TrendChartProps {
  data: { label: string; openIssues: number }[]
}

function CustomTooltip({ active, payload, label, color }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="ink-border rounded-xl bg-surface-raised px-3 py-2 shadow-[var(--shadow-card)]">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-ink">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        {payload[0].value} open issues
      </p>
    </div>
  )
}

export default function TrendChart({ data }: TrendChartProps) {
  const { theme } = useTheme()
  const palette = getChartPalette(theme)

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 28, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={palette.cat1} stopOpacity={0.18} />
              <stop offset="100%" stopColor={palette.cat1} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={palette.grid} />
          <XAxis
            dataKey="label"
            type="category"
            interval={0}
            axisLine={{ stroke: palette.axis }}
            tickLine={false}
            tick={{ fill: palette.inkMuted, fontSize: 12 }}
          />
          <YAxis
            allowDecimals={false}
            axisLine={false}
            tickLine={false}
            width={28}
            tick={{ fill: palette.inkMuted, fontSize: 12 }}
          />
          <Tooltip content={<CustomTooltip color={palette.cat1} />} cursor={{ stroke: palette.axis, strokeWidth: 1 }} />
          <Area
            type="monotone"
            dataKey="openIssues"
            stroke={palette.cat1}
            strokeWidth={2}
            fill="url(#trendFill)"
            dot={{ r: 4, fill: palette.cat1, stroke: palette.surface, strokeWidth: 2 }}
            activeDot={{ r: 5, fill: palette.cat1, stroke: palette.surface, strokeWidth: 2 }}
            isAnimationActive
            animationDuration={700}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
