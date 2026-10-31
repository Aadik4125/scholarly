import { FileText, MousePointer2 } from 'lucide-react'
import { useCurrentFrame } from 'remotion'
import { Card, Scene, StickyTag, useEntrance, useVertical } from '../components/ui'
import { colors, fonts, popShadow } from '../theme'

export function CallToAction({ duration }: { duration: number }) {
  const frame = useCurrentFrame()
  const vertical = useVertical()
  const logo = useEntrance(2, 10)
  const tagline = useEntrance(14)
  const button = useEntrance(26, 9)
  const tags = useEntrance(40, 9)
  const pulse = 1 + Math.max(0, Math.sin((frame - 40) / 7)) * 0.04
  return (
    <Scene duration={duration} style={{ justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Card style={{ padding: '18px 60px', display: 'inline-flex', alignItems: 'center', gap: 28, transform: `scale(${logo})` }}>
          <span style={{ width: 100, height: 100, borderRadius: 999, background: colors.ink, color: colors.paper, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FileText size={52} />
          </span>
          <span style={{ fontFamily: fonts.display, fontSize: vertical ? 130 : 160, letterSpacing: 4, lineHeight: 1.1 }}>SCHOLARLY</span>
        </Card>
        <div style={{ marginTop: 34, fontFamily: fonts.hand, fontSize: 80, color: colors.ink2, transform: `rotate(-2deg) translateY(${(1 - tagline) * 20}px)`, opacity: tagline }}>
          one upload is all it takes
        </div>
        <div
          style={{
            marginTop: 50,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 20,
            background: colors.ink,
            color: colors.paper,
            border: `4px solid ${colors.ink}`,
            borderRadius: 999,
            padding: '26px 64px',
            fontSize: vertical ? 70 : 76,
            fontWeight: 700,
            boxShadow: popShadow,
            transform: `scale(${button * pulse})`,
          }}
        >
          scholar.click
          <MousePointer2 size={60} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 26, marginTop: 56, opacity: tags, transform: `translateY(${(1 - tags) * 20}px)` }}>
          <StickyTag color={colors.yellow} rotate={-3}>Consistency</StickyTag>
          <StickyTag color={colors.green} rotate={2}>Writing</StickyTag>
          <StickyTag color={colors.blue} rotate={-2}>Similarity</StickyTag>
          <StickyTag color={colors.purple} rotate={3}>AI content</StickyTag>
          <StickyTag color={colors.peach} rotate={-1}>Ask My Paper</StickyTag>
        </div>
      </div>
    </Scene>
  )
}
