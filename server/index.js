import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

const PORT = process.env.PORT || 8787

if (!process.env.ANTHROPIC_API_KEY) console.warn('[server] ANTHROPIC_API_KEY is not set in .env — /api/analyze and /api/ask will fail until it is')
if (!process.env.OPENAI_API_KEY) console.warn('[server] OPENAI_API_KEY is not set in .env — the self-similarity embeddings step will be skipped until it is')
if (!process.env.CORE_API_KEY) console.warn('[server] CORE_API_KEY is not set in .env — external similarity will still run against OpenAlex, just without CORE\'s full-text corpus layered in')
if (!process.env.OPENALEX_API_KEY) console.warn('[server] OPENALEX_API_KEY is not set in .env — OpenAlex requests will draw on the small keyless daily budget shared by your whole IP address, and fail once it runs out')

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null

const SONNET = 'claude-sonnet-5'
const HAIKU = 'claude-haiku-4-5-20251001'
const EMBEDDING_MODEL = 'text-embedding-3-small'
const MAX_SENTENCES = 800
// Sentence pairs at or above this cosine similarity are treated as repeated text.
// Measured on real output: verbatim repeats score ~1.0, unrelated sentences stay below ~0.85.
const NEAR_DUPLICATE_THRESHOLD = 0.95
// Paraphrase threshold for a 60-word passage against a same-sized window of an external
// abstract. Measured on real data: passages copied from an abstract scored 0.84-0.90; original
// prose on the same topic scored 0.57-0.68, and number-heavy results text (metrics tables)
// reached 0.78 against unrelated papers — so 0.80 sits above that, below every true copy.
const EXTERNAL_MATCH_THRESHOLD = 0.8
const CORE_API_BASE = 'https://api.core.ac.uk/v3'

const app = express()
// Behind a host's load balancer (Render, Railway, Fly...) the client IP arrives in
// X-Forwarded-For; trusting one hop lets the rate limits below key on the real visitor.
app.set('trust proxy', Number(process.env.TRUST_PROXY ?? (process.env.NODE_ENV === 'production' ? 1 : 0)))
app.disable('x-powered-by')

// In production the API and the site share one origin, so no cross-origin access is needed.
// Other origins (e.g. a separately hosted frontend) must be listed in ALLOWED_ORIGINS.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean)
if (allowedOrigins.length) app.use('/api', cors({ origin: allowedOrigins }))
app.use(express.json({ limit: '15mb' }))

// Every /api/analyze call spends Claude, OpenAI and OpenAlex credits, so cap it per visitor
// and site-wide; /api/ask is one Claude call, so it gets a looser per-visitor cap.
const limitMessage = (message) => ({ error: message })
const analyzePerIp = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: Number(process.env.ANALYZE_LIMIT_PER_HOUR || 5),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: limitMessage('You have reached the hourly limit for paper analyses. Please try again later.'),
})
const analyzeDaily = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  limit: Number(process.env.ANALYZE_LIMIT_PER_DAY || 100),
  keyGenerator: () => 'global',
  standardHeaders: false,
  legacyHeaders: false,
  message: limitMessage('Scholarly has reached its analysis limit for today. Please try again tomorrow.'),
})
const askPerIp = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: Number(process.env.ASK_LIMIT_PER_HOUR || 40),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: limitMessage('You have reached the hourly question limit. Please try again later.'),
})

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
    max_tokens: 16000,
    system,
    tools: [tool],
    tool_choice: { type: 'tool', name: tool.name },
    messages: [{ role: 'user', content: userText }],
  })
  const block = response.content.find((b) => b.type === 'tool_use')
  if (!block) throw new Error('Model did not return a structured tool call')
  // A reply cut off at max_tokens arrives as a tool call with its later fields missing.
  if (response.stop_reason === 'max_tokens') console.warn(`[server] ${tool.name} reply hit max_tokens — some fields may be missing`)
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

// CORE's free tier allows only ~10 requests per minute and reports its window in response
// headers. CORE is a supplement to OpenAlex here, so rather than stall the whole analysis
// waiting out its window, requests made while it's exhausted are skipped (null), not failed.
let coreReadyAt = 0

