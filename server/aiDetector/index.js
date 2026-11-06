// Self-hosted AI-text detector. Loads exported models from AI_DETECT_MODEL_DIR (default:
// <repo>/models) once at startup, then scores text locally — nothing leaves the server.
//
// Models (each optional except tfidf.json; the best available combination is used):
//   tfidf.json                 TF-IDF + logistic regression          (E1)
//   transformer/               DistilRoBERTa, int8 ONNX              (E3)
//   fusion.json                stacker over both + linguistic feats  (E4)
//
// detect(text) returns the same shape the Sapling API did, so checkAiContent() is unchanged:
//   { ai_fraction, sentence_scores: [{ start, end, score }] }
// Each sentence's score is the mean score of the 3-sentence windows that contain it (single
// sentences are too short to judge on their own).
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadFusion } from './fusion.js'
import { loadTfidf } from './tfidf.js'
import { sentenceSpans, windows } from './text.js'

const DEFAULT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'models')
const MAX_WINDOWS = Number(process.env.AI_DETECT_MAX_WINDOWS || 4000)
// Sentences between window starts. 1 scores every overlapping window; the default 2 does about
// half the work with no measurable accuracy loss (see detector/README.md).
const STRIDE = Math.max(1, Number(process.env.AI_DETECT_STRIDE || 2))

let detector = null
let loadError = null
let loading = null

async function build(dir) {
  const read = (f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8'))
  if (!existsSync(path.join(dir, 'tfidf.json'))) throw new Error(`model file not found: ${path.join(dir, 'tfidf.json')}`)
  const tfidf = loadTfidf(read('tfidf.json'))

  let transformer = null
  if (existsSync(path.join(dir, 'transformer', 'onnx', 'model_quantized.onnx'))) {
    try {
      const { loadTransformer } = await import('./transformer.js')
      transformer = await loadTransformer(path.join(dir, 'transformer'))
    } catch (err) {
      console.warn(`[server] AI detector: transformer not loaded (${err.message}) — using TF-IDF only`)
    }
  }

  let fusion = null
  if (existsSync(path.join(dir, 'fusion.json'))) {
    const f = loadFusion(read('fusion.json'))
    if (f.needsTransformer && !transformer) console.warn('[server] AI detector: fusion.json needs the transformer, which is missing — using TF-IDF only')
    else fusion = f
  }

  // texts -> P(AI) per window, using the best available models.
  async function scoreWindows(texts) {
    const tf = texts.map(tfidf.score)
    if (!fusion) return tf
    const tr = fusion.needsTransformer ? await transformer.score(texts) : []
    return texts.map((t, i) => fusion.combine(t, { tfidf_score: tf[i], transformer_score: tr[i] }))
  }

  const version = fusion?.version ?? tfidf.version
  return { version, scoreWindows }
}

/** Loads the models once; safe to call repeatedly. Resolves to the status. */
export async function loadDetector() {
  if (!loading) {
    const dir = process.env.AI_DETECT_MODEL_DIR || DEFAULT_DIR
    loading = build(dir)
      .then((d) => {
        detector = d
        console.log(`[server] AI detector loaded (${d.version})`)
      })
      .catch((err) => {
        loadError = err
        console.warn(`[server] AI detector unavailable — ${err.message}`)
      })
  }
  await loading
  return detectorStatus()
}

export function detectorStatus() {
  return detector ? { ready: true, version: detector.version } : { ready: false, error: loadError?.message }
}

// Windows scored per chunk. Between chunks the detector yields to other requests and checks
// the budget's deadline, so a slow CPU can't stall the rest of the analysis.
const CHUNK = 16

/** 0..n-1 in an order where every prefix is spread evenly over the range (bit-reversal):
 *  0, n/2, n/4, 3n/4, … So if scoring stops early, what was scored covers the whole paper. */
export function spreadOrder(n) {
  let bits = 0
  while (1 << bits < n) bits++
  const reverse = (x) => {
    let r = 0
    for (let b = 0; b < bits; b++) r = (r << 1) | ((x >> b) & 1)
    return r
  }
  return Array.from({ length: n }, (_, i) => i).sort((a, b) => reverse(a) - reverse(b))
}

/** Scores several blocks of whitespace-collapsed text (e.g. a paper's sections) together.
 *  Windows from all blocks are scored in spreadOrder, so when the budget runs out the scored
 *  part is spread evenly across every block rather than covering only the first ones.
 *  budget: { windows, deadline?, stride? }; `deadline` is a Date.now() timestamp after which
 *  scoring stops (budget.timedOut is then set). Offsets index into each text as given. */
export async function detectMany(texts, budget = { windows: MAX_WINDOWS }) {
  await loadDetector()
  if (!detector) throw new Error(loadError?.message || 'AI detector not loaded')
  const blocks = texts.map((text) => {
    const spans = sentenceSpans(text)
    return { text, spans, wins: windows(spans.length, undefined, budget.stride ?? STRIDE) }
  })
  const all = blocks.flatMap((b, bi) => b.wins.map((w) => ({ bi, w })))
  const order = spreadOrder(all.length).slice(0, Math.max(0, budget.windows))

  const scores = new Map() // index into `all` -> score
  for (let c = 0; c < order.length; c += CHUNK) {
    if (budget.deadline && Date.now() > budget.deadline) {
      budget.timedOut = true
      break
    }
    const idx = order.slice(c, c + CHUNK)
    const chunkTexts = idx.map((k) => {
      const { bi, w: [i, j] } = all[k]
      const { text, spans } = blocks[bi]
      return text.slice(spans[i][0], spans[j - 1][1])
    })
    const got = await detector.scoreWindows(chunkTexts)
    idx.forEach((k, n) => scores.set(k, got[n]))
    await new Promise((r) => setImmediate(r))
  }
  budget.windows -= scores.size

  const sums = blocks.map((b) => ({ sum: new Float64Array(b.spans.length), cnt: new Float64Array(b.spans.length), win: [] }))
  for (const [k, score] of scores) {
    const { bi, w: [i, j] } = all[k]
    for (let s = i; s < j; s++) {
      sums[bi].sum[s] += score
      sums[bi].cnt[s]++
    }
    sums[bi].win.push(score)
  }
  return blocks.map((b, bi) => {
    const { sum, cnt, win } = sums[bi]
    const sentence_scores = []
    b.spans.forEach(([start, end], s) => {
      if (cnt[s]) sentence_scores.push({ start, end, score: sum[s] / cnt[s] })
    })
    return {
      ai_fraction: win.length ? win.reduce((x, y) => x + y, 0) / win.length : null,
      sentence_scores,
      truncated: win.length < b.wins.length,
    }
  })
}

/** Scores one block of whitespace-collapsed text. Offsets index into `text` as given. */
export async function detect(text, budget = { windows: MAX_WINDOWS }) {
  return (await detectMany([text], budget))[0]
}
