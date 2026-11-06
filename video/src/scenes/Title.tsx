import { FileText } from 'lucide-react'
import { Card, Scene, StickyTag, useEntrance, useVertical } from '../components/ui'
import { colors, fonts } from '../theme'

export function Title({ duration }: { duration: number }) {
  const vertical = useVertical()
  const card = useEntrance(2, 10)
  const tagA = useEntrance(16, 9)
  const tagB = useEntrance(24, 9)
  const sub = useEntrance(32)
  return (
    <Scene duration={duration}>
      <div style={{ position: 'relative', textAlign: 'center' }}>
        <div style={{ position: 'absolute', left: vertical ? -10 : -170, top: vertical ? -120 : -80, transform: `scale(${tagA})` }}>
          <StickyTag color={colors.green} rotate={-7}>✦ no project form</StickyTag>
        </div>
        <div style={{ position: 'absolute', right: vertical ? -10 : -150, top: vertical ? -120 : -90, transform: `scale(${tagB})` }}>
          <StickyTag color={colors.pink} rotate={7}>upload &amp; go</StickyTag>
        </div>
        <Card style={{ padding: vertical ? '20px 50px' : '24px 70px', transform: `scale(${card})`, display: 'inline-flex', alignItems: 'center', gap: 34 }}>
          <span
            style={{
              width: vertical ? 96 : 120,
              height: vertical ? 96 : 120,
              borderRadius: 999,
              background: colors.ink,
              color: colors.paper,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <FileText size={vertical ? 50 : 62} />
          </span>
          <span style={{ fontFamily: fonts.display, fontSize: vertical ? 150 : 200, letterSpacing: 4, lineHeight: 1.1 }}>SCHOLARLY</span>
        </Card>
        <div style={{ marginTop: 50, fontSize: vertical ? 54 : 58, color: colors.ink2, opacity: sub, transform: `translateY(${(1 - sub) * 24}px)` }}>
          Your AI research &amp; integrity copilot ✦
        </div>
      </div>
    </Scene>
  )
}
