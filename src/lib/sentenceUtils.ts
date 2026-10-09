export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

export function excerpt(text: string, maxLen = 150): string {
  const trimmed = text.trim()
  if (trimmed.length <= maxLen) return trimmed
  return trimmed.slice(0, maxLen).replace(/\s+\S*$/, '') + '...'
}

let idCounter = 0
export function nextLocalId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`
}
