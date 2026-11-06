// Unit tests for detect() with a tiny hand-made model, so they run without trained files.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

// The model scores any text containing "delve" as AI: one feature, large positive weight.
const dir = mkdtempSync(path.join(tmpdir(), 'aidet-'))
writeFileSync(
  path.join(dir, 'tfidf.json'),
  JSON.stringify({ type: 'tfidf_lr', version: 'test-model', sublinear_tf: true, terms: ['w:delve'], idf: [1], coef: [8], intercept: -4 }),
)
process.env.AI_DETECT_MODEL_DIR = dir
const { detect, detectMany, detectorStatus, loadDetector, spreadOrder } = await import('./index.js')
const { windows } = await import('./text.js')
await loadDetector()

test('loads the model', () => {
  assert.deepEqual(detectorStatus(), { ready: true, version: 'test-model' })
})

test('sentence offsets index into the input and scores reflect windows', async () => {
  const text = 'One plain line. Two plain line. Three plain line. Let us delve deeper. Five plain line. Six plain line. Seven plain line.'
  const { sentence_scores, ai_fraction } = await detect(text)
  assert.equal(sentence_scores.length, 7)
  assert.equal(text.slice(sentence_scores[3].start, sentence_scores[3].end), 'Let us delve deeper.')
  // Sentence 4 is in 3 windows, all containing "delve"; sentence 1 is in one window without it.
  assert.ok(sentence_scores[3].score > 0.9)
  assert.ok(sentence_scores[0].score < 0.1)
  assert.ok(ai_fraction > 0 && ai_fraction < 1)
})

test('window budget truncates long input', async () => {
  const text = Array.from({ length: 50 }, (_, i) => `Sentence number ${i}.`).join(' ')
  const res = await detect(text, { windows: 5, stride: 1 })
  assert.equal(res.truncated, true)
  // The 5 windows are spread over the text (windows 0, 32, 16, 8, 40), not the first five.
  assert.equal(res.sentence_scores.length, 15)
  assert.ok(res.sentence_scores.at(-1).start > text.length * 0.8)
})

test('spreadOrder: every prefix is spread across the range', () => {
  assert.deepEqual(spreadOrder(8), [0, 4, 2, 6, 1, 5, 3, 7])
  assert.deepEqual([...spreadOrder(5)].sort(), [0, 1, 2, 3, 4])
})

test('a cut-off still samples every section', async () => {
  const section = (n) => Array.from({ length: 30 }, (_, i) => `Section ${n} sentence ${i}.`).join(' ')
  const results = await detectMany([section(1), section(2), section(3)], { windows: 6, stride: 1 })
  for (const r of results) {
    assert.ok(r.sentence_scores.length > 0)
    assert.equal(r.truncated, true)
  }
})

test('stride skips overlap but still covers every sentence', async () => {
  assert.deepEqual(windows(7, 3, 2), [[0, 3], [2, 5], [4, 7]])
  assert.deepEqual(windows(8, 3, 2), [[0, 3], [2, 5], [4, 7], [5, 8]]) // tail window added
  assert.deepEqual(windows(5, 3, 1), [[0, 3], [1, 4], [2, 5]])
  const text = Array.from({ length: 50 }, (_, i) => `Sentence number ${i}.`).join(' ')
  const res = await detect(text, { windows: 1e6, stride: 2 })
  assert.equal(res.sentence_scores.length, 50)
  assert.equal(res.truncated, false)
})

test('time limit stops scoring', async () => {
  const text = Array.from({ length: 50 }, (_, i) => `Sentence number ${i}.`).join(' ')
  const budget = { windows: 1e6, deadline: Date.now() - 1 }
  const res = await detect(text, budget)
  assert.equal(budget.timedOut, true)
  assert.equal(res.sentence_scores.length, 0)
})

test('short text gets a single window', async () => {
  const res = await detect('Just one sentence without a stop')
  assert.equal(res.sentence_scores.length, 1)
})
