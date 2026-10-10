export type Severity = 'high' | 'medium' | 'low'

export type ConsistencyCategory =
  | 'methodology'
  | 'dataset'
  | 'numbers'
  | 'model'
  | 'abstract-vs-results'
  | 'other'

export interface EvidenceLocation {
  section: string
  quote: string
}

export interface ConsistencyIssue {
  id: string
  category: ConsistencyCategory
  severity: Severity
  title: string
  explanation: string
  locations: EvidenceLocation[]
  status: 'open' | 'resolved' | 'dismissed'
}

export interface WritingSuggestion {
  id: string
  section: string
  type: 'clarity' | 'concision' | 'tone'
  original: string
  suggested: string
  reason: string
  status: 'pending' | 'accepted' | 'rejected'
}

export interface SimilaritySource {
  id: string
  title: string
  authors: string
  matchPercent: number
  matchedExcerpt: string
}

export interface CitationGap {
  id: string
  section: string
  claim: string
}

export interface SelfSimilarityMatch {
  id: string
  sectionA: string
  excerptA: string
  sectionB: string
  excerptB: string
  similarityPercent: number
}

export interface NoveltyPoint {
  id: string
  type: 'distinctive' | 'overlap' | 'suggestion'
  text: string
  source?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  groundedIn?: string[]
}

export interface PaperVersion {
  id: string
  label: string
  uploadedAt: string
  consistencyOpenCount: number
  writingAcceptedCount: number
  note: string
}

export interface PaperSection {
  id: string
  heading: string
  excerpt: string
}

export interface Paper {
  id: string
  title: string
  fileName: string
  uploadedAt: string
  pageCount: number
  wordCount: number
  sections: PaperSection[]
  consistencyIssues: ConsistencyIssue[]
  writingSuggestions: WritingSuggestion[]
  similaritySources: SimilaritySource[]
  overallSimilarityPercent: number
  citationGaps: CitationGap[]
  noveltyPoints: NoveltyPoint[]
  versions: PaperVersion[]
  suggestedQuestions: string[]
  /** 'demo' = the curated sample paper's rich mock data. 'heuristic' = a real uploaded file
   *  analyzed client-side by pattern-matching (legacy, no LLM). 'ai' = analyzed by the real
   *  backend using Claude (and OpenAI embeddings for internal self-similarity). */
  analysisMode: 'demo' | 'heuristic' | 'ai'
  /** Full extracted plain text, kept for grounding in Ask My Paper. Absent for the demo paper.
   *  Immutable — always the original extraction, even after edits are applied. */
  fullText?: string
  /** The current working text: starts equal to fullText, then gets a find-and-replace applied
   *  each time a writing suggestion is accepted. This is what "Save new version" snapshots.
   *  'ai' mode only — accepting a suggestion in demo/heuristic mode stays cosmetic. */
  editedText?: string
  fileSizeBytes?: number
  /** Near-duplicate passages found within the document itself, via embeddings. 'ai' mode only. */
  selfSimilarityMatches?: SelfSimilarityMatch[]
  /** True once the CORE.ac.uk external-corpus check actually ran (vs. not configured at all).
   *  Distinguishes "checked, found nothing" from "no provider connected". 'ai' mode only. */
  similarityCorpusChecked?: boolean
}
