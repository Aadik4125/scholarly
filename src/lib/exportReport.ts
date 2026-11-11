// Integrity report (similarity + AI content) as a PDF, built entirely in the browser from the
// results already saved for this paper: no API calls, and nothing is sent anywhere. pdfmake and
// its fonts (~1 MB gzipped) are imported only when someone clicks Download.
import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces'
import type { AiContentSection, Paper } from '../types'
import { aiVerdict, LIKELY_AI, VERDICT_TEXT } from './aiVerdict'
import { checkCrossReferences } from './crossReferences'

const C = {
  ink: '#16202e',
  ink2: '#3c4a5c',
  muted: '#6b7889',
  line: '#d9dee6',
  panel: '#f4f6f9',
  likely: '#fbe7a1', // 50-80%: matches the site's yellow
  veryLikely: '#f6c1c7', // 80%+: matches the site's pink
  copied: '#f6c1c7',
  reworded: '#cfe2fb',
  good: '#1f7a4d',
  warn: '#9a5b00',
  bad: '#b3261e',
}
const VERY_LIKELY_AI = 0.8

export interface ReportMeta {
  reportId: string
  generatedAt: Date
  /** SHA-256 of the extracted text, so a reader can confirm the report matches a file. */
  fingerprint: string | null
}

const fmtDate = (d: Date | string) =>
  new Date(d).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

const pct = (n: number) => `${Math.round(n * 10) / 10}%`
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** Section text split into runs, with each flagged sentence shaded by how likely it is AI. */
function highlightedRuns(section: AiContentSection): Content[] {
  const runs: Content[] = []
  let at = 0
  for (const s of [...section.sentences].sort((a, b) => a.start - b.start)) {
    if (s.start < at) continue
    if (s.start > at) runs.push({ text: section.text.slice(at, s.start) })
    const text = section.text.slice(s.start, s.end)
    if (s.score >= VERY_LIKELY_AI) runs.push({ text, background: C.veryLikely })
    else if (s.score >= LIKELY_AI) runs.push({ text, background: C.likely })
    else runs.push({ text })
    at = s.end
  }
  if (at < section.text.length) runs.push({ text: section.text.slice(at) })
  return runs
}

function statBox(label: string, value: string, note: string, color: string): Content {
  return {
    table: {
      widths: ['*'],
      body: [
        [
          {
            stack: [
              { text: label.toUpperCase(), style: 'label' },
              { text: value, fontSize: 20, bold: true, color, margin: [0, 4, 0, 2] },
              { text: note, fontSize: 9, color: C.ink2 },
            ],
            margin: [10, 8, 10, 10],
          },
        ],
      ],
    },
    layout: { hLineColor: () => C.line, vLineColor: () => C.line, fillColor: () => C.panel },
  }
}

function heading(text: string, pageBreak = false): Content {
  return { text, style: 'h2', pageBreak: pageBreak ? 'before' : undefined }
}

