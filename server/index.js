import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

const PORT = process.env.PORT || 8787

if (!process.env.ANTHROPIC_API_KEY) console.warn('[server] ANTHROPIC_API_KEY is not set in .env — /api/analyze and /api/ask will fail until it is')
if (!process.env.OPENAI_API_KEY) console.warn('[server] OPENAI_API_KEY is not set in .env — the self-similarity embeddings step will be skipped until it is')
if (!process.env.CORE_API_KEY) console.warn('[server] CORE_API_KEY is not set in .env — external similarity will still run against OpenAlex (no key needed), just without CORE\'s full-text corpus layered in')

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null

const SONNET = 'claude-sonnet-5'
const HAIKU = 'claude-haiku-4-5-20251001'
const EMBEDDING_MODEL = 'text-embedding-3-small'
const MAX_SENTENCES = 800
// Sentence pairs at or above this cosine similarity are treated as repeated text.
// Measured on real output: verbatim repeats score ~1.0, unrelated sentences stay below ~0.85.
const NEAR_DUPLICATE_THRESHOLD = 0.95
// Paraphrase/overlap threshold against external abstracts is lower than the internal-duplicate
// one, since we're comparing a passage against an abstract summarizing a whole paper, not a
// verbatim copy. Measured on a real verbatim-copied passage: true match scored 0.82-0.85
// (varies slightly by which provider's version of the abstract wins the CORE/OpenAlex dedup),
// unrelated candidates scored 0.55-0.65 — wide margin either side of 0.78.
const EXTERNAL_MATCH_THRESHOLD = 0.78
const CORE_API_BASE = 'https://api.core.ac.uk/v3'

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
            original: { type: 'string', description: 'Exact verbatim quote from the document to be replaced.' },
            suggested: {
              type: 'string',
              description:
                'The literal replacement text, verbatim — never an instruction like "delete this" or "rephrase". Empty string if the fix is to delete original entirely.',
            },
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

const cosine = (a, b) => {
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
  return dot // OpenAI embeddings are already unit-normalized
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Reconstructs plain text from OpenAlex's abstract_inverted_index format (a word -> [positions]
 *  map, used instead of plain abstract text to respect publisher copyright on the prose itself). */
function reconstructAbstract(invertedIndex) {
  if (!invertedIndex) return ''
  const positions = []
  for (const [word, idxs] of Object.entries(invertedIndex)) {
    for (const idx of idxs) positions[idx] = word
  }
  return positions.join(' ')
}

/** Searches CORE.ac.uk's open-access corpus (200M+ works, many with full text) for a passage.
 *  Requires a free API key (core.ac.uk/services/api) — returns [] if not configured. */
async function searchCore(passage) {
  if (!process.env.CORE_API_KEY) return []
  const res = await fetch(`${CORE_API_BASE}/search/works?${new URLSearchParams({ q: passage, limit: '3' })}`, {
    headers: { Authorization: `Bearer ${process.env.CORE_API_KEY}` },
  })
  if (!res.ok) {
    console.error('[server] CORE search failed:', res.status, await res.text().catch(() => ''))
    return []
  }
  const data = await res.json()
  return (data.results || [])
    .filter((r) => r.abstract && r.abstract.length > 40)
    .map((r) => ({
      title: r.title || 'Untitled work',
      authors: (r.authors || []).map((a) => a.name).filter(Boolean).join(', ') || 'Unknown authors',
      abstract: r.abstract,
    }))
}

/** Searches OpenAlex's 250M+ work metadata index (every discipline, free, no API key — an
 *  email in `mailto` just moves you into their faster "polite pool"). Abstracts only, no
 *  full text, but far higher rate limits and broader coverage than CORE. */
async function searchOpenAlex(passage) {
  const params = new URLSearchParams({ search: passage, per_page: '3' })
  if (process.env.OPENALEX_MAILTO) params.set('mailto', process.env.OPENALEX_MAILTO)
  const res = await fetch(`https://api.openalex.org/works?${params}`)
  if (!res.ok) {
    console.error('[server] OpenAlex search failed:', res.status, await res.text().catch(() => ''))
    return []
  }
  const data = await res.json()
  return (data.results || [])
    .map((w) => ({
      title: w.title || 'Untitled work',
      authors: (w.authorships || []).map((a) => a.author?.display_name).filter(Boolean).join(', ') || 'Unknown authors',
      abstract: reconstructAbstract(w.abstract_inverted_index),
    }))
    .filter((w) => w.abstract.length > 40)
}

