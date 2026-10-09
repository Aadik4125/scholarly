import type { Paper } from '../types'

export async function getAIAnswer(paper: Paper, question: string): Promise<{ content: string; groundedIn?: string[] }> {
  const res = await fetch('/api/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: paper.fileName,
      title: paper.title,
      fullText: paper.fullText ?? '',
      question,
    }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Ask request failed (${res.status})`)
  }
  return res.json()
}
