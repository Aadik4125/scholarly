import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export interface ExtractedSection {
  heading: string
  text: string
}

export interface ExtractedDocument {
  fullText: string
  pageCount: number | null
  sections: ExtractedSection[]
}

const SECTION_KEYWORDS = [
  'abstract',
  'introduction',
  'background',
  'related work',
  'literature review',
  'methodology',
  'materials and methods',
  'method',
  'approach',
  'experimental setup',
  'experiments',
  'results',
  'findings',
  'evaluation',
  'discussion',
  'analysis',
  'conclusion',
  'conclusions',
  'future work',
  'limitations',
  'acknowledgment',
  'acknowledgement',
  'references',
  'bibliography',
  'appendix',
]

const HEADING_LINE = /^\s*(?:[ivxlcdm]+\.|\d+(?:\.\d+)*\.?)?\s*([a-z][a-z\s/&-]{2,45})\s*$/i

function looksLikeHeading(line: string): string | null {
  const trimmed = line.trim()
  if (trimmed.length < 3 || trimmed.length > 60) return null
  const match = trimmed.match(HEADING_LINE)
  if (!match) return null
  const words = match[1].toLowerCase().trim()
  const isKnown = SECTION_KEYWORDS.some((kw) => words.includes(kw))
  if (!isKnown) return null
  // match[1] is already just the heading word(s), with any real numbering prefix
  // (matched structurally by HEADING_LINE, e.g. "I." or "3.2") excluded.
  return match[1].trim()
}

function buildSectionsFromLines(lines: string[]): ExtractedSection[] {
  const sections: ExtractedSection[] = []
  let currentHeading = 'Start of document'
  let buffer: string[] = []

  const flush = () => {
    const text = buffer.join(' ').replace(/\s+/g, ' ').trim()
    if (text) sections.push({ heading: currentHeading, text })
    buffer = []
  }

  for (const rawLine of lines) {
    const heading = looksLikeHeading(rawLine)
    if (heading) {
      flush()
      currentHeading = heading.charAt(0).toUpperCase() + heading.slice(1)
    } else if (rawLine.trim()) {
      buffer.push(rawLine.trim())
    }
  }
  flush()

  return sections
}

async function extractFromPdf(file: File): Promise<ExtractedDocument> {
  const buffer = await file.arrayBuffer()
  const doc = await pdfjsLib.getDocument({ data: buffer }).promise
  const allLines: string[] = []
  const pageTexts: string[] = []

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()

    const rows = new Map<number, { x: number; str: string }[]>()
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue
      const transform = item.transform as number[]
      const y = Math.round(transform[5] / 3) * 3
      const x = transform[4]
      if (!rows.has(y)) rows.set(y, [])
      rows.get(y)!.push({ x, str: item.str })
    }

    const sortedY = Array.from(rows.keys()).sort((a, b) => b - a)
    const pageLineTexts: string[] = []
    for (const y of sortedY) {
      const line = rows
        .get(y)!
        .sort((a, b) => a.x - b.x)
        .map((r) => r.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (line) {
        allLines.push(line)
        pageLineTexts.push(line)
      }
    }
    pageTexts.push(pageLineTexts.join('\n'))
  }

  const fullText = pageTexts.join('\n\n')
  const sections = buildSectionsFromLines(allLines)
  return { fullText, pageCount: doc.numPages, sections }
}

async function extractFromDocx(file: File): Promise<ExtractedDocument> {
  const mammoth = await import('mammoth')
  const buffer = await file.arrayBuffer()
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer: buffer })

  const parser = new DOMParser()
  const docEl = parser.parseFromString(html, 'text/html')
  const sections: ExtractedSection[] = []
  let currentHeading = 'Start of document'
  let paragraphBuffer: string[] = []

  const flush = () => {
    const text = paragraphBuffer.join(' ').replace(/\s+/g, ' ').trim()
    if (text) sections.push({ heading: currentHeading, text })
    paragraphBuffer = []
  }

  for (const node of Array.from(docEl.body.children)) {
    const tag = node.tagName.toLowerCase()
    const text = node.textContent || ''
    if (/^h[1-3]$/.test(tag)) {
      flush()
      currentHeading = text.trim() || currentHeading
    } else if (text.trim()) {
      paragraphBuffer.push(text.trim())
    }
  }
  flush()

  const fullText = docEl.body.textContent || ''
  const wordCount = fullText.trim().split(/\s+/).filter(Boolean).length
  const pageCount = Math.max(1, Math.round(wordCount / 500))

  // No heading styles found at all — fall back to keyword-based line splitting on raw text.
  const finalSections = sections.length > 1 ? sections : buildSectionsFromLines(fullText.split(/\n+/))

  return { fullText, pageCount, sections: finalSections }
}

export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
}

export function isDocxFile(file: File): boolean {
  return (
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    /\.docx?$/i.test(file.name)
  )
}

export async function extractDocument(file: File): Promise<ExtractedDocument> {
  if (isPdfFile(file)) return extractFromPdf(file)
  if (isDocxFile(file)) return extractFromDocx(file)
  const text = await file.text()
  return { fullText: text, pageCount: null, sections: buildSectionsFromLines(text.split(/\n+/)) }
}