function noteCoreRateLimit(res) {
  if (res.status !== 429 && res.headers.get('x-ratelimit-remaining') !== '0') return
  const retryAfter = Date.parse(res.headers.get('x-ratelimit-retry-after') || '')
  coreReadyAt = Number.isNaN(retryAfter) ? Date.now() + 60_000 : retryAfter + 500
}

/** Searches CORE.ac.uk's open-access corpus (200M+ works, many with full text) for a passage.
 *  Requires a free API key (core.ac.uk/services/api) — returns [] if not configured, and null
 *  if skipped for its rate limit. Throws on any other failed request, so the caller can tell
 *  "searched, nothing found" from "search failed". */
async function searchCore(passage) {
  if (!process.env.CORE_API_KEY) return []
  if (Date.now() < coreReadyAt) return null
  const res = await fetch(`${CORE_API_BASE}/search/works?${new URLSearchParams({ q: passage, limit: '3' })}`, {
    headers: { Authorization: `Bearer ${process.env.CORE_API_KEY}` },
  })
  noteCoreRateLimit(res)
  if (res.status === 429) return null
  if (!res.ok) throw new Error(`CORE ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`)
  const data = await res.json()
  return (data.results || []).map((r) => ({
    title: r.title || 'Untitled work',
    authors: (r.authors || []).map((a) => a.name).filter(Boolean).join(', ') || 'Unknown authors',
    abstract: r.abstract || '',
    fullText: r.fullText || '',
    pdfUrls: new Set(r.downloadUrl ? [r.downloadUrl] : []),
  }))
}

// OpenAlex allows ~30 requests/second per key; the phrase and semantic checks both run several
// lookups at once, so request starts are spaced out globally to stay comfortably under that.
const OPENALEX_MIN_GAP_MS = 60
let openAlexNextSlot = 0

/** GETs /works with the API key attached, rate-limited, retrying once on a per-second 429.
 *  Throws on failure (including a spent daily budget, which retrying can't fix). */
async function openAlexWorks(params) {
  if (process.env.OPENALEX_API_KEY) params.set('api_key', process.env.OPENALEX_API_KEY)
  if (process.env.OPENALEX_MAILTO) params.set('mailto', process.env.OPENALEX_MAILTO)
  for (let attempt = 0; ; attempt++) {
    const slot = Math.max(Date.now(), openAlexNextSlot)
    openAlexNextSlot = slot + OPENALEX_MIN_GAP_MS
    await sleep(slot - Date.now())
    const res = await fetch(`https://api.openalex.org/works?${params}`)
    if (res.ok) return res.json()
    const body = await res.text().catch(() => '')
    if (res.status === 429 && attempt === 0 && !/budget/i.test(body)) {
      await sleep(1000)
      continue
    }
    throw new Error(`OpenAlex ${res.status}: ${body.slice(0, 200)}`)
  }
}

/** Searches OpenAlex's 250M+ work metadata index (every discipline). Abstracts only, no full
 *  text, but far higher rate limits and broader coverage than CORE. Keyless requests share one
 *  small daily budget per IP address and get a 429 once it's spent, so a free OPENALEX_API_KEY
 *  (openalex.org) is effectively required. Throws on a failed request, like searchCore. */
async function searchOpenAlex(passage) {
  const params = new URLSearchParams({
    search: passage,
    per_page: '5',
    select: 'title,authorships,abstract_inverted_index,locations',
  })
  const data = await openAlexWorks(params)
  return (data.results || []).map((w) => ({
    title: w.title || 'Untitled work',
    authors: (w.authorships || []).map((a) => a.author?.display_name).filter(Boolean).join(', ') || 'Unknown authors',
    abstract: reconstructAbstract(w.abstract_inverted_index),
    fullText: '',
    pdfUrls: new Set((w.locations || []).map((l) => l.pdf_url).filter(Boolean)),
  }))
}

