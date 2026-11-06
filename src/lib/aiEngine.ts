import { extractDocument } from './textExtraction'
import type { Paper, PaperSection } from '../types'
import { apiHeaders } from './apiHeaders'
import { markFreeAnalysisUsed } from './usage'

/** Thrown when the server requires an account before it will run another analysis. */
export class SignUpRequiredError extends Error {
  constructor(message = 'Sign in to keep analysing papers.') {
    super(message)
    this.name = 'SignUpRequiredError'
  }
}

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
  similarityCorpusChecked: boolean
  overallSimilarityPercent: number
  similaritySources: Paper['similaritySources']
  similarityWarning: string | null
  similarityBreakdown?: Paper['similarityBreakdown']
  similarityStats?: Paper['similarityStats']
  unavailableChecks?: string[]
  aiContent?: Paper['aiContent']
}

/** The server-side checks, in the order the upload page lists them. */
export const ANALYSIS_CHECKS = ['consistency', 'writing', 'similarity', 'repetition', 'aiContent'] as const
export type AnalysisCheck = (typeof ANALYSIS_CHECKS)[number]

export interface AnalysisProgress {
  /** The server's estimate of the total run time, from recent analyses; null until it arrives. */
  estimateSeconds: number | null
  /** Checks that have finished, with seconds since the request started. */
  done: Partial<Record<AnalysisCheck, number>>
}

type StreamEvent =
  | { type: 'start'; estimateSeconds: number }
  | { type: 'done'; check: AnalysisCheck; seconds: number }
  | { type: 'result'; data: AnalyzeResponse }
  | { type: 'error'; error: string }

/** Reads the server's line-by-line progress stream, reporting progress until the result arrives. */
async function readAnalysisStream(res: Response, onProgress?: (p: AnalysisProgress) => void): Promise<AnalyzeResponse> {
  if (!res.body || !(res.headers.get('content-type') || '').includes('ndjson')) return res.json()
  const progress: AnalysisProgress = { estimateSeconds: null, done: {} }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      const event = JSON.parse(line) as StreamEvent
      if (event.type === 'result') return event.data
      if (event.type === 'error') throw new Error(event.error)
      if (event.type === 'start') progress.estimateSeconds = event.estimateSeconds
      if (event.type === 'done') progress.done = { ...progress.done, [event.check]: event.seconds }
      onProgress?.({ ...progress })
    }
    if (done) throw new Error('The connection closed before the analysis finished. Please try again.')
  }
}

/** Real analysis pipeline: extracts text client-side, then sends it to the backend
 *  (/api/analyze) where Claude finds contradictions and novelty, Claude Haiku checks
 *  writing and citations, OpenAI embeddings flag internal near-duplicate passages, and
 *  (if CORE_API_KEY is configured) passages are checked against the CORE.ac.uk open-access
 *  research corpus for external similarity. */
export async function analyzePaperWithAI(
  file: File,
  onStage?: (stage: number) => void,
  onProgress?: (p: AnalysisProgress) => void,
): Promise<Paper> {
  onStage?.(0)
  const extracted = await extractDocument(file)

  onStage?.(1)
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: { ...(await apiHeaders()), Accept: 'application/x-ndjson' },
    body: JSON.stringify({ fileName: file.name, fullText: extracted.fullText, sections: extracted.sections }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    if (body.code === 'signup_required') throw new SignUpRequiredError(body.error)
    throw new Error(body.error || `Analysis request failed (${res.status})`)
  }
  const data = await readAnalysisStream(res, onProgress)
  markFreeAnalysisUsed()

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
    similaritySources: data.similaritySources ?? [],
    overallSimilarityPercent: data.overallSimilarityPercent ?? 0,
    noveltyPoints: data.noveltyPoints,
    selfSimilarityMatches: data.selfSimilarityMatches,
    similarityCorpusChecked: data.similarityCorpusChecked,
    similarityWarning: data.similarityWarning,
    similarityBreakdown: data.similarityBreakdown,
    similarityStats: data.similarityStats,
    aiContent: data.aiContent,
    unavailableChecks: data.unavailableChecks,
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
    editedText: extracted.fullText,
    fileSizeBytes: file.size,
  }
}
