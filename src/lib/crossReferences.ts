// Cross-reference check: do the figures, tables and citations a paper mentions actually exist?
// Runs on the extracted text in the browser — no AI involved, so the same paper always gives
// the same result. Each rule only fires when the paper gives enough to go on (captions found,
// a numbered reference list found), so a messy extraction stays quiet instead of guessing.

export type CrossRefKind = 'figure' | 'table' | 'citation' | 'reference'

export interface CrossRefIssue {
  id: string
  kind: CrossRefKind
  severity: 'medium' | 'low'
  title: string
  detail: string
}

export interface CrossRefReport {
  /** What the check found to compare, so a clean result can say what it covered. */
  counts: { figures: number; tables: number; citations: number; references: number }
  issues: CrossRefIssue[]
}

const REF_WORDS = String.raw`(references|bibliography|works cited|literature cited|reference list)`
const REF_HEADING = new RegExp(String.raw`^\s*(?:[ivx]+\.|\d+\.?)?\s*${REF_WORDS}\s*:?\s*$`, 'i')
// Two-column PDFs put the heading on the same line as the other column's text: "References [28]
// G. Montúfar, ..." or "References Kevin Clark, Minh-Thang Luong, ...".
const REF_HEADING_INLINE = new RegExp(String.raw`^\s*(?:[ivx]+\.|\d+\.?)?\s*${REF_WORDS}\s+(?:\[\d|[A-Z][\p{L}'’-]+,?\s+[A-Z])`, 'iu')

/** Small-caps headings often extract letter-spaced: "R EFERENCES" -> "REFERENCES". */
const unspace = (line: string) => (line.length <= 40 && line === line.toUpperCase() ? line.replace(/(?<=\b[A-Z])\s(?=[A-Z])/g, '') : line)

/** Splits the text at the reference list: the last "References" heading wins, since a table of
 *  contents can mention it earlier; inline headings only count in the second half of the paper.
 *  Everything after the heading is treated as the list. An appendix after it can't be cut off
 *  reliably (merged columns put stray "Appendix C." lines inside the list), and a list that
 *  runs long only makes the checks more lenient. */
function splitReferences(text: string): { body: string; refs: string } {
  const lines = text.split(/\r?\n/)
  let at = -1
  let inlineAt = -1
  lines.forEach((l, i) => {
    if (REF_HEADING.test(unspace(l))) at = i
    else if (i > lines.length / 2 && REF_HEADING_INLINE.test(l)) inlineAt = i
  })
  if (at < 0 && inlineAt < 0) return { body: text, refs: '' }
  const start = Math.max(at, inlineAt)
  // An inline heading's line already holds reference text after the heading word.
  const first = start === inlineAt ? [lines[start].replace(new RegExp(String.raw`^\s*(?:[ivx]+\.|\d+\.?)?\s*${REF_WORDS}\s+`, 'i'), '')] : []
  return { body: lines.slice(0, start).join('\n'), refs: [...first, ...lines.slice(start + 1)].join('\n') }
}

function romanToInt(s: string): number {
  const v: Record<string, number> = { I: 1, V: 5, X: 10, L: 50 }
  let n = 0
  for (let i = 0; i < s.length; i++) {
    const cur = v[s[i]]
    const next = v[s[i + 1]] ?? 0
    n += cur < next ? -cur : cur
  }
  return n
}

const toNum = (s: string) => (/^\d+$/.test(s) ? Number(s) : romanToInt(s.toUpperCase()))

/** "1, 3–5 and 7" -> [1, 3, 4, 5, 7]. Ranges are capped so a typo can't explode. */
function expandList(list: string): number[] {
  const out: number[] = []
  for (const part of list.split(/\s*(?:,|;|\band\b|&)\s*/)) {
    const range = part.match(/^([0-9]+|[IVXL]+)\s*(?:-|–|—|to)\s*([0-9]+|[IVXL]+)$/i)
    if (range) {
      const a = toNum(range[1])
      const b = toNum(range[2])
      if (b >= a && b - a <= 30) for (let k = a; k <= b; k++) out.push(k)
    } else if (/^([0-9]+|[IVXL]+)$/i.test(part.trim())) out.push(toNum(part.trim()))
  }
  return out
}

const NUM = String.raw`(?:\d+|[IVXL]+)`
const NUM_LIST = String.raw`${NUM}[a-z]?(?:\s*(?:,|and|&|-|–|—|to)\s*${NUM}[a-z]?)*`
const LABELS = {
  figure: String.raw`(?:Figures?|Figs?\.?|FIGURES?|FIGS?\.?)`,
  table: String.raw`(?:Tables?|TABLES?)`,
}

/** Caption lines: "Figure 3: ...", "Fig. 3. ...", "Table 2 – ...", or an IEEE-style "TABLE II"
 *  on a line of its own. */