export function buildReportDefinition(paper: Paper, meta: ReportMeta): TDocumentDefinitions {
  const isDemo = paper.analysisMode === 'demo'
  const corpusChecked = isDemo || (paper.analysisMode === 'ai' && paper.similarityCorpusChecked === true)
  const sources = paper.similaritySources ?? []
  const ai = paper.aiContent
  const aiChecked = Boolean(ai?.checked)
  const verdict = aiChecked && ai ? aiVerdict(ai.sections) : null
  const sentences = ai?.sections.flatMap((s) => s.sentences) ?? []
  const flagged = sentences.filter((s) => s.score >= LIKELY_AI).length
  const crossRefs = paper.fullText ? checkCrossReferences(paper.fullText) : null

  // ---- Plain-language summary, from fixed templates so the same results always read the same.
  const summary: string[] = []
  if (!corpusChecked) summary.push('The similarity check did not run for this paper, so no similarity score is given.')
  else if (sources.length === 0)
    summary.push(
      'No matching published sources were found. A new or unpublished paper is expected to score 0%; this does not cover websites or other students’ work.',
    )
  else {
    const b = paper.similarityBreakdown
    summary.push(
      `${pct(paper.overallSimilarityPercent)} of the checked text matches published work${
        b ? ` (${pct(b.copiedPercent)} word for word, ${pct(b.rewordedPercent)} reworded)` : ''
      }, across ${plural(sources.length, 'source')}.`,
    )
  }
  if (!aiChecked) summary.push('The AI-content check did not run for this paper.')
  else if (verdict) {
    const strongest = verdict.passages[0]
    summary.push(
      `${VERDICT_TEXT[verdict.level].title}: ${flagged} of ${sentences.length} sentences were flagged${
        strongest ? `, most strongly in "${strongest.heading}"` : ''
      }.`,
    )
  }
  if (paper.citationGaps.length) summary.push(`${plural(paper.citationGaps.length, 'claim')} may need a citation.`)
  const xrefFix = crossRefs?.issues.filter((i) => i.severity === 'medium').length ?? 0
  if (xrefFix) summary.push(`${plural(xrefFix, 'cross-reference problem')} found (missing figures, tables or references).`)

  const verdictColor = verdict?.level === 'likely' ? C.bad : verdict?.level === 'some' ? C.warn : C.good
  const content: Content[] = []

  // ---- Page 1: header and summary
  content.push(
    {
      columns: [
        { text: 'SCHOLARLY', style: 'brand' },
        { text: 'Integrity report', alignment: 'right', fontSize: 10, color: C.muted, margin: [0, 6, 0, 0] },
      ],
    },
    { canvas: [{ type: 'line', x1: 0, y1: 4, x2: 515, y2: 4, lineWidth: 1, lineColor: C.ink }], margin: [0, 0, 0, 12] },
    { text: paper.title, style: 'title' },
    {
      table: {
        widths: [110, '*'],
        body: [
          ['File', paper.fileName],
          ['Length', `${paper.wordCount.toLocaleString()} words · ${plural(paper.pageCount, 'page')}`],
          ['Analysed', fmtDate(paper.uploadedAt)],
          ['Report generated', fmtDate(meta.generatedAt)],
          ['Report ID', meta.reportId],
          ...(meta.fingerprint ? [['Document fingerprint', { text: meta.fingerprint, font: 'Roboto', fontSize: 8 }]] : []),
          ...(ai?.modelVersion ? [['AI detector', ai.modelVersion]] : []),
        ].map(([k, v]) => [{ text: k, color: C.muted }, v]),
      },
      layout: 'noBorders',
      fontSize: 9,
      margin: [0, 6, 0, 14],
    },
  )
  if (isDemo)
    content.push({
      text: 'Sample paper: these results are demo data, not an analysis of a real upload.',
      color: C.warn,
      bold: true,
      fontSize: 10,
      margin: [0, 0, 0, 10],
    })
  content.push(
    {
      columns: [
        statBox(
          'Similarity',
          corpusChecked ? pct(paper.overallSimilarityPercent) : 'Not run',
          corpusChecked ? `${plural(sources.length, 'matched source')}` : 'No score calculated',
          C.ink,
        ),
        statBox(
          'AI content',
          verdict ? VERDICT_TEXT[verdict.level].short : 'Not run',
          aiChecked ? `${flagged} of ${sentences.length} sentences flagged` : 'Upload a paper to run it',
          verdict ? verdictColor : C.ink,
        ),
      ],
      columnGap: 12,
      margin: [0, 0, 0, 14],
    },
    heading('Summary'),
    { ul: summary, fontSize: 10, color: C.ink2, margin: [0, 0, 0, 10] },
  )
  const stats = paper.similarityStats
  if (stats)
    content.push(
      heading('What the similarity check covered'),
      {
        text: `${plural(stats.passagesChecked, 'passage')} of your paper were searched against 250M+ research papers in OpenAlex and CORE. ${plural(
          stats.papersFound,
          'related paper',
        )} came up, and the full text of ${plural(stats.fullTextsCompared.length, 'open-access paper')} was compared. ${plural(
          stats.rewordingReviewed,
          'possible rewording',
        )} were reviewed by AI reading both passages side by side.`,
        fontSize: 10,
        color: C.ink2,
      },
    )
  content.push(
    heading('How to read this report'),
    {
      ul: [
        'Similarity: word-for-word matches are measured from shared 5-word sequences; reworded matches are confirmed by AI comparing both passages. Reference lists are not counted. Websites and other students’ work are not searched.',
        'AI content: the detector scores each sentence. For papers, the verdict looks at passages where most sentences are flagged; for short texts (up to 40 sentences), at the share of flagged sentences. It is a statistical estimate, not proof of how the text was written.',
        'Detectors can flag human writing, especially formal, formulaic passages and text by non-native English writers. Review the highlighted passages rather than relying on a single number.',
      ],
      fontSize: 9,
      color: C.ink2,
    },
  )
  if (paper.similarityWarning)
    content.push({ text: `Note: ${paper.similarityWarning}`, fontSize: 9, color: C.warn, margin: [0, 8, 0, 0] })
  if (ai?.warning) content.push({ text: `Note: ${ai.warning}`, fontSize: 9, color: C.warn, margin: [0, 4, 0, 0] })

  // ---- Matched sources
  content.push(heading('Matched sources', true))
  if (!corpusChecked) content.push({ text: 'The similarity check did not run for this paper.', style: 'empty' })
  else if (sources.length === 0) content.push({ text: 'No matching published sources were found.', style: 'empty' })
  else {
    content.push({
      table: {
        headerRows: 1,
        widths: [16, '*', 70, 44],
        body: [
          ['#', 'Source', 'Match', '%'].map((h): TableCell => ({ text: h, style: 'th' })),
          ...sources.map((s, i): TableCell[] => [
            String(i + 1),
            { stack: [{ text: s.title, bold: true }, { text: s.authors, color: C.muted, fontSize: 8 }] },
            {
              text: s.matchType === 'semantic' ? 'Reworded' : 'Word for word',
              background: s.matchType === 'semantic' ? C.reworded : C.copied,
            },
            { text: pct(s.matchPercent), alignment: 'right' as const },
          ]),
        ],
      },
      layout: { hLineColor: () => C.line, vLineColor: () => C.line, hLineWidth: (i) => (i === 1 ? 1 : 0.5), vLineWidth: () => 0, paddingTop: () => 5, paddingBottom: () => 5 },
      fontSize: 9,
      margin: [0, 0, 0, 14],
    })
    sources.forEach((s, i) => {
      content.push({
        unbreakable: true,
        stack: [
          { text: `${i + 1}. ${s.title}`, bold: true, fontSize: 10, margin: [0, 6, 0, 4] },
          {
            columns: [
              { stack: [{ text: 'YOUR PAPER', style: 'label' }, { text: s.matchedExcerpt, italics: true, fontSize: 9, color: C.ink2 }] },
              s.sourceExcerpt
                ? { stack: [{ text: 'SOURCE', style: 'label' }, { text: s.sourceExcerpt, italics: true, fontSize: 9, color: C.ink2 }] }
                : { text: '' },
            ],
            columnGap: 14,
          },
        ],
      })
    })
  }

  // ---- AI content, flagged sections with highlighted sentences
  content.push(heading('AI content by section', true))
  if (!aiChecked || !ai) content.push({ text: 'The AI-content check did not run for this paper.', style: 'empty' })
  else {
    content.push({
      columns: [
        { width: 'auto', canvas: [{ type: 'rect', x: 0, y: 2, w: 10, h: 8, color: C.likely }] },
        { width: 'auto', text: `Likely AI (${LIKELY_AI * 100}–${VERY_LIKELY_AI * 100}%)`, margin: [4, 0, 14, 0] },
        { width: 'auto', canvas: [{ type: 'rect', x: 0, y: 2, w: 10, h: 8, color: C.veryLikely }] },
        { width: 'auto', text: `Very likely AI (${VERY_LIKELY_AI * 100}%+)`, margin: [4, 0, 0, 0] },
      ],
      fontSize: 9,
      color: C.ink2,
      margin: [0, 0, 0, 10],
    })
    const flaggedSections = ai.sections.filter((s) => s.sentences.some((x) => x.score >= LIKELY_AI))
    if (flaggedSections.length === 0) content.push({ text: 'No passages were flagged as likely AI-generated.', style: 'empty' })
    for (const section of flaggedSections) {
      const n = section.sentences.filter((x) => x.score >= LIKELY_AI).length
      content.push(
        {
          columns: [
            { text: section.heading, bold: true, fontSize: 10 },
            { text: `${n} of ${section.sentences.length} sentences flagged`, alignment: 'right', fontSize: 9, color: C.muted },
          ],
          margin: [0, 8, 0, 4],
        },
        { text: highlightedRuns(section), fontSize: 9.5, lineHeight: 1.35, color: C.ink },
      )
    }
    const clean = ai.sections.length - flaggedSections.length
    if (clean > 0 && flaggedSections.length > 0)
      content.push({ text: `${plural(clean, 'other section')} had no flagged sentences.`, style: 'empty', margin: [0, 10, 0, 0] })
  }

  // ---- Citations and cross-references
  const hasCitationContent = paper.citationGaps.length > 0 || (crossRefs && crossRefs.issues.length > 0)
  if (hasCitationContent) {
    content.push(heading('Citations and cross-references', true))
    if (paper.citationGaps.length)
      content.push(
        { text: 'Claims that may need a citation', bold: true, fontSize: 10, margin: [0, 0, 0, 4] },
        {
          ul: paper.citationGaps.map((g) => ({ text: [{ text: `${g.section}: `, color: C.muted }, g.claim] })),
          fontSize: 9,
          color: C.ink2,
          margin: [0, 0, 0, 12],
        },
      )
    if (crossRefs?.issues.length)
      content.push(
        { text: 'Cross-references', bold: true, fontSize: 10, margin: [0, 0, 0, 4] },
        {
          ul: crossRefs.issues.map((i) => ({ text: [{ text: `${i.title}. `, bold: true }, i.detail] })),
          fontSize: 9,
          color: C.ink2,
        },
      )
  }

  return {
    pageSize: 'A4',
    pageMargins: [40, 48, 40, 52],
    info: { title: `Scholarly integrity report – ${paper.title}`, creator: 'Scholarly (scholar.click)', subject: meta.reportId },
    defaultStyle: { font: 'Roboto', fontSize: 10, color: C.ink, lineHeight: 1.25 },
    styles: {
      brand: { fontSize: 16, bold: true, characterSpacing: 1.5 },
      title: { fontSize: 18, bold: true, margin: [0, 2, 0, 4] },
      h2: { fontSize: 13, bold: true, margin: [0, 12, 0, 6] },
      label: { fontSize: 7.5, bold: true, color: C.muted, characterSpacing: 0.6, margin: [0, 0, 0, 2] },
      th: { bold: true, fontSize: 8, color: C.muted },
      empty: { fontSize: 10, color: C.muted, italics: true },
    },
    footer: (page, pages) => ({
      columns: [
        { text: `Scholarly · scholar.click · Report ${meta.reportId}`, color: C.muted },
        { text: `Page ${page} of ${pages}`, alignment: 'right', color: C.muted },
      ],
      fontSize: 8,
      margin: [40, 16, 40, 0],
    }),
    content,
  }
}

