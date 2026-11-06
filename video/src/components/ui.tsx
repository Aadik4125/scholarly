import type { CSSProperties, ReactNode } from 'react'
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { cardShadow, colors, fonts } from '../theme'

export function useVertical() {
  const { width, height } = useVideoConfig()
  return height > width
}

/** Spring from 0 to 1 starting at `delay` frames. */
export function useEntrance(delay = 0, damping = 14) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  return spring({ frame: frame - delay, fps, config: { damping, mass: 0.8 } })
}

/** Wraps a scene: fades and lifts in at the start, fades out at the end. */
export function Scene({ duration, children, style }: { duration: number; children: ReactNode; style?: CSSProperties }) {
  const frame = useCurrentFrame()
  const opacity = interpolate(frame, [0, 8, duration - 8, duration], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const y = interpolate(frame, [0, 12], [24, 0], { extrapolateRight: 'clamp' })
  const vertical = useVertical()
  return (
    <AbsoluteFill
      style={{
        opacity,
        transform: `translateY(${y}px)`,
        alignItems: 'center',
        justifyContent: 'center',
        padding: vertical ? '120px 70px' : '80px 140px',
        fontFamily: fonts.serif,
        color: colors.ink,
        ...style,
      }}
    >
      {children}
    </AbsoluteFill>
  )
}

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        background: colors.surface,
        border: `4px solid ${colors.ink}`,
        borderRadius: 36,
        boxShadow: cardShadow,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function StickyTag({
  children,
  color,
  rotate = 0,
  style,
}: {
  children: ReactNode
  color: string
  rotate?: number
  style?: CSSProperties
}) {
  return (
    <div
      style={{
        display: 'inline-block',
        background: color,
        border: `3px solid ${colors.ink}`,
        borderRadius: 999,
        padding: '10px 26px',
        fontFamily: fonts.serif,
        fontWeight: 700,
        fontSize: 34,
        color: colors.ink,
        transform: `rotate(${rotate}deg)`,
        boxShadow: '3px 4px 0 rgba(22,20,15,0.85)',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

/** Big Anton heading with a handwritten eyebrow above it — the website's PageHeader. */
export function Heading({ eyebrow, title, delay = 0 }: { eyebrow: string; title: string; delay?: number }) {
  const enter = useEntrance(delay)
  const vertical = useVertical()
  return (
    <div style={{ textAlign: 'center', transform: `scale(${0.9 + enter * 0.1})`, opacity: enter }}>
      <div style={{ fontFamily: fonts.hand, fontSize: vertical ? 56 : 52, color: colors.ink2, transform: 'rotate(-1.5deg)' }}>
        {eyebrow}
      </div>
      <div
        style={{
          fontFamily: fonts.display,
          fontSize: vertical ? 104 : 96,
          lineHeight: 1.05,
          letterSpacing: 2,
          textTransform: 'uppercase',
          marginTop: 6,
        }}
      >
        {title}
      </div>
    </div>
  )
}

/** Reveals `text` one character at a time from frame `start`. */
export function typed(text: string, frame: number, start: number, charsPerFrame = 1.2) {
  const n = Math.max(0, Math.floor((frame - start) * charsPerFrame))
  return text.slice(0, n)
}

export function Cursor({ visible = true }: { visible?: boolean }) {
  const frame = useCurrentFrame()
  return (
    <span style={{ opacity: visible && Math.floor(frame / 12) % 2 === 0 ? 1 : 0, fontWeight: 400 }}>|</span>
  )
}