function findCaptions(body: string, kind: 'figure' | 'table'): Set<number> {
  const found = new Set<number>()
  const re = new RegExp(String.raw`^\s*${LABELS[kind]}\s*(${NUM})(?:\s*[:.|–—-]\s*\S|\s*$)`)
  for (const line of body.split(/\r?\n/)) {
    const m = line.match(re)
    if (m) found.add(toNum(m[1]))
  }
  return found
}

/** Every "Figure 3", "Figs. 2–4", "Tables 1 and 2" in running text, excluding caption lines. */
function findMentions(body: string, kind: 'figure' | 'table'): Set<number> {
  const found = new Set<number>()
  const caption = new RegExp(String.raw`^\s*${LABELS[kind]}\s*${NUM}(?:\s*[:.|–—-]\s*\S|\s*$)`)
  const mention = new RegExp(String.raw`\b${LABELS[kind]}\s*(${NUM_LIST})\b`, 'g')
  for (const line of body.split(/\r?\n/)) {
    // A caption's own label isn't a mention; mentions later on the same line still count.
    const text = caption.test(line) ? line.replace(caption, '') : line
    for (const m of text.matchAll(mention)) for (const n of expandList(m[1].replace(/(\d)[a-z]/g, '$1'))) found.add(n)
  }
  return found
}

/** How many numbered entries the reference list has. "[12] Author..." entries can sit mid-line
 *  when two columns are merged, so they're collected anywhere and counted while 1, 2, 3, ...
 *  are all present. "12. Author..." entries must start a line and run in order, so wrapped lines
 *  that start with a year don't count. */
function numberedReferences(refs: string): number {
  const bracketed = new Set<number>()
  for (const m of refs.matchAll(/(?:^|\s)\[(\d{1,3})\]\s+\S/g)) bracketed.add(Number(m[1]))
  let fromBrackets = 0
  while (bracketed.has(fromBrackets + 1)) fromBrackets++

  let fromList = 0
  for (const line of refs.split(/\r?\n/)) {
    const m = line.match(/^\s*(\d{1,3})\.\s/)
    if (m && Number(m[1]) === fromList + 1) fromList++
  }
  return Math.max(fromBrackets, fromList)
}

const MAX_LISTED = 8
const listOf = (nums: number[], label: string) => {
  const shown = nums.slice(0, MAX_LISTED).map((n) => `${label}${n}`)
  return nums.length > MAX_LISTED ? `${shown.join(', ')} and ${nums.length - MAX_LISTED} more` : shown.join(', ')
}

const bracketList = (nums: number[]) => {
  const shown = nums.slice(0, MAX_LISTED).map((n) => `[${n}]`)
  return nums.length > MAX_LISTED ? `${shown.join(', ')} and ${nums.length - MAX_LISTED} more` : shown.join(', ')
}

const NOT_SURNAMES = new Set(
  'In On At For From And The This That These Those Table Figure Fig Section Chapter Equation Eq Appendix Version Windows Python Java Android Phase Step Stage Wave Year Since Until Between During After Before Model Group Study Data Dataset Experiment Round Level Grade Class Type Series January February March April May June July August September October November December'.split(' '),
)