async function sha256(text: string): Promise<string | null> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
    return hex.match(/.{8}/g)!.join(' ')
  } catch {
    return null // crypto.subtle needs a secure context; the report still works without it
  }
}

function newReportId(date: Date): string {
  const day = date.toISOString().slice(0, 10).replace(/-/g, '')
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(3)), (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()
  return `SCH-${day}-${rand}`
}

export async function downloadIntegrityReport(paper: Paper): Promise<void> {
  const [pdfMakeModule, fontsModule] = await Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts')])
  const pdfMake = ((pdfMakeModule as unknown as { default?: typeof pdfMakeModule }).default ?? pdfMakeModule) as typeof pdfMakeModule
  const fonts = (fontsModule as { default?: unknown }).default ?? fontsModule
  ;(pdfMake as unknown as { vfs: unknown }).vfs = (fonts as { pdfMake?: { vfs: unknown } }).pdfMake?.vfs ?? fonts

  const generatedAt = new Date()
  const meta: ReportMeta = {
    reportId: newReportId(generatedAt),
    generatedAt,
    fingerprint: paper.fullText ? await sha256(paper.fullText) : null,
  }
  const name = paper.title.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '').slice(0, 60) || 'paper'
  pdfMake.createPdf(buildReportDefinition(paper, meta)).download(`${name}_Scholarly_report.pdf`)
}
