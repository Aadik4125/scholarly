// Downloads the AI-detector model files into AI_DETECT_MODEL_DIR (default ./models).
// Source: AI_DETECT_MODEL_URL, a base URL serving the files, e.g. a Hugging Face model repo:
//   AI_DETECT_MODEL_URL=https://huggingface.co/<user>/scholarly-detector/resolve/main
// Files that already exist are skipped, so this is safe to run on every build.
import 'dotenv/config'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

// tfidf.json is required; the transformer and fusion files are optional upgrades (the server
// uses the best combination present).
const FILES = [
  'tfidf.json',
  'fusion.json',
  'transformer/config.json',
  'transformer/tokenizer.json',
  'transformer/tokenizer_config.json',
  'transformer/onnx/model_quantized.onnx',
]
const dir = process.env.AI_DETECT_MODEL_DIR || path.resolve('models')
const base = process.env.AI_DETECT_MODEL_URL

mkdirSync(dir, { recursive: true })
const missing = FILES.filter((f) => !existsSync(path.join(dir, f)))
if (!missing.length) {
  console.log(`[fetch-models] all model files present in ${dir}`)
  process.exit(0)
}
if (!base) {
  console.warn(`[fetch-models] missing ${missing.join(', ')} and AI_DETECT_MODEL_URL is not set — the AI-content check will be skipped`)
  process.exit(0) // don't fail the build; the server degrades gracefully
}
for (const f of missing) {
  const url = `${base.replace(/\/$/, '')}/${f}`
  const res = await fetch(url)
  if (!res.ok) {
    if (f === 'tfidf.json') throw new Error(`[fetch-models] ${url} -> HTTP ${res.status}`)
    console.warn(`[fetch-models] optional ${f} not available (HTTP ${res.status})`)
    continue
  }
  mkdirSync(path.dirname(path.join(dir, f)), { recursive: true })
  writeFileSync(path.join(dir, f), Buffer.from(await res.arrayBuffer()))
  console.log(`[fetch-models] downloaded ${f}`)
}
