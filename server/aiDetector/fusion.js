// Applies the exported logistic-regression stacker (models/fusion.json) that combines the
// TF-IDF score, the transformer score and the linguistic features into one calibrated P(AI).
import { FEATURE_NAMES_COUNT, extract } from './features.js'
import { normalize } from './text.js'

const logit = (p) => {
  const q = Math.min(Math.max(p, 1e-6), 1 - 1e-6)
  return Math.log(q / (1 - q))
}

export function loadFusion(json) {
  if (json.type !== 'logit_stacker') throw new Error(`unexpected fusion type ${json.type}`)
  const scoreInputs = json.inputs.filter((n) => n.startsWith('logit('))
  const usesFeatures = json.inputs.length > scoreInputs.length
  if (usesFeatures && json.inputs.length - scoreInputs.length !== FEATURE_NAMES_COUNT) {
    throw new Error('fusion.json feature list does not match features.js')
  }
  const needsTransformer = scoreInputs.includes('logit(transformer_score)')

  /** scores: { tfidf_score, transformer_score } for one window of text. */
  function combine(text, scores) {
    const x = scoreInputs.map((n) => logit(scores[n.slice(6, -1)]))
    if (usesFeatures) x.push(...extract(normalize(text)))
    let z = json.intercept
    for (let i = 0; i < x.length; i++) z += ((x[i] - json.mean[i]) / json.scale[i]) * json.coef[i]
    return 1 / (1 + Math.exp(-z))
  }

  return { version: json.version, needsTransformer, combine }
}