/** Turns a passage into a plain keyword query. CORE parses its `q` as a query language, so a
 *  bare "and"/"or"/"not" — present in nearly every sentence of academic prose — is read as a
 *  boolean operator and the search silently returns 0 hits. Punctuation is stripped for the
 *  same reason (colons, parentheses and quotes are field/grouping syntax). */
function toSearchQuery(words, maxWords = 15) {
  return words
    .map((w) => w.replace(/[^\p{L}\p{N}-]/gu, ''))
    .filter((w) => w && !/^(and|or|not)$/i.test(w))
    .slice(0, maxWords)
    .join(' ')
}

/** Splits an abstract into passage-sized overlapping windows. Embedding a 60-word passage
 *  against a whole 300-word abstract dilutes the match — verbatim-copied text scores ~0.6,
 *  under the threshold — so each window is scored separately and the best one counts. */
function abstractWindows(abstract, windowWords, strideWords) {
  const words = abstract.split(/\s+/).filter(Boolean)
  if (words.length <= windowWords) return [words.join(' ')]
  const windows = []
  for (let i = 0; i < words.length; i += strideWords) {
    windows.push(words.slice(i, i + windowWords).join(' '))
    if (i + windowWords >= words.length) break
  }
  return windows
}

/** Merges candidates for the same paper (by title) from different providers, keeping the
 *  longest abstract, any full text, and every PDF link. */
function dedupeCandidates(candidates) {
  const byTitle = new Map()
  for (const c of candidates) {
    const key = c.title.toLowerCase().trim()
    const existing = byTitle.get(key)
    if (!existing) {
      byTitle.set(key, { ...c, pdfUrls: new Set(c.pdfUrls) })
      continue
    }
    if (c.abstract.length > existing.abstract.length) existing.abstract = c.abstract
    if (c.fullText.length > existing.fullText.length) existing.fullText = c.fullText
    for (const url of c.pdfUrls) existing.pdfUrls.add(url)
  }
  return [...byTitle.values()]
}

/** Runs `worker` over `items` with at most `limit` in flight at once, preserving order. */
async function mapPool(items, limit, worker) {
  const results = new Array(items.length)
  let next = 0
  const lane = async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await worker(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane))
  return results
}

/** Picks `count` items spread evenly across `items` (all of them if there are fewer). */
function spreadEvenly(items, count) {
  if (items.length <= count) return items
  return Array.from({ length: count }, (_, k) => items[Math.floor((k * items.length) / count)])
}

const STOPWORDS = new Set(
  'a an the of to in on for with by from at as is are was were be been being this that these those it its which who whom whose what when where why how than then there their they them we our us you your he she his her i me my not no nor so such can could may might must shall should will would do does did done has have had having also into onto over under more most less least very just only both each other some any all many much few same own about above below between through during before after again further once here while because if or and but'.split(' '),
)

/** Builds a keyword query from a passage's most distinctive words. Search engines rank long
 *  queries poorly, and the first 15 words of a passage are often generic framing ("In this
 *  section we describe the..."); content words from across the whole passage find the
 *  passage's actual topic, and so its likely source. */
function distinctiveQuery(words, maxWords = 12) {
  const seen = new Set()
  const picked = []
  for (const raw of toSearchQuery(words, Infinity).split(' ')) {
    const w = raw.toLowerCase()
    if (w.length < 4 || STOPWORDS.has(w) || seen.has(w) || /^\d+$/.test(w)) continue
    seen.add(w)
    picked.push(raw)
  }
  // Fall back to the plain query for passages that are mostly short or common words.
  return picked.length >= 5 ? picked.slice(0, maxWords).join(' ') : toSearchQuery(words)
}

const isContentWord = (w) => w.length >= 4 && !STOPWORDS.has(w.toLowerCase()) && !/^\d+$/.test(w)

/** Picks a run of `length` consecutive words starting near `from`, for exact-phrase lookup.
 *  Skips runs with broken line-wrap hyphens ("logis-tics", "con-"), which never match the
 *  source verbatim, and runs of mostly common words ("the results of this study show that"),
 *  which match thousands of unrelated papers. */
