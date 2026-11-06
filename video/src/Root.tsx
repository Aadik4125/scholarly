import { AbsoluteFill, Composition, Series } from 'remotion'
import { PaperBackground } from './components/PaperBackground'
import { FPS } from './theme'
import { Hook } from './scenes/Hook'
import { Title } from './scenes/Title'
import { Upload } from './scenes/Upload'
import { Consistency } from './scenes/Consistency'
import { Writing } from './scenes/Writing'
import { Scores } from './scenes/Scores'
import { Ask } from './scenes/Ask'
import { CallToAction } from './scenes/CallToAction'

// Scene order and lengths (frames at 30 fps). Edit here to retime the ad.
const scenes = [
  { component: Hook, duration: 90 },
  { component: Title, duration: 90 },
  { component: Upload, duration: 120 },
  { component: Consistency, duration: 120 },
  { component: Writing, duration: 120 },
  { component: Scores, duration: 120 },
  { component: Ask, duration: 120 },
  { component: CallToAction, duration: 120 },
]
const TOTAL = scenes.reduce((n, s) => n + s.duration, 0)

function ScholarlyAd() {
  return (
    <AbsoluteFill>
      <PaperBackground />
      <Series>
        {scenes.map(({ component: Scene, duration }, i) => (
          <Series.Sequence key={i} durationInFrames={duration}>
            <Scene duration={duration} />
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  )
}

export function RemotionRoot() {
  return (
    <>
      <Composition id="ScholarlyAd" component={ScholarlyAd} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080} />
      <Composition id="ScholarlyAdVertical" component={ScholarlyAd} durationInFrames={TOTAL} fps={FPS} width={1080} height={1920} />
    </>
  )
}
