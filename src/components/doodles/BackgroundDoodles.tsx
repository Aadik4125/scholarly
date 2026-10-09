import {
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
} from './DoodleShapes'

const muted = {
  terracotta: '#c17a52',
  blue: '#7fa0bd',
  pink: '#c98d9a',
  brown: '#6b5744',
  olive: '#8f9460',
  gold: '#bf9a2e',
} as const

interface Placement {
  shape: typeof DoodleArrow
  top: string
  left: string
  size: number
  rotate: number
  color: string
  flip?: boolean
}

const placements: Placement[] = [
  { shape: DoodleArrow, top: '4%', left: '3%', size: 72, rotate: -18, color: muted.pink },
  { shape: DoodleStar, top: '9%', left: '91%', size: 46, rotate: 12, color: muted.brown },
  { shape: DoodleSparkle, top: '2%', left: '48%', size: 30, rotate: 0, color: muted.gold },
  { shape: DoodleLoop, top: '16%', left: '14%', size: 54, rotate: 8, color: muted.blue },
  { shape: DoodleWorm, top: '20%', left: '96%', size: 60, rotate: 20, color: muted.olive },
  { shape: DoodleFlowerLoop, top: '28%', left: '2%', size: 64, rotate: -10, color: muted.terracotta },
  { shape: DoodleStarburst, top: '34%', left: '93%', size: 40, rotate: -6, color: muted.gold },
  { shape: DoodleArch, top: '38%', left: '6%', size: 50, rotate: 4, color: muted.blue, flip: true },
  { shape: DoodleScribbleLoop, top: '46%', left: '90%', size: 58, rotate: 14, color: muted.pink },
  { shape: DoodleDot, top: '48%', left: '4%', size: 16, rotate: 0, color: muted.terracotta },
  { shape: DoodleSpiralCoil, top: '54%', left: '95%', size: 56, rotate: -8, color: muted.brown },
  { shape: DoodlePlus, top: '58%', left: '8%', size: 22, rotate: 0, color: muted.olive },
  { shape: DoodleStar, top: '64%', left: '94%', size: 38, rotate: -16, color: muted.blue },
  { shape: DoodleDash, top: '66%', left: '3%', size: 30, rotate: -20, color: muted.gold },
  { shape: DoodleArrow, top: '72%', left: '92%', size: 64, rotate: 150, color: muted.terracotta },
  { shape: DoodleLoop, top: '78%', left: '5%', size: 48, rotate: -6, color: muted.pink },
  { shape: DoodleSparkle, top: '84%', left: '90%', size: 28, rotate: 10, color: muted.brown },
  { shape: DoodleWorm, top: '88%', left: '10%', size: 52, rotate: -24, color: muted.blue },
  { shape: DoodleDashVertical, top: '92%', left: '96%', size: 26, rotate: 12, color: muted.olive },
  { shape: DoodleFlowerLoop, top: '95%', left: '45%', size: 54, rotate: 18, color: muted.gold },
  { shape: DoodleStarburst, top: '12%', left: '62%', size: 26, rotate: 10, color: muted.pink },
  { shape: DoodleDot, top: '60%', left: '48%', size: 14, rotate: 0, color: muted.blue },
  { shape: DoodleScribbleLoop, top: '6%', left: '78%', size: 36, rotate: -14, color: muted.olive },
  { shape: DoodleArch, top: '96%', left: '72%', size: 40, rotate: -4, color: muted.terracotta },
]

export default function BackgroundDoodles() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {placements.map((p, i) => {
        const Shape = p.shape
        return (
          <div
            key={i}
            className="absolute opacity-[0.22] dark:opacity-[0.16]"
            style={{
              top: p.top,
              left: p.left,
              width: p.size,
              height: p.size,
              color: p.color,
              transform: `translate(-50%, -50%) rotate(${p.rotate}deg) ${p.flip ? 'scaleX(-1)' : ''}`,
            }}
          >
            <Shape className="h-full w-full" />
          </div>
        )
      })}
    </div>
  )
}
