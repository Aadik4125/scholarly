import type { AiContentSection } from '../types'

// The detector scores sentences; this turns those scores into a plain answer for the whole paper.
//
// An average hides AI writing: a chapter that was entirely AI-written scored 12.9% overall,
// because sections built around real numbers read as human while its generic sections scored
// 75-100%. Counting "sections that are mostly AI" goes too far the other way: a single 4-sentence
// section swings on one sentence, and that count fired on 21.5% of fully human papers.
//
// So the paper is cut into passages (sections, with long ones split into 12-sentence blocks,
// since PDFs often arrive as one long section) and the verdict counts flagged sentences inside
// strongly flagged passages. Measured on 135 human papers the detector never saw and on AI
// sections from models it never trained on (detector v3):
//   likely  >= 10 such sentences: 2.2% of human papers; 100% of fully AI papers, 72.5% of human
//           papers with two AI-written sections, 56% with one
//   some    >= 6 such sentences: 9.6% of human papers
export const LIKELY_AI = 0.5
const BLOCK_SENTENCES = 12
const MAX_UNSPLIT = 18
const MIN_PASSAGE_SENTENCES = 4
const STRONG_PASSAGE_SHARE = 0.6
const LIKELY_SENTENCES = 10
const SOME_SENTENCES = 6

export type AiVerdictLevel = 'likely' | 'some' | 'none'

export interface AiPassage {
  heading: string
  sentences: number
  flagged: number
  share: number
}

export interface AiVerdict {
  level: AiVerdictLevel
  /** Strongly flagged passages, most flagged first. */
  passages: AiPassage[]
}

export function aiVerdict(sections: AiContentSection[]): AiVerdict {
  const passages: AiPassage[] = []
  for (const section of sections) {
    const scores = [...section.sentences].sort((a, b) => a.start - b.start).map((s) => s.score)
    const blocks: number[][] = []
    if (scores.length <= MAX_UNSPLIT) blocks.push(scores)
    else {
      for (let i = 0; i < scores.length; i += BLOCK_SENTENCES) blocks.push(scores.slice(i, i + BLOCK_SENTENCES))
      if (blocks.length > 1 && blocks[blocks.length - 1].length < MIN_PASSAGE_SENTENCES) {
        blocks[blocks.length - 2].push(...blocks.pop()!)
      }
    }
    blocks.forEach((block, k) => {
      if (block.length < MIN_PASSAGE_SENTENCES) return
      const flagged = block.filter((s) => s >= LIKELY_AI).length
      const heading = blocks.length > 1 ? `${section.heading} (part ${k + 1} of ${blocks.length})` : section.heading
      passages.push({ heading, sentences: block.length, flagged, share: flagged / block.length })
    })
  }
  const strong = passages.filter((p) => p.share >= STRONG_PASSAGE_SHARE).sort((a, b) => b.share - a.share || b.flagged - a.flagged)
  const strongSentences = strong.reduce((n, p) => n + p.flagged, 0)
  const level: AiVerdictLevel = strongSentences >= LIKELY_SENTENCES ? 'likely' : strongSentences >= SOME_SENTENCES ? 'some' : 'none'
  return { level, passages: strong }
}

export const VERDICT_TEXT: Record<AiVerdictLevel, { title: string; short: string }> = {
  likely: { title: 'Likely contains AI-written text', short: 'Likely AI-written text' },
  some: { title: 'Some passages read like AI writing', short: 'Some AI-style passages' },
  none: { title: 'No clear signs of AI writing', short: 'No clear signs' },
}
