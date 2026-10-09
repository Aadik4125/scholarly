import { extractDocument } from './textExtraction'
import { analyzeConsistency } from './consistencyEngine'
import { analyzeWriting } from './writingEngine'
import { analyzeCitations } from './citationEngine'
import type { Paper, PaperSection } from '../types'

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function prettifyTitle(fileName: string): string {
  const base = fileName.replace(/\.(pdf|docx?|txt)$/i, '')
  const spaced = base.replace(/[-_]+/g, ' ').trim()
  return spaced
    .split(' ')
    .map((w) => (w.length > 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ')
}

export async function analyzePaper(file: File, onStage?: (stage: number) => void): Promise<Paper> {
  onStage?.(0)
  const extracted = await extractDocument(file)
  await delay(350)

  onStage?.(1)
  const consistencyIssues = analyzeConsistency(extracted.sections)
  await delay(350)

  onStage?.(2)
  const writingSuggestions = analyzeWriting(extracted.sections)
  const citationGaps = analyzeCitations(extracted.sections)
  await delay(350)

  onStage?.(3)

  const sections: PaperSection[] = extracted.sections.map((s, i) => ({
    id: `sec-${i}`,
    heading: s.heading,
    excerpt: s.text.slice(0, 220),
  }))

  const wordCount = extracted.fullText.trim().split(/\s+/).filter(Boolean).length

  return {
    id: crypto.randomUUID(),
    analysisMode: 'heuristic',
    title: prettifyTitle(file.name),
    fileName: file.name,
    uploadedAt: new Date().toISOString(),
    pageCount: extracted.pageCount ?? Math.max(1, Math.round(wordCount / 500)),
    wordCount,
    sections,
    consistencyIssues,
    writingSuggestions,
    citationGaps,
    similaritySources: [],
    overallSimilarityPercent: 0,
    noveltyPoints: [],
    versions: [
      {
        id: 'v1',
        label: 'Draft 1',
        uploadedAt: new Date().toISOString(),
        consistencyOpenCount: consistencyIssues.length,
        writingAcceptedCount: 0,
        note: 'Initial upload',
      },
    ],
    suggestedQuestions: [
      'Summarize what this paper argues in plain language.',
      'What would a viva panel most likely challenge?',
      'Which claims might need a citation?',
    ],
    fullText: extracted.fullText,
    fileSizeBytes: file.size,
  }
}
