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
//
// Short documents (an essay, a one-page answer) can't reach those counts: a 5-sentence answer
// flagged at 96-98% on every sentence read "No clear signs", and a fully AI-written docx from a
// tester was reported as human. With 5-40 scored sentences the share of flagged sentences
// decides instead: likely >= 60%, some >= 50%. Measured on short texts (median ~17 sentences)
// the rule was not tuned on: AI texts called likely rose from 38-70% to 52-82% depending on the
// set (older models 25% -> 62%); human texts called likely 0.5-2% (3.5% on the oldest set),
// some-or-likely 1.5-4%. No human paper in the 135 is that short, so papers are unaffected.
export const LIKELY_AI = 0.5
const SHORT_MIN_SENTENCES = 5
const SHORT_MAX_SENTENCES = 40
const SHORT_LIKELY_SHARE = 0.6
const SHORT_SOME_SHARE = 0.5
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
  /** True when the text was short enough to be judged on its share of flagged sentences. */
  shortText: boolean
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
  let level: AiVerdictLevel = strongSentences >= LIKELY_SENTENCES ? 'likely' : strongSentences >= SOME_SENTENCES ? 'some' : 'none'

  const scores = sections.flatMap((s) => s.sentences.map((x) => x.score))
  const shortText = scores.length >= SHORT_MIN_SENTENCES && scores.length <= SHORT_MAX_SENTENCES
  if (shortText) {
    const share = scores.filter((s) => s >= LIKELY_AI).length / scores.length
    const byShare: AiVerdictLevel = share >= SHORT_LIKELY_SHARE ? 'likely' : share >= SHORT_SOME_SHARE ? 'some' : 'none'
    const rank = { none: 0, some: 1, likely: 2 }
    if (rank[byShare] > rank[level]) level = byShare
  }
  return { level, passages: strong, shortText }
}

export const VERDICT_TEXT: Record<AiVerdictLevel, { title: string; short: string }> = {
  likely: { title: 'Likely contains AI-written text', short: 'Likely AI-written text' },
  some: { title: 'Some passages read like AI writing', short: 'Some AI-style passages' },
  none: { title: 'No clear signs of AI writing', short: 'No clear signs' },
}
