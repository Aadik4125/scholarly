import { ShieldAlert } from 'lucide-react'
import { interpolate, useCurrentFrame } from 'remotion'
import { Card, Heading, Scene, useEntrance, useVertical } from '../components/ui'
import { colors } from '../theme'

function Quote({ section, before, highlight, after, sweepAt }: { section: string; before: string; highlight: string; after: string; sweepAt: number }) {
  const frame = useCurrentFrame()
  const sweep = interpolate(frame, [sweepAt, sweepAt + 14], [0, 100], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <div style={{ flex: 1, border: `3px solid ${colors.ink}`, borderRadius: 24, padding: '22px 28px', background: colors.paper }}>
      <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: 2, color: colors.inkMuted, textTransform: 'uppercase' }}>{section}</div>
      <div style={{ marginTop: 10, fontSize: 38, lineHeight: 1.35, color: colors.ink2 }}>
        {before}
        <span
          style={{
            fontWeight: 700,
            color: colors.ink,
            backgroundImage: `linear-gradient(${colors.pink}, ${colors.pink})`,
            backgroundSize: `${sweep}% 100%`,
            backgroundRepeat: 'no-repeat',
            padding: '0 4px',
          }}
        >
          {highlight}
        </span>
        {after}
      </div>
    </div>
  )
}

export function Consistency({ duration }: { duration: number }) {
  const vertical = useVertical()
  const card = useEntrance(14, 12)
  return (
    <Scene duration={duration}>
      <Heading eyebrow="finds what reviewers find" title="Catches contradictions" />
      <Card style={{ marginTop: 50, width: vertical ? 940 : 1500, padding: 36, opacity: card, transform: `translateY(${(1 - card) * 60}px)` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <ShieldAlert size={46} />
            <span style={{ fontSize: 44, fontWeight: 700 }}>Dataset size doesn’t match</span>
          </div>
          <span style={{ background: colors.pink, border: `3px solid ${colors.ink}`, borderRadius: 999, padding: '6px 22px', fontSize: 30, fontWeight: 700 }}>
            High
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: vertical ? 'column' : 'row', gap: 24, marginTop: 28 }}>
          <Quote section="Abstract" before="…trained on " highlight="180,519 records" after=" from the DataCo dataset…" sweepAt={34} />
          <Quote section="Methodology" before="…the final dataset contains " highlight="172,765 records" after=" after cleaning…" sweepAt={50} />
        </div>
      </Card>
    </Scene>
  )
}
