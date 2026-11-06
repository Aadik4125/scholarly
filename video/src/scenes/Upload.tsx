import { Check, FileText, Loader2, UploadCloud } from 'lucide-react'
import { interpolate, useCurrentFrame } from 'remotion'
import { Card, Heading, Scene, useEntrance, useVertical } from '../components/ui'
import { colors } from '../theme'

const steps = ['Extracting document structure', 'Running the consistency engine', 'Scanning for unsupported claims', 'Preparing your dashboard']
const DROP_AT = 18
const PROCESS_AT = 44

export function Upload({ duration }: { duration: number }) {
  const frame = useCurrentFrame()
  const vertical = useVertical()
  const drop = useEntrance(DROP_AT, 11)
  const processing = frame >= PROCESS_AT
  const fileOpacity = interpolate(frame, [PROCESS_AT - 6, PROCESS_AT], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const stepAt = (i: number) => PROCESS_AT + 8 + i * 14

  return (
    <Scene duration={duration}>
      <Heading eyebrow="one upload is all it takes" title="Drop in your paper" />
      <div style={{ position: 'relative', marginTop: 50 }}>
        {!processing && (
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: interpolate(drop, [0, 1], [-420, -40]),
              transform: `translateX(-50%) rotate(${(1 - drop) * -14}deg)`,
              zIndex: 2,
              opacity: fileOpacity * Math.min(1, drop * 4),
            }}
          >
            <Card style={{ padding: '22px 34px', display: 'flex', alignItems: 'center', gap: 18, borderRadius: 22, background: colors.yellow }}>
              <FileText size={44} />
              <span style={{ fontSize: 40, fontWeight: 700 }}>my-thesis-final.pdf</span>
            </Card>
          </div>
        )}
        <Card
          style={{
            width: vertical ? 900 : 1100,
            minHeight: 470,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 22,
            background: !processing && drop > 0.5 ? colors.yellow : colors.surface,
          }}
        >
          {!processing ? (
            <>
              <UploadCloud size={84} color={colors.ink2} />
              <div style={{ fontSize: 48, fontWeight: 700 }}>Drag and drop your paper here</div>
              <div style={{ fontSize: 34, color: colors.inkMuted }}>PDF or DOCX</div>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
              {steps.map((label, i) => {
                const done = frame >= stepAt(i) + 14
                const active = !done && frame >= stepAt(i)
                return (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 22, opacity: done || active ? 1 : 0.4 }}>
                    <span
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: 999,
                        border: `3px solid ${colors.ink}`,
                        background: done ? colors.green : active ? colors.yellow : colors.surface,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {done ? <Check size={30} /> : active ? <Loader2 size={30} style={{ transform: `rotate(${frame * 12}deg)` }} /> : null}
                    </span>
                    <span style={{ fontSize: 42, fontWeight: done || active ? 700 : 400 }}>{label}</span>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>
    </Scene>
  )
}
