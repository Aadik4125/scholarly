// Runs the fine-tuned DistilRoBERTa detector (ONNX, int8) with onnxruntime-node.
// Model layout (written by `python -m detector.export.to_onnx`):
//   <dir>/tokenizer.json, tokenizer_config.json, config.json, onnx/model_quantized.onnx
// Dependencies are imported lazily so the server still runs (TF-IDF only) without them.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { normalize } from './text.js'

const MAX_LEN = 256

// batchSize stays 1: the int8 model quantizes activations per batch, so batching (with padding)
// would make a window's score depend on its batch-mates.
export async function loadTransformer(dir, { batchSize = 1 } = {}) {
  const ort = await import('onnxruntime-node')
  const { Tokenizer } = await import('@huggingface/tokenizers')
  const read = (f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8'))
  const tokenizerConfig = read('tokenizer_config.json')
  const tokenizer = new Tokenizer(read('tokenizer.json'), tokenizerConfig)
  const config = read('config.json')
  const padId = config.pad_token_id ?? 1
  const eosId = config.eos_token_id ?? 2
  const session = await ort.InferenceSession.create(path.join(dir, 'onnx', 'model_quantized.onnx'), {
    intraOpNumThreads: Number(process.env.AI_DETECT_THREADS || 2),
  })
  const wantsTypeIds = session.inputNames.includes('token_type_ids')

  function encode(text) {
    let ids = tokenizer.encode(normalize(text)).ids
    // Same as Python's truncation=True, max_length=256: keep the first tokens, end with </s>.
    if (ids.length > MAX_LEN) ids = [...ids.slice(0, MAX_LEN - 1), eosId]
    return ids
  }

  async function runBatch(texts) {
    const encoded = texts.map(encode)
    const len = Math.max(...encoded.map((e) => e.length))
    const ids = new BigInt64Array(texts.length * len).fill(BigInt(padId))
    const mask = new BigInt64Array(texts.length * len)
    encoded.forEach((e, r) => {
      e.forEach((id, c) => {
        ids[r * len + c] = BigInt(id)
        mask[r * len + c] = 1n
      })
    })
    const feeds = {
      input_ids: new ort.Tensor('int64', ids, [texts.length, len]),
      attention_mask: new ort.Tensor('int64', mask, [texts.length, len]),
    }
    if (wantsTypeIds) feeds.token_type_ids = new ort.Tensor('int64', new BigInt64Array(texts.length * len), [texts.length, len])
    const { logits } = await session.run(feeds)
    const out = []
    for (let r = 0; r < texts.length; r++) {
      const a = logits.data[r * 2]
      const b = logits.data[r * 2 + 1]
      out.push(1 / (1 + Math.exp(a - b))) // softmax over 2 classes, P(AI)
    }
    return out
  }

  /** texts -> P(AI) for each, batched; batches are sorted by length to minimise padding. */
  async function score(texts) {
    const order = texts.map((t, i) => [t.length, i]).sort((x, y) => x[0] - y[0]).map(([, i]) => i)
    const out = new Array(texts.length)
    for (let s = 0; s < order.length; s += batchSize) {
      const idx = order.slice(s, s + batchSize)
      const scores = await runBatch(idx.map((i) => texts[i]))
      idx.forEach((i, k) => (out[i] = scores[k]))
    }
    return out
  }

  return { score, encode }
}
