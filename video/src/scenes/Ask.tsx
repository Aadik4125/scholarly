import { MessageCircleQuestion } from 'lucide-react'
import { useCurrentFrame } from 'remotion'
import { Card, Cursor, Heading, Scene, typed, useEntrance, useVertical } from '../components/ui'
import { colors } from '../theme'

const QUESTION = 'What would my viva panel most likely challenge?'
const ANSWER_AT = 62

export function Ask({ duration }: { duration: number }) {
  const frame = useCurrentFrame()
  const vertical = useVertical()
  const card = useEntrance(10, 12)
  const question = typed(QUESTION, frame, 18, 1.4)
  const answer = useEntrance(ANSWER_AT, 12)
  return (
    <Scene duration={duration}>
      <Heading eyebrow="grounded in your own paper" title="Ask your paper anything" />
      <Card style={{ marginTop: 50, width: vertical ? 940 : 1400, padding: 40, opacity: card, transform: `translateY(${(1 - card) * 60}px)` }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ background: colors.ink, color: colors.paper, borderRadius: 30, borderBottomRightRadius: 6, padding: '20px 30px', fontSize: 40, maxWidth: '85%' }}>
            {question}
            <Cursor visible={question.length < QUESTION.length} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 18, marginTop: 30, opacity: answer, transform: `translateY(${(1 - answer) * 30}px)` }}>
          <span style={{ flexShrink: 0, width: 66, height: 66, borderRadius: 999, background: colors.yellow, border: `3px solid ${colors.ink}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MessageCircleQuestion size={34} />
          </span>
          <div style={{ background: colors.paper, border: `3px solid ${colors.ink}`, borderRadius: 30, borderTopLeftRadius: 6, padding: '22px 30px' }}>
            <div style={{ fontSize: 38, lineHeight: 1.45, color: colors.ink2 }}>
              Expect questions on why the Random Forest was preferred over XGBoost, and how data leakage was ruled out
              in the train–test split.
            </div>
            <div style={{ marginTop: 14, fontSize: 28, fontWeight: 700, color: colors.inkMuted }}>Grounded in: Methodology · Results</div>
          </div>
        </div>
      </Card>
    </Scene>
  )
}
