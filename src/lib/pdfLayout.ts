// Puts the text pieces of one PDF page into lines in reading order.
//
// Grouping pieces by height alone joins the two columns of a two-column paper into one line
// ("...models unlabelled target text recover..."), which scrambles every sentence. So each page
// is checked for a column gutter: a vertical strip near the middle that most rows leave empty.
// When there is one, rows that cross it (title, author block, full-width figures) stay whole,
// and each run of rows between them is read left column first, then right column.

export interface PageItem {
  str: string
  /** Left edge, in PDF units. */
  x: number
  /** Baseline, in PDF units (larger = higher on the page). */
  y: number
  width: number
  height: number
  /** Rotated text (e.g. arXiv's margin stamp) is kept out of the layout and added at the end. */
  rotated?: boolean
}

interface Row {
  y: number
  items: PageItem[]
}

const ROW_SNAP = 3 // pieces whose baselines are within ~3pt share a row

function groupRows(items: PageItem[]): Row[] {
  const rows = new Map<number, PageItem[]>()
  for (const it of items) {
    if (!it.str.trim()) continue
    const y = Math.round(it.y / ROW_SNAP) * ROW_SNAP
    if (!rows.has(y)) rows.set(y, [])
    rows.get(y)!.push(it)
  }
  return [...rows.entries()].sort((a, b) => b[0] - a[0]).map(([y, its]) => ({ y, items: its.sort((a, b) => a.x - b.x) }))
}

const crosses = (i: PageItem, x: number) => i.x < x && i.x + i.width > x

/** x of the column gutter, or null for a single-column page. */
function findGutter(rows: Row[], pageWidth: number): number | null {
  if (rows.length < 8) return null
  let best: { x: number; covered: number } | null = null
  for (let x = pageWidth * 0.35; x <= pageWidth * 0.65; x += 2) {
    let covered = 0
    for (const r of rows) if (r.items.some((i) => crosses(i, x))) covered++
    if (!best || covered < best.covered) best = { x, covered }
  }
  if (!best) return null
  // Both columns need plenty of rows: a figure can leave one column without text for a while,
  // so rows aren't required to have text on both sides at once.
  const g = best.x
  const open = rows.filter((r) => !r.items.some((i) => crosses(i, g)))
  const leftRows = open.filter((r) => r.items.some((i) => i.x + i.width <= g)).length
  const rightRows = open.filter((r) => r.items.some((i) => i.x >= g)).length
  return best.covered <= rows.length * 0.15 && leftRows >= rows.length * 0.25 && rightRows >= rows.length * 0.25 ? g : null
}

/** The page's lines in reading order, each as its text pieces left to right. */
export function readingOrder(items: PageItem[], pageWidth: number): PageItem[][] {
  const rotated = items.filter((i) => i.rotated && i.str.trim()).map((i) => [i])
  const rows = groupRows(items.filter((i) => !i.rotated))
  const gutter = findGutter(rows, pageWidth)
  if (gutter === null) return [...rows.map((r) => r.items), ...rotated]

  const lines: PageItem[][] = []
  let left: PageItem[][] = []
  let right: PageItem[][] = []
  const flush = () => {
    lines.push(...left, ...right)
    left = []
    right = []
  }
  for (const r of rows) {
    if (r.items.some((i) => crosses(i, gutter))) {
      flush()
      lines.push(r.items)
      continue
    }
    const l = r.items.filter((i) => i.x + i.width <= gutter)
    const rt = r.items.filter((i) => i.x >= gutter)
    if (l.length) left.push(l)
    if (rt.length) right.push(rt)
  }
  flush()
  return [...lines, ...rotated]
}

export const lineText = (items: PageItem[]) =>
  items
    .map((i) => i.str)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()

export function pageLines(items: PageItem[], pageWidth: number): string[] {
  return readingOrder(items, pageWidth).map(lineText).filter(Boolean)
}
