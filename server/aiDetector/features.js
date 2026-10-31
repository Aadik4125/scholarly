// Exact port of detector/src/detector/features/linguistic.py. Input is normalized text.
import { sentenceSpans, words } from './text.js'

export const FUNCTION_WORDS = [
  'the', 'of', 'and', 'to', 'a', 'in', 'is', 'that', 'for', 'it', 'as', 'with', 'be', 'on',
  'this', 'by', 'are', 'or', 'which', 'we', 'not', 'but', 'can', 'also', 'however', 'these',
]

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

function std(xs) {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length)
}

function repeatRate(toks, n) {
  const grams = []
  for (let i = 0; i + n <= toks.length; i++) grams.push(toks.slice(i, i + n).join(' '))
  return grams.length ? 1 - new Set(grams).size / grams.length : 0
}

function mattr(toks, w = 50) {
  if (toks.length <= w) return toks.length ? new Set(toks).size / toks.length : 0
  const counts = new Map()
  for (const t of toks.slice(0, w)) counts.set(t, (counts.get(t) ?? 0) + 1)
  let total = counts.size
  for (let i = w; i < toks.length; i++) {
    const out = toks[i - w]
    const inn = toks[i]
    const c = counts.get(out) - 1
    if (c === 0) counts.delete(out)
    else counts.set(out, c)
    counts.set(inn, (counts.get(inn) ?? 0) + 1)
    total += counts.size
  }
  return total / (toks.length - w + 1)
}

const count = (text, ch) => text.split(ch).length - 1

export function extract(text) {
  const toks = words(text)
  const n = toks.length
  const nw = Math.max(n, 1)
  const nc = Math.max(text.length, 1)
  const sentLens = sentenceSpans(text)
    .map(([a, b]) => words(text.slice(a, b)).length)
    .filter((x) => x > 0)
  const m = mean(sentLens)
  const s = std(sentLens)
  const fw = new Map(FUNCTION_WORDS.map((w) => [w, 0]))
  for (const t of toks) if (fw.has(t)) fw.set(t, fw.get(t) + 1)
  let digits = 0
  for (const ch of text) if (ch >= '0' && ch <= '9') digits++
  const fwTotal = [...fw.values()].reduce((a, b) => a + b, 0)
  return [
    Math.log1p(n),
    m,
    s,
    m ? s / m : 0,
    new Set(toks).size / nw,
    mattr(toks),
    mean(toks.map((t) => t.length)),
    toks.filter((t) => t.length >= 9).length / nw,
    count(text, ',') / nw,
    count(text, ';') / nw,
    count(text, ':') / nw,
    (count(text, '-') + count(text, '—') + count(text, '–')) / nw,
    count(text, '(') / nw,
    count(text, '?') / nw,
    digits / nc,
    repeatRate(toks, 2),
    repeatRate(toks, 3),
    fwTotal / nw,
    ...FUNCTION_WORDS.map((w) => fw.get(w) / nw),
  ]
}

// Number of values extract() returns (18 stylometric + one rate per function word).
export const FEATURE_NAMES_COUNT = 18 + FUNCTION_WORDS.length
