import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { colors } from '../theme'

// The site's ruled-notebook background with a few slowly drifting doodles.
const doodles = [
  { x: 0.06, y: 0.12, char: '✦', size: 64, color: colors.pink },
  { x: 0.9, y: 0.16, char: '☆', size: 84, color: colors.inkMuted },
  { x: 0.1, y: 0.82, char: '∿', size: 90, color: colors.blue },
  { x: 0.88, y: 0.78, char: '✳', size: 70, color: colors.peach },
  { x: 0.5, y: 0.06, char: '✶', size: 48, color: colors.purple },
  { x: 0.94, y: 0.48, char: '◌', size: 60, color: colors.green },
  { x: 0.04, y: 0.46, char: '✿', size: 66, color: colors.peach },
]

export function PaperBackground() {
  const frame = useCurrentFrame()
  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.paper,
        backgroundImage: `repeating-linear-gradient(to bottom, transparent, transparent 47px, ${colors.paperLine} 47px, ${colors.paperLine} 49px)`,
      }}
    >
      {doodles.map((d, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: `${d.x * 100}%`,
            top: `${d.y * 100}%`,
            fontSize: d.size,
            color: d.color,
            opacity: 0.75,
            transform: `translateY(${Math.sin((frame + i * 20) / 30) * 10}px) rotate(${Math.sin((frame + i * 13) / 45) * 12}deg)`,
          }}
        >
          {d.char}
        </div>
      ))}
    </AbsoluteFill>
  )
}
