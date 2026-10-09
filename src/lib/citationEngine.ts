import type { ExtractedSection } from './textExtraction'
import type { CitationGap } from '../types'
import { splitSentences, excerpt, nextLocalId } from './sentenceUtils'

const CLAIM_TRIGGERS =
  /\b(consistently outperforms?|significantly (reduces?|improves?|increases?|decreases?)|has been shown to|proven to|demonstrated to|studies show|research shows|it is well known that|outperforms all|state of the art|best[- ]performing)\b/i

const CITATION_MARKER = /\[\d+\]|\(\s*[A-Z][a-zA-Z]+[,\s]+\d{4}\s*\)|\bet al\.?\b/

export function analyzeCitations(sections: ExtractedSection[]): CitationGap[] {
  const gaps: CitationGap[] = []

  for (const { heading, text } of sections) {
    for (const sentence of splitSentences(text)) {
      if (!CLAIM_TRIGGERS.test(sentence)) continue
      if (CITATION_MARKER.test(sentence)) continue

      gaps.push({
        id: nextLocalId('cg'),
        section: heading,
        claim: excerpt(sentence, 180),
      })
    }
  }

  return gaps.slice(0, 10)
}
