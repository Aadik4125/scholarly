import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

const PORT = process.env.PORT || 8787

if (!process.env.ANTHROPIC_API_KEY) console.warn('[server] ANTHROPIC_API_KEY is not set in .env — /api/analyze and /api/ask will fail until it is')
if (!process.env.OPENAI_API_KEY) console.warn('[server] OPENAI_API_KEY is not set in .env — the self-similarity embeddings step will be skipped until it is')

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null

const SONNET = 'claude-sonnet-5'
const HAIKU = 'claude-haiku-4-5-20251001'
const EMBEDDING_MODEL = 'text-embedding-3-small'
const MAX_SENTENCES = 800
// Sentence pairs at or above this cosine similarity are treated as repeated text.
// Measured on real output: verbatim repeats score ~1.0, unrelated sentences stay below ~0.85.
const NEAR_DUPLICATE_THRESHOLD = 0.95

const app = express()
app.use(cors())
app.use(express.json({ limit: '15mb' }))

// Prototype-level cost guard: cap how much raw document text any single call sends.
const MAX_CHARS = 20000
function clip(text) {
  return text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) + '\n\n[...truncated for length...]' : text
}

function renderSections(sections) {
  return sections.map((s, i) => `[Section ${i}: ${s.heading}]\n${s.text}`).join('\n\n')
}

let idCounter = 0
function nextId(prefix) {
  idCounter += 1
  return `${prefix}-${Date.now()}-${idCounter}`
}

async function callTool({ model, system, userText, tool }) {
  if (!anthropic) throw new Error('ANTHROPIC_API_KEY is not set in .env — add it and restart the server')
  const response = await anthropic.messages.create({
    model,
    max_tokens: 4096,
    system,
    tools: [tool],
    tool_choice: { type: 'tool', name: tool.name },
    messages: [{ role: 'user', content: userText }],
  })
  const block = response.content.find((b) => b.type === 'tool_use')
  if (!block) throw new Error('Model did not return a structured tool call')
  return block.input
}

const findingsTool = {
  name: 'submit_findings',
  description: 'Submit the consistency and novelty findings for this paper.',
  input_schema: {
    type: 'object',
    properties: {
      consistencyIssues: {
        type: 'array',
        description: 'Real internal contradictions only — do not invent issues if none exist.',
        items: {
          type: 'object',
          properties: {
            category: { type: 'string', enum: ['methodology', 'dataset', 'numbers', 'model', 'abstract-vs-results', 'other'] },
            severity: { type: 'string', enum: ['high', 'medium', 'low'] },
            title: { type: 'string' },
            explanation: { type: 'string' },
            locations: {
              type: 'array',
              items: {
                type: 'object',
                properties: { section: { type: 'string' }, quote: { type: 'string' } },
                required: ['section', 'quote'],
              },
            },
          },
          required: ['category', 'severity', 'title', 'explanation', 'locations'],
        },
      },
      noveltyPoints: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['distinctive', 'overlap', 'suggestion'] },
            text: { type: 'string' },
            source: { type: 'string' },
          },
          required: ['type', 'text'],
        },
      },
      suggestedQuestions: {
        type: 'array',
        items: { type: 'string' },
        minItems: 3,
        maxItems: 4,
      },
    },
    required: ['consistencyIssues', 'noveltyPoints', 'suggestedQuestions'],
  },
}

const writingTool = {
  name: 'submit_writing',
  description: 'Submit writing-quality suggestions and citation gaps for this paper.',
  input_schema: {
    type: 'object',
    properties: {
      writingSuggestions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            section: { type: 'string' },
            type: { type: 'string', enum: ['clarity', 'concision', 'tone'] },
            original: { type: 'string' },
            suggested: { type: 'string' },
            reason: { type: 'string' },
          },
          required: ['section', 'type', 'original', 'suggested', 'reason'],
        },
      },
      citationGaps: {
        type: 'array',
        description: 'Strong factual/statistical claims with no nearby citation.',
        items: {
          type: 'object',
          properties: { section: { type: 'string' }, claim: { type: 'string' } },
          required: ['section', 'claim'],
        },
      },
    },
    required: ['writingSuggestions', 'citationGaps'],
  },
}

const answerTool = {
  name: 'submit_answer',
  description: 'Submit a grounded answer to the question about this paper.',
  input_schema: {
    type: 'object',
    properties: {
      content: { type: 'string' },
      groundedIn: { type: 'array', items: { type: 'string' }, description: 'Section names the answer draws on.' },
    },
    required: ['content'],
  },
}

