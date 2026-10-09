import type { SVGProps } from 'react'

type DoodleProps = SVGProps<SVGSVGElement>

const base = {
  viewBox: '0 0 100 100',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export function DoodleArrow(props: DoodleProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 68 C 30 58, 40 40, 36 24 C 34 16, 42 14, 46 22 C 50 32, 46 48, 58 50 C 68 52, 74 42, 78 32" />
      <path d="M58 30 L 80 30 L 72 50" />
    </svg>
  )
}

export function DoodleStar(props: DoodleProps) {
  return (
    <svg {...base} {...props}>
      <path d="M50 10 L59 40 L90 40 L64 58 L74 88 L50 69 L26 88 L36 58 L10 40 L41 40 Z" />
    </svg>
  )
}

export function DoodleSparkle(props: DoodleProps) {
  return (
    <svg {...base} {...props}>
      <path d="M50 14 L50 48" />
      <path d="M22 30 L74 66" />
      <path d="M78 30 L26 66" />
    </svg>
  )
}

export function DoodleLoop(props: DoodleProps) {
  return (
    <svg {...base} {...props}>
      <path d="M30 32 C 10 32, 10 62, 28 60 C 44 58, 40 34, 26 38 C 14 41, 16 58, 32 56" />
      <path d="M62 30 C 42 28, 40 58, 58 58 C 76 58, 76 32, 60 36 C 48 39, 50 58, 68 54" />
    </svg>
  )
}

export function DoodleScribbleLoop(props: DoodleProps) {
  return (
    <svg {...base} {...props}>
      <path d="M58 20 C 30 16, 14 32, 20 50 C 25 64, 46 68, 56 58 C 64 50, 56 36, 42 40 C 32 43, 32 54, 44 54 C 54 54, 60 46, 52 38" />
    </svg>
  )
}

export function DoodleFlowerLoop(props: DoodleProps) {
  return (
    <svg {...base} {...props}>
      <path d="M50 70 C 20 78, 10 56, 28 50 C 10 46, 16 22, 38 30 C 32 14, 56 10, 58 28 C 72 16, 90 32, 76 44 C 92 50, 84 72, 64 64 C 68 82, 44 88, 42 70" />
    </svg>
  )
}

export function DoodleStarburst(props: DoodleProps) {
  return (
    <svg viewBox="0 0 100 100" {...props}>
      <path
        fill="currentColor"
        stroke="none"
        d="M50 4 L58 36 L72 14 L64 42 L92 34 L66 50 L92 66 L64 58 L72 86 L58 64 L50 96 L42 64 L28 86 L36 58 L8 66 L34 50 L8 34 L36 42 L28 14 L42 36 Z"
      />
    </svg>
  )
}

export function DoodleWorm(props: DoodleProps) {
  return (
    <svg {...base} {...props}>
      <path d="M50 10 C 30 10, 30 30, 50 30 C 70 30, 70 50, 50 50 C 30 50, 30 70, 50 70 C 70 70, 70 90, 50 90" />
    </svg>
  )
}

export function DoodleArch(props: DoodleProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 68 C 12 30, 40 30, 40 68 C 40 30, 68 30, 68 68 C 68 30, 88 30, 88 68" />
    </svg>
  )
}

export function DoodleSpiralCoil(props: DoodleProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 62 C 12 78, 32 78, 32 62 C 32 50, 16 50, 16 62 C 16 72, 28 72, 28 62 C 28 54, 40 60, 44 68 C 48 78, 64 80, 68 62 C 71 48, 56 46, 56 60 C 56 70, 72 72, 76 58 C 80 44, 92 50, 88 62" />
    </svg>
  )
}

export function DoodleDash(props: DoodleProps) {
  return (
    <svg {...base} strokeWidth={9} {...props}>
      <path d="M20 50 L80 50" />
    </svg>
  )
}

export function DoodleDashVertical(props: DoodleProps) {
  return (
    <svg {...base} strokeWidth={9} {...props}>
      <path d="M50 20 L50 80" />
    </svg>
  )
}

export function DoodleDot(props: DoodleProps) {
  return (
    <svg viewBox="0 0 100 100" {...props}>
      <circle cx="50" cy="50" r="18" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function DoodlePlus(props: DoodleProps) {
  return (
    <svg {...base} strokeWidth={9} {...props}>
      <path d="M50 24 L50 76 M24 50 L76 50" />
    </svg>
  )
}

export const doodleShapes = [
  DoodleArrow,
  DoodleStar,
  DoodleSparkle,
  DoodleLoop,
  DoodleScribbleLoop,
  DoodleFlowerLoop,
  DoodleStarburst,
  DoodleWorm,
  DoodleArch,
  DoodleSpiralCoil,
  DoodleDash,
  DoodleDashVertical,
  DoodleDot,
  DoodlePlus,
]
