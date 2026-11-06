// Scores text with the exported TF-IDF + logistic-regression model (models/tfidf.json).
// Mirrors scikit-learn: counts -> 1 + ln(count) -> * idf -> L2 normalize -> dot(coef) + b -> sigmoid.
import { analyzer, normalize } from './text.js'

export function loadTfidf(json) {
  if (json.type !== 'tfidf_lr') throw new Error(`unexpected model type ${json.type}`)
  const index = new Map(json.terms.map((t, i) => [t, i]))
  const idf = Float64Array.from(json.idf)
  const coef = Float64Array.from(json.coef)
  const { intercept, sublinear_tf: sublinear, version } = json

  function score(text) {
    const counts = new Map()
    for (const f of analyzer(normalize(text))) {
      const i = index.get(f)
      if (i !== undefined) counts.set(i, (counts.get(i) ?? 0) + 1)
    }
    let norm = 0
    let dot = 0
    for (const [i, c] of counts) {
      const w = (sublinear ? 1 + Math.log(c) : c) * idf[i]
      norm += w * w
      dot += w * coef[i]
    }
    const z = (norm > 0 ? dot / Math.sqrt(norm) : 0) + intercept
    return 1 / (1 + Math.exp(-z))
  }

  return { version, score }
}