app.post('/api/analyze', async (req, res) => {
  try {
    const { fileName, fullText, sections } = req.body
    if (!fullText || !Array.isArray(sections)) {
      return res.status(400).json({ error: 'fullText and sections are required' })
    }
    const sectionText = clip(renderSections(sections))

    const [findings, writing] = await Promise.all([
      callTool({
        model: SONNET,
        system:
          'You are an academic integrity and research-quality reviewer. You read a student/researcher paper and find REAL internal contradictions (conflicting numbers, dataset sizes, model names, methodology claims) and assess novelty against general knowledge of the field. Be conservative: only report issues you are confident about, grounded in exact quotes from the text. Do not report repeated or copied text as a contradiction — repetition is checked separately. If the paper is clean, return an empty array rather than inventing issues.',
        userText: `File: ${fileName}\n\n${sectionText}`,
        tool: findingsTool,
      }),
      callTool({
        model: HAIKU,
        system:
          'You are a writing-clarity editor for academic papers. Find real clarity/concision/tone issues and strong claims lacking citations. Always flag informal contractions (don\'t, can\'t, it\'s, doesn\'t) and filler phrases (a lot of, kind of, really) as tone or concision issues. Preserve numbers, citations, and technical meaning. Be conservative otherwise — only flag things genuinely worth fixing.',
        userText: `File: ${fileName}\n\n${sectionText}`,
        tool: writingTool,
      }),
    ])

    const consistencyIssues = findings.consistencyIssues.map((i) => ({ id: nextId('ci'), status: 'open', ...i }))
    const writingSuggestions = writing.writingSuggestions.map((s) => ({ id: nextId('ws'), status: 'pending', ...s }))
    const citationGaps = writing.citationGaps.map((g) => ({ id: nextId('cg'), ...g }))
    const noveltyPoints = findings.noveltyPoints.map((n) => ({ id: nextId('np'), ...n }))

    // Self-similarity: chunk each section and flag near-duplicate passages within the
    // document itself, via OpenAI embeddings. This is the one thing the OpenAI key is
    // used for — there is no external corpus, so this can only catch internal repetition.
    let selfSimilarityMatches = []
    try {
      const units = []
      for (const s of sections) {
        for (const raw of s.text.split(/(?<=[.!?])\s+/)) {
          const text = raw.trim()
          if (text.split(/\s+/).length >= 5) units.push({ section: s.heading, text })
          if (units.length >= MAX_SENTENCES) break
        }
        if (units.length >= MAX_SENTENCES) break
      }
      if (openai && units.length >= 2) {
        const embedRes = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: units.map((u) => u.text) })
        const vectors = embedRes.data.map((d) => d.embedding)
        const cosine = (a, b) => {
          let dot = 0
          for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
          return dot // OpenAI embeddings are already unit-normalized
        }
        const pairs = new Map()
        for (let i = 0; i < vectors.length; i++) {
          for (let j = i + 1; j < vectors.length; j++) {
            if (units[i].section === units[j].section) continue
            const sim = cosine(vectors[i], vectors[j])
            if (sim >= NEAR_DUPLICATE_THRESHOLD) pairs.set(`${i},${j}`, sim)
          }
        }
        // Consecutive matching sentence pairs are one repeated passage, not many separate matches.
        const groups = []
        const groupOf = new Map()
        const orderedKeys = [...pairs.keys()].map((k) => k.split(',').map(Number)).sort((a, b) => a[0] - b[0] || a[1] - b[1])
        for (const [i, j] of orderedKeys) {
          const prevKey = `${i - 1},${j - 1}`
          const group = groupOf.get(prevKey)
          if (group) {
            group.pairs.push([i, j])
            groupOf.set(`${i},${j}`, group)
          } else {
            const fresh = { pairs: [[i, j]] }
            groups.push(fresh)
            groupOf.set(`${i},${j}`, fresh)
          }
        }
        selfSimilarityMatches = groups
          .map((g) => {
            const sims = g.pairs.map(([i, j]) => pairs.get(`${i},${j}`))
            return {
              sectionA: units[g.pairs[0][0]].section,
              excerptA: g.pairs.map(([i]) => units[i].text).join(' '),
              sectionB: units[g.pairs[0][1]].section,
              excerptB: g.pairs.map(([, j]) => units[j].text).join(' '),
              similarityPercent: Math.round((sims.reduce((a, b) => a + b, 0) / sims.length) * 1000) / 10,
            }
          })
          .sort((a, b) => b.similarityPercent - a.similarityPercent)
          .slice(0, 5)
          .map((m) => ({ id: nextId('ssm'), ...m }))
      }
    } catch (embedErr) {
      console.error('[server] embeddings step failed, continuing without it:', embedErr.message)
    }

    res.json({
      consistencyIssues,
      writingSuggestions,
      citationGaps,
      noveltyPoints,
      suggestedQuestions: findings.suggestedQuestions,
      selfSimilarityMatches,
    })
  } catch (err) {
    console.error('[server] /api/analyze failed:', err)
    res.status(500).json({ error: err.message || 'Analysis failed' })
  }
})

app.post('/api/ask', async (req, res) => {
  try {
    const { fileName, fullText, title, question } = req.body
    if (!question || !fullText) return res.status(400).json({ error: 'question and fullText are required' })
    const documentText = clip(fullText)

    const answer = await callTool({
      model: SONNET,
      system:
        `You are "Ask My Paper" — you answer questions about a specific document, grounded only in its actual content. Never invent facts not in the text. If the paper doesn't address the question, say so plainly. Keep answers concise (2-5 sentences) unless asked for more detail. In groundedIn, name the section(s) you drew on.`,
      userText: `Paper title: "${title}" (file: ${fileName})\n\n${documentText}\n\nQuestion: ${question}`,
      tool: answerTool,
    })

    res.json(answer)
  } catch (err) {
    console.error('[server] /api/ask failed:', err)
    res.status(500).json({ error: err.message || 'Ask failed' })
  }
})

app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.listen(PORT, () => {
  console.log(`[server] Scholarly API listening on http://localhost:${PORT}`)
})
