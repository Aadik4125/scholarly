import { useCurrentFrame } from 'remotion'
import { Cursor, Scene, typed, useEntrance, useVertical } from '../components/ui'
import { colors, fonts } from '../theme'

const LINE_1 = 'Submitting your paper soon?'

export function Hook({ duration }: { duration: number }) {
  const frame = useCurrentFrame()
  const vertical = useVertical()
  const line1 = typed(LINE_1, frame, 4, 0.9)
  const second = useEntrance(46)
  return (
    <Scene duration={duration}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: fonts.hand, fontSize: vertical ? 120 : 130, lineHeight: 1.1, transform: 'rotate(-2deg)' }}>
          {line1}
          <Cursor visible={line1.length < LINE_1.length} />
        </div>
        <div
          style={{
            marginTop: 40,
            maxWidth: vertical ? 860 : 1500,
            marginLeft: 'auto',
            marginRight: 'auto',
            fontSize: vertical ? 54 : 52,
            color: colors.ink2,
            opacity: second,
            transform: `translateY(${(1 - second) * 30}px)`,
          }}
        >
          Contradictions, weak citations and shaky prose are easy to miss.
        </div>
      </div>
    </Scene>
  )
}
