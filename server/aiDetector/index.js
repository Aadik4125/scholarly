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

/** Scores one block of whitespace-collapsed text. Offsets index into `text` as given.
 *  budget: { windows, deadline? } shared across calls; `deadline` is a Date.now() timestamp
 *  after which scoring stops (budget.timedOut is then set). */
export async function detect(text, budget = { windows: MAX_WINDOWS }) {
  await loadDetector()
  if (!detector) throw new Error(loadError?.message || 'AI detector not loaded')
  const spans = sentenceSpans(text)
  const all = windows(spans.length)
  const wanted = all.slice(0, Math.max(0, budget.windows))
  const texts = wanted.map(([i, j]) => text.slice(spans[i][0], spans[j - 1][1]))
  const scores = []
  for (let c = 0; c < texts.length; c += CHUNK) {
    if (budget.deadline && Date.now() > budget.deadline) {
      budget.timedOut = true
      break
    }
    scores.push(...(await detector.scoreWindows(texts.slice(c, c + CHUNK))))
    await new Promise((r) => setImmediate(r))
  }
  const ws = wanted.slice(0, scores.length)
  budget.windows -= ws.length

  const sum = new Float64Array(spans.length)
  const cnt = new Float64Array(spans.length)
  ws.forEach(([i, j], w) => {
    for (let k = i; k < j; k++) {
      sum[k] += scores[w]
      cnt[k]++
    }
  })
  const sentence_scores = []
  spans.forEach(([start, end], k) => {
    if (cnt[k]) sentence_scores.push({ start, end, score: sum[k] / cnt[k] })
  })
  const mean = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null
  return { ai_fraction: mean, sentence_scores, truncated: ws.length < all.length }
}