export function checkCrossReferences(fullText: string): CrossRefReport {
  const { body, refs } = splitReferences(fullText)
  const issues: CrossRefIssue[] = []
  let nextId = 0
  const add = (issue: Omit<CrossRefIssue, 'id'>) => issues.push({ ...issue, id: `xref-${nextId++}` })

  const counts = { figures: 0, tables: 0, citations: 0, references: 0 }

  for (const kind of ['figure', 'table'] as const) {
    const Label = kind === 'figure' ? 'Figure' : 'Table'
    // The whole text, not just the body: merged two-column lines can carry body text into the
    // reference list, and a mention lost there would look like an unreferenced figure.
    const captions = findCaptions(fullText, kind)
    const mentions = findMentions(fullText, kind)
    counts[kind === 'figure' ? 'figures' : 'tables'] = mentions.size
    if (captions.size === 0) continue // captions weren't extracted (or there are none): can't compare
    const max = Math.max(...captions)
    const missing = [...mentions].filter((n) => !captions.has(n) && n > max).sort((a, b) => a - b)
    if (missing.length) {
      add({
        kind,
        severity: 'medium',
        title: `${listOf(missing, `${Label} `)} ${missing.length === 1 ? "is mentioned but doesn't exist" : "are mentioned but don't exist"}`,
        detail: `The text refers to ${listOf(missing, `${Label} `)}, but the last ${kind} in the paper is ${Label} ${max}. A ${kind} may have been removed or renumbered.`,
      })
    }
    const unmentioned = [...captions].filter((n) => !mentions.has(n)).sort((a, b) => a - b)
    if (unmentioned.length) {
      add({
        kind,
        severity: 'low',
        title: `${listOf(unmentioned, `${Label} `)} ${unmentioned.length === 1 ? 'is' : 'are'} never referred to in the text`,
        detail: `Every ${kind} should be introduced in the text (e.g. "as shown in ${Label} ${unmentioned[0]}") so readers know why it's there.`,
      })
    }
  }

  // Numbered citations: [3], [1, 4], [2-5]. Only checked against a numbered reference list.
  const refCount = numberedReferences(refs)
  if (refCount >= 3) counts.references = refCount
  if (refCount >= 3) {
    const cited = new Set<number>()
    let groups = 0
    // Citations anywhere, appendix included, minus the list's own "[12] Author" entry markers.
    const prose = fullText.replace(/(^|\s)\[\d{1,3}\](?=[ \t]+\p{Lu})/gmu, '$1')
    for (const m of prose.matchAll(/\[(\d{1,3}(?:\s*(?:,|;|-|–|—)\s*\d{1,3})*)\]/g)) {
      const nums = expandList(m[1])
      if (nums.includes(0)) continue // [0, 1] is an interval, not a citation
      // [256, 480] is a range of values, not citations: real slips land just past the list's end.
      if (nums.some((n) => n > refCount + Math.max(10, refCount / 2))) continue
      groups++
      for (const n of nums) cited.add(n)
    }
    counts.citations = groups
    if (groups >= 3) {
      const beyond = [...cited].filter((n) => n > refCount).sort((a, b) => a - b)
      if (beyond.length) {
        add({
          kind: 'citation',
          severity: 'medium',
          title: `${bracketList(beyond)} ${beyond.length === 1 ? 'is' : 'are'} cited, but the reference list ends at [${refCount}]`,
          detail: `These citation numbers have no matching entry in your reference list. A reference may be missing, or the list may need renumbering.`,
        })
      }
      const uncited: number[] = []
      for (let n = 1; n <= refCount; n++) if (!cited.has(n)) uncited.push(n)
      if (uncited.length) {
        add({
          kind: 'reference',
          severity: 'low',
          title: `${uncited.length} reference${uncited.length === 1 ? ' is' : 's are'} never cited`,
          detail: `${bracketList(uncited)} in your reference list ${uncited.length === 1 ? "isn't" : "aren't"} cited anywhere in the text. Cite ${uncited.length === 1 ? 'it' : 'them'} or remove ${uncited.length === 1 ? 'it' : 'them'}.`,
        })
      }
    }
  }

  // Author-year citations: (Smith, 2020), (Smith & Lee, 2019; Wu et al., 2021), Smith et al. (2020).
  // Only when there's an unnumbered reference list with years in it to check against.
  if (refCount < 3 && (refs.match(/\b(19|20)\d{2}\b/g) ?? []).length >= 3) {
    const refsNorm = refs.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    const pairs = new Map<string, { name: string; year: string }>()
    const name = String.raw`([A-Z][A-Za-z\u00C0-\u017F'’-]+)`
    const year = String.raw`((?:19|20)\d{2})[a-z]?`
    const inParens = new RegExp(String.raw`${name}(?:\s+(?:et\s+al\.?|(?:and|&)\s+[A-Z][A-Za-z\u00C0-\u017F'’-]+))?,?\s+${year}`, 'g')
    for (const group of body.matchAll(/\(([^()]{4,300})\)/g)) {
      for (const m of group[1].matchAll(inParens)) pairs.set(`${m[1]} ${m[2]}`, { name: m[1], year: m[2] })
    }
    const narrative = new RegExp(String.raw`\b${name}(?:\s+et\s+al\.?|\s+(?:and|&)\s+[A-Z][A-Za-z\u00C0-\u017F'’-]+)?\s+\(${year}\)`, 'g')
    for (const m of body.matchAll(narrative)) pairs.set(`${m[1]} ${m[2]}`, { name: m[1], year: m[2] })

    const real = [...pairs.values()].filter((p) => !NOT_SURNAMES.has(p.name) && p.name.length > 1)
    counts.citations = real.length
    const missing = real.filter((p) => {
      const surname = p.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      return !refsNorm.includes(surname) || !refsNorm.includes(p.year)
    })
    if (missing.length) {
      const shown = missing.slice(0, MAX_LISTED).map((p) => `${p.name} (${p.year})`)
      const more = missing.length > MAX_LISTED ? ` and ${missing.length - MAX_LISTED} more` : ''
      add({
        kind: 'citation',
        severity: 'medium',
        title: `${missing.length} citation${missing.length === 1 ? '' : 's'} not found in your reference list`,
        detail: `${shown.join(', ')}${more} ${missing.length === 1 ? 'is' : 'are'} cited in the text, but we couldn't find a matching name and year in your references. Check the spelling and year, or add the missing entry.`,
      })
    }
  }

  // Things to fix first, then style advice.
  issues.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'medium' ? -1 : 1))
  return { counts, issues }
}