function dedupeCandidates(candidates) {
  const seen = new Set()
  return candidates.filter((c) => {
    const key = c.title.toLowerCase().trim()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Checks a handful of representative passages against two free academic corpora in parallel —
 *  OpenAlex (huge rate limit, abstracts only, zero config) and CORE (full text when available,
 *  needs a free API key) — then uses OpenAI embeddings to score how close the passage actually
 *  is to each candidate's abstract. Each provider's own search is keyword-based and returns
 *  loose matches; the embedding step is what turns that into an actual similarity judgment.
 *  Always attempts OpenAlex, so this is "checked" even with no corpus key configured at all. */
async function checkExternalSimilarity(sections) {
  if (!openai) return { checked: false, overallSimilarityPercent: 0, similaritySources: [] }

  // searchQuery (short) drives CORE/OpenAlex's relevance search — both engines rank long,
  // multi-sentence queries poorly (common words dilute the ranking against millions of
  // papers). text (longer) is what actually gets compared via embeddings once candidates
  // come back, where more context only helps.
  //
  // Strides through every section rather than just the first ~60 words of the first few —
  // checking only the opening of each section means most of a real multi-thousand-word paper
  // is never sampled at all, which is the main reason a real overlap (the kind a full-text
  // scanner like Turnitin would catch) can be missed here even when it genuinely exists.
  const STRIDE_WORDS = 120
  const CHUNK_WORDS = 60
  const MAX_PASSAGES = 20
  const passages = []
  outer: for (const s of sections) {
    const words = s.text.split(/\s+/)
    for (let i = 0; i < words.length; i += STRIDE_WORDS) {
      const chunkWords = words.slice(i, i + CHUNK_WORDS)
      if (chunkWords.length < 20) continue
      passages.push({ searchQuery: chunkWords.slice(0, 15).join(' '), text: chunkWords.join(' ') })
      if (passages.length >= MAX_PASSAGES) break outer
    }
  }
  if (passages.length === 0) return { checked: true, overallSimilarityPercent: 0, similaritySources: [] }

  const sources = []
  let matchedCount = 0

  for (const passage of passages) {
    try {
      const [coreResults, openAlexResults] = await Promise.all([
        searchCore(passage.searchQuery),
        searchOpenAlex(passage.searchQuery),
      ])
      const candidates = dedupeCandidates([...coreResults, ...openAlexResults])
      if (candidates.length > 0) {
        const embedRes = await openai.embeddings.create({
          model: EMBEDDING_MODEL,
          input: [passage.text, ...candidates.map((c) => c.abstract.slice(0, 2000))],
        })
        const vectors = embedRes.data.map((d) => d.embedding)
        let best = null
        for (let i = 0; i < candidates.length; i++) {
          const sim = cosine(vectors[0], vectors[i + 1])
          if (!best || sim > best.sim) best = { sim, candidate: candidates[i] }
        }
        if (best && best.sim >= EXTERNAL_MATCH_THRESHOLD) {
          matchedCount += 1
          sources.push({
            id: nextId('sim'),
            title: best.candidate.title,
            authors: best.candidate.authors,
            matchPercent: Math.round(best.sim * 1000) / 10,
            matchedExcerpt: passage.text,
          })
        }
      }
    } catch (err) {
      console.error('[server] external similarity lookup failed for a passage, continuing:', err.message)
    }
    if (process.env.CORE_API_KEY) await sleep(1200) // stay well under CORE's free-tier rate limit
  }

  sources.sort((a, b) => b.matchPercent - a.matchPercent)
  return {
    checked: true,
    overallSimilarityPercent: Math.round((matchedCount / passages.length) * 1000) / 10,
    similaritySources: sources.slice(0, 5),
  }
}

app.post('/api/analyze', async (req, res) => {
  try {
    const { fileName, fullText, sections } = req.body
    if (!fullText || !Array.isArray(sections)) {
      return res.status(400).json({ error: 'fullText and sections are required' })
    }
    const sectionText = clip(renderSections(sections))

    const [findings, writing, externalSimilarity] = await Promise.all([
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
          'You are a writing-clarity editor for academic papers. Find real clarity/concision/tone issues and strong claims lacking citations. Always flag informal contractions (don\'t, can\'t, it\'s, doesn\'t) and filler phrases (a lot of, kind of, really) as tone or concision issues. Preserve numbers, citations, and technical meaning. Be conservative otherwise — only flag things genuinely worth fixing. "suggested" must always be the literal replacement text to substitute for "original", verbatim — never a meta-instruction like "Delete this sentence" or "Rephrase for clarity". If the right fix is to delete the sentence entirely, set "suggested" to an empty string.',
        userText: `File: ${fileName}\n\n${sectionText}`,
        tool: writingTool,
      }),
      checkExternalSimilarity(sections),
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
      similarityCorpusChecked: externalSimilarity.checked,
      overallSimilarityPercent: externalSimilarity.overallSimilarityPercent,
      similaritySources: externalSimilarity.similaritySources,
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