function pickPhrase(words, from, length) {
  const clean = words.map((w) => w.replace(/[^\p{L}\p{N}'-]/gu, ''))
  const ok = (w) => w && !/-$|^-|\p{Ll}-\p{Ll}{1,4}$/u.test(w) && !/^(and|or|not)$/i.test(w)
  for (let start = from; start + length <= clean.length && start < from + 15; start++) {
    const run = clean.slice(start, start + length)
    if (run.every(ok) && run.filter(isContentWord).length >= 5) return run.join(' ')
  }
  return null
}

const PHRASE_BATCH = 20
// A batch whose phrases match more papers than this contains stock academic wording, so its
// results are weak leads rather than likely sources.
const PRECISE_PHRASE_HITS = 10

/** Looks up exact phrases in OpenAlex's full-text index — n-grams of tens of millions of
 *  papers' bodies and abstracts — PHRASE_BATCH phrases OR-ed per request (same cost as one
 *  search). The papers that come back are leads, not verdicts: they join the full-text
 *  comparison's candidate pool, which decides which chunks actually overlap them. That keeps
 *  this at one request per batch even for a heavily copied paper, where splitting every hit
 *  batch to find the exact phrase would cost hundreds of requests. */
async function findPhraseSources(phrases) {
  const batches = []
  for (let i = 0; i < phrases.length; i += PHRASE_BATCH) batches.push(phrases.slice(i, i + PHRASE_BATCH))
  const leads = []
  const failedPhrases = new Set()
  let lastError = null
  await mapPool(batches, 4, async (batch) => {
    try {
      const data = await openAlexWorks(
        new URLSearchParams({
          filter: `fulltext.search:${batch.map((p) => `"${p}"`).join('|')}`,
          per_page: '5',
          select: 'title,authorships,locations',
        }),
      )
      const precise = (data.meta?.count || 0) <= PRECISE_PHRASE_HITS
      for (const w of data.results || []) {
        leads.push({
          precise,
          candidate: {
            title: w.title || 'Untitled work',
            authors: (w.authorships || []).map((a) => a.author?.display_name).filter(Boolean).join(', ') || 'Unknown authors',
            abstract: '',
            fullText: '',
            pdfUrls: new Set((w.locations || []).map((l) => l.pdf_url).filter(Boolean)),
          },
        })
      }
    } catch (err) {
      for (const p of batch) failedPhrases.add(p)
      lastError = err
    }
  })
  return { leads, failedPhrases, lastError }
}

// --- Full-text comparison -------------------------------------------------------------------
// Abstract comparison can only ever match the abstract-sized slice of a copied paper, and
// OpenAlex's phrase index covers only some papers' bodies (not even "Attention Is All You
// Need"). So the papers that the searches keep pointing at get their full text fetched — CORE
// often includes it in search results; otherwise the open-access PDF (arXiv first) is
// downloaded and parsed — and every chunk of the upload is compared against it directly.

const SHINGLE_WORDS = 5
// Share of a chunk's 5-word sequences that must also appear in a source's full text. Measured:
// a paper against its own published PDF scores well above this even with PDF extraction noise
// (footnotes, citation markers, split hyphens); original prose on the same topic stays near 0.
const FULLTEXT_MATCH_THRESHOLD = 0.25
const FULLTEXT_CANDIDATES = 6
const MAX_PDF_BYTES = 25 * 1024 * 1024

/** Lowercased word tokens with numbers dropped and line-wrap hyphens rejoined ("logis- tics"),
 *  so citation markers, footnote numbers and wrapping don't break otherwise identical text. */
function shingleTokens(text) {
  return text
    .replace(/(\p{L})-\s+(\p{L})/gu, '$1$2')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w && !/^\d+$/.test(w))
}

function shingleSet(tokens) {
  const set = new Set()
  for (let i = 0; i + SHINGLE_WORDS <= tokens.length; i++) set.add(tokens.slice(i, i + SHINGLE_WORDS).join(' '))
  return set
}

async function extractPdfText(data) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const loadingTask = pdfjs.getDocument({ data, verbosity: 0 })
  const doc = await loadingTask.promise
  try {
    const pages = []
    for (let i = 1; i <= Math.min(doc.numPages, 80); i++) {
      const content = await (await doc.getPage(i)).getTextContent()
      pages.push(content.items.map((item) => item.str || '').join(' '))
    }
    return pages.join(' ')
  } finally {
    await loadingTask.destroy()
  }
}

/** Full text for a candidate: CORE's inline text if present, else its open-access PDF. */
async function fetchFullText(candidate) {
  if (candidate.fullText && candidate.fullText.length > 2000) return candidate.fullText
  const urls = [...candidate.pdfUrls].sort((a, b) => Number(b.includes('arxiv.org')) - Number(a.includes('arxiv.org')))
  for (const url of urls.slice(0, 2)) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { 'User-Agent': 'Scholarly/1.0 (similarity check)' } })
      if (!res.ok || Number(res.headers.get('content-length') || 0) > MAX_PDF_BYTES) continue
      const data = new Uint8Array(await res.arrayBuffer())
      if (data.length > MAX_PDF_BYTES || String.fromCharCode(...data.slice(0, 4)) !== '%PDF') continue
      const text = await extractPdfText(data)
      if (text.length > 2000) return text
    } catch (err) {
      console.error(`[server] could not fetch full text from ${url}:`, err.message)
    }
  }
  return null
}

