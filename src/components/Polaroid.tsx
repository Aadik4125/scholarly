import type { ReactNode } from 'react'

interface PolaroidProps {
  caption: string
  rotate?: number
  tape?: 'blue' | 'pink' | 'yellow'
  width?: number
  children: ReactNode
  className?: string
}

const tapeColor: Record<NonNullable<PolaroidProps['tape']>, string> = {
  blue: 'var(--sticky-blue)',
  pink: 'var(--sticky-pink)',
  yellow: 'var(--sticky-yellow)',
}

export default function Polaroid({ caption, rotate = -3, tape = 'blue', width = 128, children, className = '' }: PolaroidProps) {
  return (
    <div
      style={{ transform: `rotate(${rotate}deg)`, width }}
      className={`relative inline-block rounded-sm bg-white p-2 pb-5 ink-border shadow-[var(--shadow-card)] ${className}`}
    >
      <div
        aria-hidden
        style={{ background: tapeColor[tape], transform: 'translateX(-50%) rotate(-4deg)' }}
        className="absolute -top-2.5 left-1/2 h-5 w-14 opacity-80 ink-border"
      />
      <div className="flex aspect-square items-center justify-center overflow-hidden rounded-sm bg-[#efece1]">{children}</div>
      <p className="mt-2 text-center font-hand text-base leading-none text-[#16140f]">{caption}</p>
    </div>
  )
}
