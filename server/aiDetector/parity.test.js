// Checks the JS port against values computed by the Python training code.
// Fixtures: models/parity_fixtures.json, written by `python -m detector.export.to_json`.
//   npm run test:detector
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { extract } from './features.js'
import { loadTfidf } from './tfidf.js'
import { analyzer, normalize, sentenceSpans, windows, words } from './text.js'

const dir = process.env.AI_DETECT_MODEL_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'models')
const fixturesFile = path.join(dir, 'parity_fixtures.json')
const have = existsSync(fixturesFile)
const fixtures = have ? JSON.parse(readFileSync(fixturesFile, 'utf8')) : []
const tfidf = have ? loadTfidf(JSON.parse(readFileSync(path.join(dir, 'tfidf.json'), 'utf8'))) : null

test('parity fixtures present', { skip: !have && 'run the Python exporter first' }, () => {
  assert.ok(fixtures.length > 100)
})

test('text spec matches Python', { skip: !have }, () => {
  for (const f of fixtures) {
    const t = normalize(f.raw)
    assert.equal(t, f.normalized)
    // Compare span text, not offsets: Python counts code points, JS counts UTF-16 units.
    const pyChars = [...t]
    const pySpans = f.spans.map(([a, b]) => pyChars.slice(a, b).join(''))
    assert.deepEqual(sentenceSpans(t).map(([a, b]) => t.slice(a, b)), pySpans)
    assert.deepEqual(windows(f.spans.length), f.windows)
    assert.deepEqual(words(t).slice(0, 50), f.words)
    assert.equal(analyzer(t).length, f.n_features)
  }
})

test('linguistic features match Python', { skip: !have }, () => {
  for (const f of fixtures) {
    const js = extract(f.normalized)
    assert.equal(js.length, f.linguistic.length)
    js.forEach((v, i) => assert.ok(Math.abs(v - f.linguistic[i]) < 1e-6, `feature ${i}: ${v} vs ${f.linguistic[i]}`))
  }
})

test('tfidf scores match Python', { skip: !have }, () => {
  for (const f of fixtures) {
    const s = tfidf.score(f.normalized)
    assert.ok(Math.abs(s - f.tfidf_score) < 1e-4, `${s} vs ${f.tfidf_score} for ${f.normalized.slice(0, 60)}`)
  }
})

const trDir = path.join(dir, 'transformer')
const haveTr = have && existsSync(path.join(trDir, 'onnx', 'model_quantized.onnx')) && fixtures[0]?.transformer_score !== undefined
test('transformer scores match Python (same ONNX model)', { skip: !haveTr && 'no transformer export' }, async () => {
  const { loadTransformer } = await import('./transformer.js')
  const tr = await loadTransformer(trDir)
  const scores = await tr.score(fixtures.map((f) => f.normalized))
  let worst = 0
  fixtures.forEach((f, i) => (worst = Math.max(worst, Math.abs(scores[i] - f.transformer_score))))
  assert.ok(worst < 1e-3, `max abs diff ${worst}`)
})

const haveFusion = haveTr && existsSync(path.join(dir, 'fusion.json')) && fixtures[0]?.fused_score !== undefined
test('fused scores match Python', { skip: !haveFusion && 'no fusion export' }, async () => {
  const { loadFusion } = await import('./fusion.js')
  const fusion = loadFusion(JSON.parse(readFileSync(path.join(dir, 'fusion.json'), 'utf8')))
  for (const f of fixtures) {
    const s = fusion.combine(f.normalized, { tfidf_score: f.tfidf_score, transformer_score: f.transformer_score })
    assert.ok(Math.abs(s - f.fused_score) < 1e-6, `${s} vs ${f.fused_score}`)
  }
})