/** Ranks every candidate the searches returned by how many chunks pointed at it, fetches full
 *  text for the top few, and returns chunk -> best { source, overlap } above the threshold. */
async function compareAgainstFullTexts(chunks, candidateVotes) {
  const ranked = [...candidateVotes.values()]
    .filter((v) => (v.candidate.fullText && v.candidate.fullText.length > 2000) || v.candidate.pdfUrls.size > 0)
    .sort((a, b) => b.votes - a.votes || b.bestSim - a.bestSim)
    .slice(0, FULLTEXT_CANDIDATES)
  const texts = await Promise.all(ranked.map((v) => fetchFullText(v.candidate)))
  const sources = ranked
    .map((v, i) => (texts[i] ? { candidate: v.candidate, shingles: shingleSet(shingleTokens(texts[i])) } : null))
    .filter(Boolean)
  console.log(`[server] full-text comparison against ${sources.length}/${ranked.length} top candidates:`, sources.map((s) => s.candidate.title))

  const matches = new Map()
  for (const chunk of chunks) {
    const own = shingleSet(shingleTokens(chunk.text))
    if (own.size < 8) continue
    for (const source of sources) {
      let hits = 0
      for (const s of own) if (source.shingles.has(s)) hits += 1
      const overlap = hits / own.size
      if (overlap >= FULLTEXT_MATCH_THRESHOLD && overlap > (matches.get(chunk)?.overlap ?? 0)) {
        matches.set(chunk, { candidate: source.candidate, overlap })
      }
    }
  }
  return matches
}

/** Checks the paper against OpenAlex and CORE three complementary ways:
 *  - Exact phrases, across the WHOLE paper: two 10-word phrases from every 60-word chunk are
 *    looked up in OpenAlex's full-text index, ~1 request per 10 chunks, to find source papers
 *    that topic searches might not surface.
 *  - Semantic, on a sample spread evenly across the paper: each passage's distinctive keywords
 *    find candidate papers, then OpenAI embeddings score the passage against windows of each
 *    candidate's abstract — catching close paraphrase that exact phrases miss. This costs a
 *    search per passage, so it's sampled to stay within OpenAlex's free daily budget.
 *  - Full text, across the WHOLE paper: the papers those searches return most often have their
 *    full text fetched, and every chunk is compared against it by shared 5-word sequences —
 *    the check that catches copying from the body of an open-access paper.
 *  The score is the share of the paper's chunks flagged by any check. */
