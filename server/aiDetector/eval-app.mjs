// Scores the detector's evaluation sets exactly as the app does (exported models, windows,
// stride, int8 ONNX), so model versions can be compared on what students would actually see.
//
//   AI_DETECT_MODEL_DIR=models_v1 node server/aiDetector/eval-app.mjs [set ...]
//
// Reads detector/data/eval/<set>.jsonl (written by `python -m detector.eval.app_sets`).
// Per set: AI docs caught (doc score >= 0.5), human docs falsely flagged, the mean share of
// flagged sentences per class, and ROC-AUC of the doc score.
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { detectMany, detectorStatus, loadDetector } from './index.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const sets = process.argv.slice(2).length ? process.argv.slice(2) : ['modern_test', 'modern_ood', 'modern_audit', 'audit', 'legacy_test']

function auc(scores, labels) {
  const pos = scores.filter((_, i) => labels[i] === 1)
  const neg = scores.filter((_, i) => labels[i] === 0)
  if (!pos.length || !neg.length) return NaN
  let wins = 0
  for (const p of pos) for (const n of neg) wins += p > n ? 1 : p === n ? 0.5 : 0
  return wins / (pos.length * neg.length)
}

const pct = (x) => (Number.isNaN(x) ? '  -  ' : `${(100 * x).toFixed(1).padStart(5)}%`)
await loadDetector()
const { version } = detectorStatus()
console.log(`model: ${version ?? 'unknown'}  (${process.env.AI_DETECT_MODEL_DIR || 'models'})`)
for (const name of sets) {
  const file = path.join(root, 'detector', 'data', 'eval', `${name}.jsonl`)
  if (!existsSync(file)) continue
  const docs = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  const texts = docs.map((d) => d.text.replace(/\s+/g, ' ').trim())
  const results = []
  for (let i = 0; i < texts.length; i += 20) results.push(...(await detectMany(texts.slice(i, i + 20), { windows: Infinity })))
  const score = results.map((r) => r.ai_fraction ?? 0)
  const share = results.map((r) => (r.sentence_scores.length ? r.sentence_scores.filter((s) => s.score >= 0.5).length / r.sentence_scores.length : 0))
  const labels = docs.map((d) => d.label)
  const of = (lab, arr) => arr.filter((_, i) => labels[i] === lab)
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN)
  const ai = of(1, score), human = of(0, score)
  console.log(
    `${name.padEnd(13)} n=${String(docs.length).padStart(4)} | AI caught ${pct(mean(ai.map((s) => +(s >= 0.5))))} ` +
      `(sentences flagged ${pct(mean(of(1, share)))}) | human flagged ${pct(mean(human.map((s) => +(s >= 0.5))))} ` +
      `(sentences ${pct(mean(of(0, share)))}) | AUC ${Number.isNaN(auc(score, labels)) ? '  -  ' : auc(score, labels).toFixed(3)}`,
  )
  // Per generator, for sets with several.
  const gens = [...new Set(docs.filter((d) => d.label === 1).map((d) => d.generator))]
  if (gens.length > 1) {
    for (const g of gens.sort()) {
      const idx = docs.map((d, i) => (d.generator === g ? i : -1)).filter((i) => i >= 0)
      console.log(`    ${g.padEnd(30)} n=${String(idx.length).padStart(3)} caught ${pct(mean(idx.map((i) => +(score[i] >= 0.5))))}  sentences ${pct(mean(idx.map((i) => share[i])))}`)
    }
  }
}
