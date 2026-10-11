# Scholarly

AI academic research & integrity copilot: upload a paper (PDF/DOCX) to get consistency checks,
writing suggestions, citation gaps, novelty notes, and external/internal similarity.

## Local development

```bash
npm ci
cp .env.example .env   # or create .env with the keys below
npm run dev            # Vite on :5173, API on :8787 (proxied under /api)
```

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | Consistency, novelty, writing, Ask My Paper |
| `OPENAI_API_KEY` | recommended | Embeddings for similarity checks |
| `OPENALEX_API_KEY` | recommended | External similarity search (free tier ≈ $1/day of requests) |
| `CORE_API_KEY` | optional | Extra open-access full-text corpus |
| `OPENALEX_MAILTO` | optional | Contact email for OpenAlex |
| `PORT` | no | Server port (default 8787; hosts usually set it) |
| `ANALYZE_LIMIT_PER_HOUR` | no | Analyses per visitor per hour (default 5) |
| `ANALYZE_LIMIT_PER_DAY` | no | Analyses site-wide per day (default 100) |
| `ASK_LIMIT_PER_HOUR` | no | Ask My Paper questions per visitor per hour (default 40) |
| `ALLOWED_ORIGINS` | no | Comma-separated origins allowed to call the API cross-origin (default: none — same origin only) |
| `TRUST_PROXY` | no | Proxy hops in front of the server (default 1 in production, 0 otherwise) |

## Production

```bash
npm ci
npm run build   # type-checks and builds the site into dist/
npm start       # serves dist/ and /api from one Node server on $PORT
```

On Render / Railway: build command `npm ci && npm run build`, start command `npm start`,
and add the environment variables above in the host's dashboard (never commit `.env`).
Also set monthly spending limits in the Anthropic and OpenAI consoles.

Papers and results are stored in each visitor's browser (IndexedDB); the server stores nothing.