async function checkExternalSimilarity(sections) {
  if (!openai) return { checked: false, overallSimilarityPercent: 0, similaritySources: [], similarityWarning: null }

  const CHUNK_WORDS = 60
  const SEMANTIC_PASSAGES = 30
  const CORE_PASSAGES = 9
  const PHRASE_WORDS = 10
  const CONCURRENCY = 5

  const chunks = []
  for (const s of sections) {
    const words = s.text.split(/\s+/).filter(Boolean)
    for (let i = 0; i < words.length; i += CHUNK_WORDS) {
      const chunkWords = words.slice(i, i + CHUNK_WORDS)
      if (chunkWords.length < 20) continue
      const phrases = [pickPhrase(chunkWords, 5, PHRASE_WORDS), pickPhrase(chunkWords, 35, PHRASE_WORDS)].filter(Boolean)
      chunks.push({ words: chunkWords, text: chunkWords.join(' '), phrases: [...new Set(phrases)] })
    }
  }
  if (chunks.length === 0) return { checked: true, overallSimilarityPercent: 0, similaritySources: [], similarityWarning: null }
  const sampled = spreadEvenly(chunks, SEMANTIC_PASSAGES)
  const coreSampled = new Set(spreadEvenly(sampled, CORE_PASSAGES))

  const failures = { OpenAlex: { count: 0, lastError: '' }, CORE: { count: 0, lastError: '' } }
  const fail = (name, err, n = 1) => {
    failures[name].count += n
    failures[name].lastError = err?.message || String(err)
  }

  // Every candidate any search returned, with how many chunks pointed at it — the papers a
  // copied text came from come back again and again, so they rank first for full-text fetch.
  const candidateVotes = new Map()

  const semanticCheck = async (chunk) => {
    const query = distinctiveQuery(chunk.words)
    // null = CORE not asked for this passage, or skipped for its rate limit — not a search.
    const [coreOutcome, openAlexOutcome] = await Promise.allSettled([
      coreSampled.has(chunk) ? searchCore(query) : Promise.resolve(null),
      searchOpenAlex(query),
    ])
    if (coreOutcome.status === 'rejected') fail('CORE', coreOutcome.reason)
    if (openAlexOutcome.status === 'rejected') fail('OpenAlex', openAlexOutcome.reason)
    const coreSearched = coreOutcome.status === 'fulfilled' && coreOutcome.value !== null
    if (openAlexOutcome.status === 'rejected' && !coreSearched) return { searched: false }

    const ok = (outcome) => (outcome.status === 'fulfilled' && outcome.value ? outcome.value : [])
    const found = dedupeCandidates([...ok(coreOutcome), ...ok(openAlexOutcome)])
    for (const c of found) {
      const key = c.title.toLowerCase().trim()
      const vote = candidateVotes.get(key)
      if (!vote) candidateVotes.set(key, { candidate: c, votes: 1, bestSim: 0 })
      else {
        vote.votes += 1
        vote.candidate = dedupeCandidates([vote.candidate, c])[0]
      }
    }
    const candidates = found.filter((c) => c.abstract.length > 40)
    if (candidates.length === 0) return { searched: true }
    try {
      const windows = candidates.flatMap((candidate) =>
        abstractWindows(candidate.abstract, CHUNK_WORDS, CHUNK_WORDS / 2).map((text) => ({ candidate, text })),
      )
      const embedRes = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: [chunk.text, ...windows.map((w) => w.text)],
      })
      const vectors = embedRes.data.map((d) => d.embedding)
      let best = null
      for (let i = 0; i < windows.length; i++) {
        const sim = cosine(vectors[0], vectors[i + 1])
        if (!best || sim > best.sim) best = { sim, candidate: windows[i].candidate }
      }
      for (let i = 0; i < windows.length; i++) {
        const vote = candidateVotes.get(windows[i].candidate.title.toLowerCase().trim())
        if (vote) vote.bestSim = Math.max(vote.bestSim, cosine(vectors[0], vectors[i + 1]))
      }
      if (best && best.sim >= EXTERNAL_MATCH_THRESHOLD) {
        return {
          searched: true,
          source: {
            title: best.candidate.title,
            authors: best.candidate.authors,
            matchPercent: Math.round(best.sim * 1000) / 10,
            matchType: 'semantic',
            matchedExcerpt: chunk.text,
          },
        }
      }
    } catch (err) {
      console.error('[server] embedding a passage for external similarity failed, continuing:', err.message)
    }
    return { searched: true }
  }

  const [phraseSearch, semanticResults] = await Promise.all([
    findPhraseSources(chunks.flatMap((c) => c.phrases)),
    mapPool(sampled, CONCURRENCY, semanticCheck),
  ])
  if (phraseSearch.failedPhrases.size) fail('OpenAlex', phraseSearch.lastError, Math.ceil(phraseSearch.failedPhrases.size / PHRASE_BATCH))
  // A precise phrase hit is strong evidence, so it outranks papers that only came up in topic
  // searches when choosing which full texts to fetch.
  for (const { precise, candidate } of phraseSearch.leads) {
    const key = candidate.title.toLowerCase().trim()
    const vote = candidateVotes.get(key)
    if (!vote) candidateVotes.set(key, { candidate, votes: precise ? 3 : 1, bestSim: 0 })
    else {
      vote.votes += precise ? 3 : 1
      vote.candidate = dedupeCandidates([vote.candidate, candidate])[0]
    }
  }
  const semanticByChunk = new Map(sampled.map((c, i) => [c, semanticResults[i]]))
  let fullTextMatches = new Map()
  try {
    fullTextMatches = await compareAgainstFullTexts(chunks, candidateVotes)
  } catch (err) {
    console.error('[server] full-text comparison failed, continuing without it:', err.message)
  }

  const matched = []
  let checkedChunks = 0
  for (const chunk of chunks) {
    const phraseChecked = chunk.phrases.some((p) => !phraseSearch.failedPhrases.has(p))
    const semantic = semanticByChunk.get(chunk)
    const fullText = fullTextMatches.get(chunk)
    if (!phraseChecked && !semantic?.searched && !fullText) continue
    checkedChunks += 1
    if (fullText) {
      matched.push({
        id: nextId('sim'),
        title: fullText.candidate.title,
        authors: fullText.candidate.authors,
        matchPercent: Math.round(fullText.overlap * 1000) / 10,
        matchType: 'fulltext',
        matchedExcerpt: chunk.text,
      })
    } else if (semantic?.source) {
      matched.push({ id: nextId('sim'), ...semantic.source })
    }
  }

  // Search failures are reported rather than folded into the score — a provider that errored
  // on every passage would otherwise read as "0% similar", which is a claim nobody checked.
  const warnings = Object.entries(failures)
    .filter(([, f]) => f.count > 0)
    .map(([name, f]) => {
      console.error(`[server] ${name} had ${f.count} failed lookups. Last error:`, f.lastError)
      const hint = /OpenAlex 429/.test(f.lastError) && /budget/i.test(f.lastError)
        ? ' — the daily OpenAlex budget is used up (it resets at midnight UTC); check OPENALEX_API_KEY in .env.'
        : `: ${f.lastError}`
      return `${name}: ${f.count} lookup${f.count === 1 ? '' : 's'} failed${hint}`
    })

  // Several chunks can match the same paper; list each paper once, at its strongest match.
  const bestPerSource = new Map()
  for (const m of matched) {
    const key = m.title.toLowerCase().trim()
    if (!bestPerSource.has(key) || bestPerSource.get(key).matchPercent < m.matchPercent) bestPerSource.set(key, m)
  }
  return {
    checked: checkedChunks > 0,
    overallSimilarityPercent: checkedChunks ? Math.round((matched.length / checkedChunks) * 1000) / 10 : 0,
    similaritySources: [...bestPerSource.values()].sort((a, b) => b.matchPercent - a.matchPercent).slice(0, 8),
    similarityWarning: warnings.length ? warnings.join(' ') : null,
  }
}

