// Draws the report's highlights onto the user's own PDF, so they see their paper exactly as they
// wrote it: AI-flagged sentences in yellow/pink, passages matching a published source in blue
// with the source's number in the margin. Runs in the browser on the file saved for the paper.
import { readingOrder, type PageItem } from './pdfLayout'
import { findInNormalized, mergeRanges } from './textMatch'

export interface Mark {
  text: string
  /** RGB, 0-1. */
  color: [number, number, number]
  /** Margin label, e.g. "1" for source [1]. */
  label?: string
}

interface Located {
  page: number
  item: PageItem
}

/** Highlights `marks` on a copy of `pdfBytes` and returns the new PDF, plus how many were found. */
export async function annotatePdf(pdfBytes: ArrayBuffer, marks: Mark[]): Promise<{ bytes: Uint8Array; found: number }> {
  const [{ pdfjsLib }, { PDFDocument, rgb, BlendMode, StandardFonts }] = await Promise.all([import('./textExtraction'), import('pdf-lib')])

  // 1. Every letter and digit of the paper, in reading order, with the text piece it came from.
  const pdf = await pdfjsLib.getDocument({ data: pdfBytes.slice(0) }).promise
  let norm = ''
  const owner: Array<{ loc: Located; offset: number }> = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    const items: PageItem[] = []
    for (const it of content.items) {
      if (!('str' in it) || !it.str.trim()) continue
      const t = it.transform as number[]
      items.push({ str: it.str, x: t[4], y: t[5], width: it.width, height: Math.hypot(t[2], t[3]), rotated: t[1] !== 0 || t[2] !== 0 })
    }
    for (const line of readingOrder(items, page.getViewport({ scale: 1 }).width)) {
      for (const item of line) {
        if (item.rotated) continue
        for (let k = 0; k < item.str.length; k++) {
          const c = item.str[k]
          if (/[\p{L}\p{N}]/u.test(c)) {
            norm += c.toLowerCase()
            owner.push({ loc: { page: p - 1, item }, offset: k })
          }
        }
      }
    }
  }
  const hay = { norm, map: owner.map((_, i) => i) }

  // 2. Draw each found range as boxes over the text pieces it covers.
  const out = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
  const pages = out.getPages()
  const font = await out.embedFont(StandardFonts.HelveticaBold)
  let found = 0
  for (const mark of marks) {
    const ranges = mergeRanges(findInNormalized(hay, mark.text))
    if (!ranges.length) continue
    found++
    let labelled = false
    for (const [s, e] of ranges) {
      // Group the covered characters by text piece: one box per piece.
      const spans = new Map<PageItem, { page: number; from: number; to: number }>()
      for (let i = s; i < e; i++) {
        const { loc, offset } = owner[i]
        const span = spans.get(loc.item)
        if (span) span.to = offset + 1
        else spans.set(loc.item, { page: loc.page, from: offset, to: offset + 1 })
      }
      for (const [item, { page, from, to }] of spans) {
        const target = pages[page]
        if (!target) continue
        const perChar = item.width / Math.max(1, item.str.length)
        const h = item.height || 10
        const color = rgb(...mark.color)
        target.drawRectangle({
          // A little wider than the text, so neighbouring words join into one highlight.
          x: item.x + from * perChar - 1.5,
          y: item.y - h * 0.22,
          width: Math.max(1, (to - from) * perChar) + 3,
          height: h * 1.12,
          color,
          opacity: 0.45,
          blendMode: BlendMode.Multiply,
        })
        if (mark.label && !labelled) {
          labelled = true
          // Source number in the page margin beside the passage, on the side of its column.
          const pageWidth = target.getWidth()
          const tag = `[${mark.label}]`
          const size = 7
          const tagWidth = font.widthOfTextAtSize(tag, size) + 4
          const x = item.x < pageWidth / 2 ? 10 : pageWidth - tagWidth - 10
          target.drawRectangle({ x, y: item.y - 1, width: tagWidth, height: size + 3, color: rgb(0.18, 0.36, 0.83) })
          target.drawText(tag, { x: x + 2, y: item.y + 0.5, size, font, color: rgb(1, 1, 1) })
        }
      }
    }
  }
  return { bytes: await out.save(), found }
}
