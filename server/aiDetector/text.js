// Exact port of detector/src/detector/features/text.py — the shared text spec between training
// (Python) and inference (here). Change both together and regenerate the parity fixtures.

export const WINDOW_SIZE = 3

// Explicit whitespace set (code points), identical to WS_CODEPOINTS in text.py.
const WS_CODEPOINTS = [0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x1c, 0x1d, 0x1e, 0x1f, 0x20, 0x85, 0xa0, 0x1680,
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a,
  0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff]
const WS = new RegExp('[' + String.fromCharCode(...WS_CODEPOINTS) + ']+', 'g')
const SENT_BREAK = /(?<=[.!?]) /g
const WORD = /[a-z0-9]+(?:'[a-z]+)?/g

export function normalize(text) {
  return text
    .normalize('NFKC')
    .replace(/’/g, "'")
    .replace(/‘/g, "'")
    .replace(/“/g, '"')
    .replace(/”/g, '"')
    .replace(WS, ' ')
    .trim()
}

/** [start, end) offsets of each sentence. Expects text whose whitespace is single spaces. */
export function sentenceSpans(text) {
  const spans = []
  let pos = 0
  for (const m of text.matchAll(SENT_BREAK)) {
    if (m.index > pos) spans.push([pos, m.index])
    pos = m.index + m[0].length
  }
  if (pos < text.length) spans.push([pos, text.length])
  return spans
}

/** Sentence-index ranges [i, j) of each scoring window. Short texts get a single window. */
/** [start, end) sentence ranges of `size` sentences, starting every `stride` sentences. A
 *  stride above 1 skips overlap to save work; a final window is added so the tail is covered. */
export function windows(nSentences, size = WINDOW_SIZE, stride = 1) {
  if (nSentences <= 0) return []
  if (nSentences <= size) return [[0, nSentences]]
  const out = []
  for (let i = 0; i + size <= nSentences; i += stride) out.push([i, i + size])
  if (out.at(-1)[1] < nSentences) out.push([nSentences - size, nSentences])
  return out
}

export function words(text) {
  return text.toLowerCase().match(WORD) ?? []
}

/** TF-IDF features: word 1-2 grams ("w:") and char 3-5 grams inside padded words ("c:"). */
export function analyzer(text) {
  const toks = words(text)
  const feats = toks.map((t) => 'w:' + t)
  for (let i = 0; i < toks.length - 1; i++) feats.push('w:' + toks[i] + ' ' + toks[i + 1])
  for (const t of toks) {
    const padded = ' ' + t + ' '
    for (const n of [3, 4, 5]) {
      if (padded.length < n) break
      for (let i = 0; i + n <= padded.length; i++) feats.push('c:' + padded.slice(i, i + n))
    }
  }
  return feats
}
