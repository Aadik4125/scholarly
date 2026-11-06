// Sends a Google Analytics (GA4) event. gtag is loaded by the tag in index.html; if it's
// blocked (ad blockers, privacy settings) this does nothing.
export function track(event: string, params: Record<string, string | number | boolean> = {}) {
  ;(window as { gtag?: (...args: unknown[]) => void }).gtag?.('event', event, params)
}
