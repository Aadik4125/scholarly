// Sends events to Google Analytics when the gtag snippet is present on the page; a no-op otherwise.
export function trackEvent(name: string, params: Record<string, unknown> = {}) {
  try {
    const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag
    gtag?.('event', name, params)
  } catch {
    /* analytics must never break the app */
  }
}
