// Anonymous visitors get one free analysis per browser. The server enforces this too (by
// anonymous id and by IP); this local record only lets the page ask for sign-up *before* a
// document is extracted and uploaded.
const ANON_ID_KEY = 'scholarly.anonId'
const FREE_USED_KEY = 'scholarly.freeUsed'

export function getAnonId(): string {
  try {
    let id = localStorage.getItem(ANON_ID_KEY)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(ANON_ID_KEY, id)
    }
    return id
  } catch {
    return 'unavailable'
  }
}

export function hasUsedFreeAnalysis(): boolean {
  try {
    return localStorage.getItem(FREE_USED_KEY) === '1'
  } catch {
    return false
  }
}

export function markFreeAnalysisUsed() {
  try {
    localStorage.setItem(FREE_USED_KEY, '1')
  } catch {
    /* private mode: the server-side check still applies */
  }
}
