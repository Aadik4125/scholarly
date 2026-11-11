// Finds a passage inside a larger text even when spacing, line breaks, hyphenation or
// punctuation differ: both are compared on letters and digits only. A passage that isn't found
// whole is searched for in overlapping 5-word pieces, so text that was split up (a sentence
// running across a page break, or older extractions that mixed two columns) is still marked.

export interface Normalized {
  /** Lower-case letters and digits only. */
  norm: string
  /** For each character of `norm`, its index in the original text. */
  map: number[]
}

export function normalize(text: string): Normalized {
  let norm = ''
  const map: number[] = []
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (/[\p{L}\p{N}]/u.test(c)) {
      norm += c.toLowerCase()
      map.push(i)
    }
  }
  return { norm, map }
}

const PIECE_WORDS = 5
const MIN_PIECE_CHARS = 18

/** Ranges [start, end) in `hay.norm` where `needle` occurs, whole or in pieces. */
export function findInNormalized(hay: Normalized, needle: string): Array<[number, number]> {
  const whole = normalize(needle).norm
  if (whole.length < MIN_PIECE_CHARS) return []
  const at = hay.norm.indexOf(whole)
  if (at >= 0) return [[at, at + whole.length]]

  const words = needle.split(/\s+/).filter((w) => normalize(w).norm.length > 0)
  const ranges: Array<[number, number]> = []
  for (let i = 0; i + PIECE_WORDS <= words.length; i++) {
    const piece = normalize(words.slice(i, i + PIECE_WORDS).join(' ')).norm
    if (piece.length < MIN_PIECE_CHARS) continue
    const p = hay.norm.indexOf(piece)
    // A piece that occurs more than once is ambiguous; skip it rather than mark the wrong place.
    if (p >= 0 && hay.norm.indexOf(piece, p + 1) < 0) ranges.push([p, p + piece.length])
  }
  return mergeRanges(ranges)
}

export function mergeRanges(ranges: Array<[number, number]>): Array<[number, number]> {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0])
  const out: Array<[number, number]> = []
  for (const r of sorted) {
    const last = out[out.length - 1]
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1])
    else out.push([r[0], r[1]])
  }
  return out
}

/** Ranges [start, end) in the original `text` where `needle` occurs. */
export function findInText(text: string, needle: string): Array<[number, number]> {
  const hay = normalize(text)
  return findInNormalized(hay, needle).map(([s, e]) => [hay.map[s], hay.map[e - 1] + 1])
}
