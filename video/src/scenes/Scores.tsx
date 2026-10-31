import { Bot, Fingerprint } from 'lucide-react'
import type { ReactNode } from 'react'
import { interpolate, useCurrentFrame } from 'remotion'
import { Card, Heading, Scene, useEntrance, useVertical } from '../components/ui'
import { colors, fonts } from '../theme'

function ScoreCard({ icon, label, value, caption, tint, delay }: { icon: ReactNode; label: string; value: number; caption: string; tint: string; delay: number }) {
  const frame = useCurrentFrame()
  const enter = useEntrance(delay, 12)
  const progress = interpolate(frame, [delay + 6, delay + 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const shown = value * (1 - Math.pow(1 - progress, 3))
  return (
    <Card style={{ flex: 1, padding: 40, opacity: enter, transform: `translateY(${(1 - enter) * 60}px) rotate(${delay % 2 ? 1 : -1}deg)` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ width: 70, height: 70, borderRadius: 999, background: tint, border: `3px solid ${colors.ink}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </span>
        <span style={{ fontSize: 40, fontWeight: 700, color: colors.ink2 }}>{label}</span>
      </div>
      <div style={{ fontFamily: fonts.display, fontSize: 150, lineHeight: 1.1, marginTop: 14 }}>{shown.toFixed(1)}%</div>
      <div style={{ height: 30, borderRadius: 999, border: `3px solid ${colors.ink}`, background: colors.surfaceHover, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${shown}%`, background: colors.green }} />
      </div>
      <div style={{ marginTop: 18, fontSize: 32, color: colors.inkMuted }}>{caption}</div>
    </Card>
  )
}

export function Scores({ duration }: { duration: number }) {
  const vertical = useVertical()
  return (
    <Scene duration={duration}>
      <Heading eyebrow="before your examiner does" title="Similarity & AI content" />
      <div style={{ display: 'flex', flexDirection: vertical ? 'column' : 'row', gap: 44, marginTop: 50, width: vertical ? 900 : 1400 }}>
        <ScoreCard icon={<Fingerprint size={38} />} label="Similarity" value={2.4} caption="Checked against millions of open-access papers" tint={colors.blue} delay={14} />
        <ScoreCard icon={<Bot size={38} />} label="Likely AI-generated" value={3.1} caption="Sentence-by-sentence AI-content check" tint={colors.purple} delay={24} />
      </div>
    </Scene>
  )
}
