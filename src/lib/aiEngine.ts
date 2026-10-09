import { extractDocument } from './textExtraction'
import type { Paper, PaperSection } from '../types'

function prettifyTitle(fileName: string): string {
  const base = fileName.replace(/\.(pdf|docx?|txt)$/i, '')
  const spaced = base.replace(/[-_]+/g, ' ').trim()
  return spaced
    .split(' ')
    .map((w) => (w.length > 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ')
}

interface AnalyzeResponse {
  consistencyIssues: Paper['consistencyIssues']
  writingSuggestions: Paper['writingSuggestions']
  citationGaps: Paper['citationGaps']
  noveltyPoints: Paper['noveltyPoints']
  suggestedQuestions: string[]
  selfSimilarityMatches: Paper['selfSimilarityMatches']
}

/** Real analysis pipeline: extracts text client-side, then sends it to the backend
 *  (/api/analyze) where Claude finds contradictions and novelty, Claude Haiku checks
 *  writing and citations, and OpenAI embeddings flag internal near-duplicate passages. */
export async function analyzePaperWithAI(file: File, onStage?: (stage: number) => void): Promise<Paper> {
  onStage?.(0)
  const extracted = await extractDocument(file)

  onStage?.(1)
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: file.name, fullText: extracted.fullText, sections: extracted.sections }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Analysis request failed (${res.status})`)
  }
  const data: AnalyzeResponse = await res.json()

  onStage?.(2)
  const sections: PaperSection[] = extracted.sections.map((s, i) => ({
    id: `sec-${i}`,
    heading: s.heading,
    excerpt: s.text.slice(0, 220),
  }))
  const wordCount = extracted.fullText.trim().split(/\s+/).filter(Boolean).length

  onStage?.(3)

  return {
    id: crypto.randomUUID(),
    analysisMode: 'ai',
    title: prettifyTitle(file.name),
    fileName: file.name,
    uploadedAt: new Date().toISOString(),
    pageCount: extracted.pageCount ?? Math.max(1, Math.round(wordCount / 500)),
    wordCount,
    sections,
    consistencyIssues: data.consistencyIssues,
    writingSuggestions: data.writingSuggestions,
    citationGaps: data.citationGaps,
    similaritySources: [],
    overallSimilarityPercent: 0,
    noveltyPoints: data.noveltyPoints,
    selfSimilarityMatches: data.selfSimilarityMatches,
    versions: [
      {
        id: 'v1',
        label: 'Draft 1',
        uploadedAt: new Date().toISOString(),
        consistencyOpenCount: data.consistencyIssues.filter((i) => i.status === 'open').length,
        writingAcceptedCount: 0,
        note: 'Initial upload',
      },
    ],
    suggestedQuestions:
      data.suggestedQuestions.length > 0
        ? data.suggestedQuestions
        : ['Summarize what this paper argues in plain language.', 'What would a viva panel most likely challenge?'],
    fullText: extracted.fullText,
    fileSizeBytes: file.size,
  }
}
