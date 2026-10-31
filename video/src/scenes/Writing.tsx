import { Check } from 'lucide-react'
import { interpolate, useCurrentFrame } from 'remotion'
import { Card, Heading, Scene, useEntrance, useVertical } from '../components/ui'
import { colors } from '../theme'

const ORIGINAL = 'The size of logistics operations is getting bigger which means we have a lot of data to look at.'
const SUGGESTED = 'Logistics operations are expanding in scale, generating increasingly large volumes of data.'
const ACCEPT_AT = 52

export function Writing({ duration }: { duration: number }) {
  const frame = useCurrentFrame()
  const vertical = useVertical()
  const card = useEntrance(12, 12)
  const press = useEntrance(ACCEPT_AT - 8, 8)
  const accepted = frame >= ACCEPT_AT
  const swap = interpolate(frame, [ACCEPT_AT, ACCEPT_AT + 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const stamp = useEntrance(ACCEPT_AT + 8, 9)

  return (
    <Scene duration={duration}>
      <Heading eyebrow="clarity, concision & academic tone" title="Sharpens your writing" />
      <Card style={{ marginTop: 50, width: vertical ? 940 : 1400, padding: 44, position: 'relative', opacity: card, transform: `translateY(${(1 - card) * 60}px)` }}>
        <div style={{ display: 'flex', gap: 24, alignItems: 'center', fontSize: 28, color: colors.inkMuted }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 24, height: 24, borderRadius: 6, background: colors.yellow }} /> To be changed
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 24, height: 24, borderRadius: 6, background: colors.green }} /> Changed
          </span>
        </div>
        <p style={{ fontSize: vertical ? 44 : 46, lineHeight: 1.55, color: colors.ink2, margin: '26px 0 0' }}>
          Supply chains depend on timely delivery.{' '}
          <span
            style={{
              background: accepted ? colors.green : colors.yellow,
              color: colors.ink,
              borderRadius: 8,
              padding: '2px 6px',
              opacity: accepted ? swap : 1,
            }}
          >
            {accepted ? SUGGESTED : ORIGINAL}
          </span>{' '}
          Manual analysis struggles to keep pace.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 30 }}>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              background: colors.green,
              border: `3px solid ${colors.ink}`,
              borderRadius: 999,
              padding: '12px 30px',
              fontSize: 34,
              fontWeight: 700,
              transform: `scale(${1 - Math.sin(press * Math.PI) * 0.12})`,
              boxShadow: '3px 4px 0 rgba(22,20,15,0.85)',
            }}
          >
            <Check size={34} /> Accept
          </span>
        </div>
        <div
          style={{
            position: 'absolute',
            top: -40,
            right: 50,
            fontFamily: 'inherit',
            transform: `rotate(8deg) scale(${stamp})`,
            background: colors.surface,
            border: `4px solid #2f8f46`,
            color: '#2f8f46',
            borderRadius: 16,
            padding: '8px 22px',
            fontSize: 36,
            fontWeight: 700,
            letterSpacing: 2,
          }}
        >
          ✓ ACCEPTED
        </div>
      </Card>
    </Scene>
  )
}