/** Flags near-duplicate passages within the document itself (across different sections), via
 *  OpenAI embeddings — repetition, not external copying. */
async function checkSelfSimilarity(sections) {
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
    if (!openai || units.length < 2) return []
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
    return groups
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
  } catch (embedErr) {
    console.error('[server] self-similarity embeddings step failed, continuing without it:', embedErr.message)
    return []
  }
}

app.post('/api/analyze', analyzePerIp, analyzeDaily, async (req, res) => {
  try {
    const { fileName, fullText, sections } = req.body
    if (!fullText || !Array.isArray(sections)) {
      return res.status(400).json({ error: 'fullText and sections are required' })
    }
    const sectionText = clip(renderSections(sections))

    const started = Date.now()
    const timed = (label, promise) =>
      promise.finally(() => console.log(`[server] ${label} finished in ${((Date.now() - started) / 1000).toFixed(1)}s`))

    const [findings, writing, externalSimilarity, selfSimilarityMatches] = await Promise.all([
      timed('consistency & novelty (Sonnet)', callTool({
        model: SONNET,
        system:
          'You are an academic integrity and research-quality reviewer. You read a student/researcher paper and find REAL internal contradictions (conflicting numbers, dataset sizes, model names, methodology claims) and assess novelty against general knowledge of the field. Be conservative: only report issues you are confident about, grounded in exact quotes from the text. Do not report repeated or copied text as a contradiction — repetition is checked separately. If the paper is clean, return an empty array rather than inventing issues.',
        userText: `File: ${fileName}\n\n${sectionText}`,
        tool: findingsTool,
      })),
      timed('writing & citations (Haiku)', callTool({
        model: HAIKU,
        system:
          'You are a writing-clarity editor for academic papers. Find real clarity/concision/tone issues and strong claims lacking citations. Always flag informal contractions (don\'t, can\'t, it\'s, doesn\'t) and filler phrases (a lot of, kind of, really) as tone or concision issues. Preserve numbers, citations, and technical meaning. Be conservative otherwise — only flag things genuinely worth fixing. "suggested" must always be the literal replacement text to substitute for "original", verbatim — never a meta-instruction like "Delete this sentence" or "Rephrase for clarity". If the right fix is to delete the sentence entirely, set "suggested" to an empty string.',
        userText: `File: ${fileName}\n\n${sectionText}`,
        tool: writingTool,
      })),
      timed('external similarity', checkExternalSimilarity(sections)),
      timed('internal repetition', checkSelfSimilarity(sections)),
    ])

    // Defaults guard against a truncated tool call — one missing list shouldn't fail the analysis.
    const consistencyIssues = (findings.consistencyIssues ?? []).map((i) => ({ id: nextId('ci'), status: 'open', ...i }))
    const writingSuggestions = (writing.writingSuggestions ?? []).map((s) => ({ id: nextId('ws'), status: 'pending', ...s }))
    const citationGaps = (writing.citationGaps ?? []).map((g) => ({ id: nextId('cg'), ...g }))
    const noveltyPoints = (findings.noveltyPoints ?? []).map((n) => ({ id: nextId('np'), ...n }))

    res.json({
      consistencyIssues,
      writingSuggestions,
      citationGaps,
      noveltyPoints,
      suggestedQuestions: findings.suggestedQuestions ?? [],
      selfSimilarityMatches,
      similarityCorpusChecked: externalSimilarity.checked,
      overallSimilarityPercent: externalSimilarity.overallSimilarityPercent,
      similaritySources: externalSimilarity.similaritySources,
      similarityWarning: externalSimilarity.similarityWarning,
    })
  } catch (err) {
    console.error('[server] /api/analyze failed:', err)
    res.status(500).json({ error: err.message || 'Analysis failed' })
  }
})

app.post('/api/ask', askPerIp, async (req, res) => {
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

// Production: serve the built site (npm run build -> dist/) from this same server, with
// client-side routes like /paper/:id falling back to index.html.
const distDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')
if (existsSync(path.join(distDir, 'index.html'))) {
  app.use(express.static(distDir, { index: false, maxAge: '1h' }))
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(distDir, 'index.html')))
}
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }))

app.listen(PORT, () => {
  console.log(`[server] Scholarly API listening on http://localhost:${PORT}`)
})
