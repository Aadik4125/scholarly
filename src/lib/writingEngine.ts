import type { ExtractedSection } from './textExtraction'
import type { WritingSuggestion } from '../types'
import { splitSentences, nextLocalId } from './sentenceUtils'

const FILLER_PHRASES: [RegExp, string][] = [
  [/\bit is important to note that\s*/gi, ''],
  [/\bit should be noted that\s*/gi, ''],
  [/\bin light of the fact that\b/gi, 'because'],
  [/\bdue to the fact that\b/gi, 'because'],
  [/\bowing to the fact that\b/gi, 'because'],
  [/\bin order to\b/gi, 'to'],
  [/\bfor the purpose of\b/gi, 'to'],
  [/\bhas the ability to\b/gi, 'can'],
  [/\bin the event that\b/gi, 'if'],
  [/\bwith regard to\b/gi, 'regarding'],
  [/\bwith regards to\b/gi, 'regarding'],
  [/\ba majority of\b/gi, 'most'],
  [/\ba large number of\b/gi, 'many'],
  [/\ba significant number of\b/gi, 'many'],
  [/\bat this point in time\b/gi, 'now'],
  [/\bin the near future\b/gi, 'soon'],
  [/\beach and every\b/gi, 'every'],
  [/\bvery much worthy of\b/gi, 'worth'],
]

// PDFs built on standard fonts (WinAnsiEncoding) commonly decode the apostrophe byte as
// U+2019 (curly ’) rather than U+0027 (straight '), so every pattern must match both.
const APOS = `['’]`
const CONTRACTIONS: [RegExp, string][] = [
  [new RegExp(`\\bdon${APOS}t\\b`, 'gi'), 'do not'],
  [new RegExp(`\\bdoesn${APOS}t\\b`, 'gi'), 'does not'],
  [new RegExp(`\\bdidn${APOS}t\\b`, 'gi'), 'did not'],
  [new RegExp(`\\bcan${APOS}t\\b`, 'gi'), 'cannot'],
  [new RegExp(`\\bcouldn${APOS}t\\b`, 'gi'), 'could not'],
  [new RegExp(`\\bwon${APOS}t\\b`, 'gi'), 'will not'],
  [new RegExp(`\\bwouldn${APOS}t\\b`, 'gi'), 'would not'],
  [new RegExp(`\\bshouldn${APOS}t\\b`, 'gi'), 'should not'],
  [new RegExp(`\\bisn${APOS}t\\b`, 'gi'), 'is not'],
  [new RegExp(`\\baren${APOS}t\\b`, 'gi'), 'are not'],
  [new RegExp(`\\bwasn${APOS}t\\b`, 'gi'), 'was not'],
  [new RegExp(`\\bweren${APOS}t\\b`, 'gi'), 'were not'],
  [new RegExp(`\\bit${APOS}s\\b`, 'gi'), 'it is'],
  [new RegExp(`\\bthat${APOS}s\\b`, 'gi'), 'that is'],
  [new RegExp(`\\bwe${APOS}re\\b`, 'gi'), 'we are'],
  [new RegExp(`\\bthey${APOS}re\\b`, 'gi'), 'they are'],
  [new RegExp(`\\bwe${APOS}ve\\b`, 'gi'), 'we have'],
  [new RegExp(`\\bi${APOS}ve\\b`, 'gi'), 'I have'],
]

function applyAll(sentence: string, rules: [RegExp, string][]): { result: string; matched: string[] } {
  let result = sentence
  const matched: string[] = []
  for (const [pattern, replacement] of rules) {
    // Global regexes carry `lastIndex` across calls, so a `.test()` pre-check here would be
    // stateful and can silently miss matches depending on what matched in earlier sentences.
    // `.replace()` on a global regex always resets `lastIndex` to 0 internally, so comparing
    // before/after is the safe way to detect whether a replacement actually happened.
    const before = result
    result = result.replace(pattern, replacement)
    if (result !== before) {
      matched.push(pattern.source.replace(/\\b/g, '').replace(/[()[\]]/g, ''))
    }
  }
  result = result.replace(/\s{2,}/g, ' ').replace(/\s+([,.;:])/g, '$1').trim()
  if (result.length > 0) result = result.charAt(0).toUpperCase() + result.slice(1)
  return { result, matched }
}

export function analyzeWriting(sections: ExtractedSection[]): WritingSuggestion[] {
  const suggestions: WritingSuggestion[] = []

  for (const { heading, text } of sections) {
    for (const sentence of splitSentences(text)) {
      if (sentence.length < 15 || sentence.length > 400) continue

      const concision = applyAll(sentence, FILLER_PHRASES)
      if (concision.result !== sentence && concision.result.length > 0) {
        suggestions.push({
          id: nextLocalId('ws'),
          section: heading,
          type: 'concision',
          original: sentence,
          suggested: concision.result,
          reason: 'Removes filler phrasing without changing the claim.',
          status: 'pending',
        })
        continue
      }

      const tone = applyAll(sentence, CONTRACTIONS)
      if (tone.result !== sentence && tone.result.length > 0) {
        suggestions.push({
          id: nextLocalId('ws'),
          section: heading,
          type: 'tone',
          original: sentence,
          suggested: tone.result,
          reason: 'Expands contractions to match formal academic register.',
          status: 'pending',
        })
      }
    }
  }

  return suggestions.slice(0, 20)
}
