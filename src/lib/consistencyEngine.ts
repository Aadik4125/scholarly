import type { ExtractedSection } from './textExtraction'
import type { ConsistencyIssue } from '../types'
import { splitSentences, excerpt, nextLocalId } from './sentenceUtils'

const METRIC_PATTERN =
  /\b(accuracy|precision|recall|f1[- ]?score|f-score|auc|error rate)\b[^.]{0,30}?(\d{1,3}(?:\.\d+)?)\s*%/gi

const MODEL_NAMES = [
  'random forest',
  'xgboost',
  'gradient boosting',
  'adaboost',
  'support vector machine',
  'svm',
  'logistic regression',
  'linear regression',
  'decision tree',
  'convolutional neural network',
  'neural network',
  'cnn',
  'lstm',
  'rnn',
  'transformer',
  'bert',
  'naive bayes',
  'k-nearest neighbors',
  'knn',
  'k-means',
]

const DATASET_PATTERN =
  /\b(\d[\d,]{1,8})\s*(students?|records?|samples?|participants?|subjects?|patients?|images?|instances?)\b/gi

interface MetricMention {
  metric: string
  value: number
  section: string
  context: string
}

function findMetricMentions(sections: ExtractedSection[]): MetricMention[] {
  const mentions: MetricMention[] = []
  for (const { heading, text } of sections) {
    for (const sentence of splitSentences(text)) {
      METRIC_PATTERN.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = METRIC_PATTERN.exec(sentence))) {
        const metric = match[1].toLowerCase().replace(/[- ]?score$/, '').replace('f-score', 'f1')
        mentions.push({ metric, value: parseFloat(match[2]), section: heading, context: sentence })
      }
    }
  }
  return mentions
}

function checkMetricContradictions(sections: ExtractedSection[]): ConsistencyIssue[] {
  const mentions = findMetricMentions(sections)
  const byMetric = new Map<string, MetricMention[]>()
  for (const m of mentions) {
    if (!byMetric.has(m.metric)) byMetric.set(m.metric, [])
    byMetric.get(m.metric)!.push(m)
  }

  const issues: ConsistencyIssue[] = []
  const seenTitles = new Set<string>()

  for (const list of byMetric.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]
        const b = list[j]
        if (a.section === b.section || Math.abs(a.value - b.value) < 0.5) continue

        const title = `Reported ${a.metric} differs between ${a.section} and ${b.section}`
        if (seenTitles.has(title)) continue
        seenTitles.add(title)

        issues.push({
          id: nextLocalId('ci'),
          category: 'numbers',
          severity: 'high',
          title,
          explanation: `${a.section} reports ${a.metric} of ${a.value}%, while ${b.section} reports ${b.value}% for what appears to be a comparable result. Confirm these figures refer to the same run, or reconcile the discrepancy.`,
          locations: [
            { section: a.section, quote: excerpt(a.context) },
            { section: b.section, quote: excerpt(b.context) },
          ],
          status: 'open',
        })
      }
    }
  }
  return issues
}

function checkModelNameContradictions(sections: ExtractedSection[]): ConsistencyIssue[] {
  const perSection = sections
    .map(({ heading, text }) => {
      const lower = text.toLowerCase()
      const found = MODEL_NAMES.filter((name) => lower.includes(name))
      const firstSentence = splitSentences(text).find((s) => found.some((f) => s.toLowerCase().includes(f)))
      return { heading, found: new Set(found), context: firstSentence ?? text.slice(0, 160) }
    })
    .filter((s) => s.found.size > 0)

  const issues: ConsistencyIssue[] = []
  for (let i = 0; i < perSection.length; i++) {
    for (let j = i + 1; j < perSection.length; j++) {
      const a = perSection[i]
      const b = perSection[j]
      const overlap = [...a.found].some((name) => b.found.has(name))
      if (overlap) continue
      issues.push({
        id: nextLocalId('ci'),
        category: 'model',
        severity: 'high',
        title: `Model identity differs between ${a.heading} and ${b.heading}`,
        explanation: `${a.heading} refers to ${[...a.found].join(', ')}, but ${b.heading} refers to ${[...b.found].join(', ')}. If these are meant to be the same final model, the naming should be reconciled.`,
        locations: [
          { section: a.heading, quote: excerpt(a.context) },
          { section: b.heading, quote: excerpt(b.context) },
        ],
        status: 'open',
      })
    }
  }
  return issues
}

function checkDatasetContradictions(sections: ExtractedSection[]): ConsistencyIssue[] {
  interface Mention {
    count: number
    noun: string
    section: string
    context: string
  }
  const mentions: Mention[] = []
  for (const { heading, text } of sections) {
    for (const sentence of splitSentences(text)) {
      DATASET_PATTERN.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = DATASET_PATTERN.exec(sentence))) {
        const count = parseInt(match[1].replace(/,/g, ''), 10)
        const noun = match[2].toLowerCase().replace(/s$/, '')
        mentions.push({ count, noun, section: heading, context: sentence })
      }
    }
  }

  const byNoun = new Map<string, Mention[]>()
  for (const m of mentions) {
    if (!byNoun.has(m.noun)) byNoun.set(m.noun, [])
    byNoun.get(m.noun)!.push(m)
  }

  const issues: ConsistencyIssue[] = []
  for (const list of byNoun.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]
        const b = list[j]
        if (a.section === b.section) continue
        const ratio = Math.max(a.count, b.count) / Math.max(1, Math.min(a.count, b.count))
        if (ratio < 1.15) continue
        issues.push({
          id: nextLocalId('ci'),
          category: 'dataset',
          severity: 'medium',
          title: `Dataset size (${a.noun}s) differs between ${a.section} and ${b.section}`,
          explanation: `${a.section} references ${a.count.toLocaleString()} ${a.noun}s, while ${b.section} references ${b.count.toLocaleString()} ${a.noun}s. Confirm which figure reflects the final dataset used.`,
          locations: [
            { section: a.section, quote: excerpt(a.context) },
            { section: b.section, quote: excerpt(b.context) },
          ],
          status: 'open',
        })
      }
    }
  }
  return issues
}

export function analyzeConsistency(sections: ExtractedSection[]): ConsistencyIssue[] {
  if (sections.length < 2) return []
  return [
    ...checkMetricContradictions(sections),
    ...checkModelNameContradictions(sections),
    ...checkDatasetContradictions(sections),
  ]
}
