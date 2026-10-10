import type { Paper } from '../types'

/** Regenerates the current (possibly edited) document text as a real .docx file — proper
 *  Word heading styles for recognized section headings, normal paragraphs otherwise. Doesn't
 *  attempt to reproduce the original's exact visual styling (fonts, tables, images) — that
 *  information was never kept past text extraction — but the structure (headings, paragraph
 *  breaks, section order) matches. Dynamically imported so the `docx` library only loads when
 *  someone actually clicks the download button. */
export async function exportPaperAsDocx(paper: Paper): Promise<void> {
  const text = paper.editedText ?? paper.fullText
  if (!text) return

  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx')
  const knownHeadings = new Set(paper.sections.map((s) => s.heading))

  const paragraphs = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) =>
      knownHeadings.has(block)
        ? new Paragraph({ text: block, heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 120 } })
        : new Paragraph({ children: [new TextRun(block)], spacing: { after: 200 } }),
    )

  const doc = new Document({
    title: paper.title,
    sections: [{ children: paragraphs }],
  })

  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${paper.title.replace(/\s+/g, '_')}_edited.docx`
  a.click()
  URL.revokeObjectURL(url)
}
