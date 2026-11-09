import { MessageSquareHeart } from 'lucide-react'

// Temporary, for the friends-and-testers round. Paste the Google Form link here; the button
// stays hidden while it's empty. Delete this file and its line in App.tsx to remove it.
export const FEEDBACK_URL = 'https://forms.gle/7zAZzMAy8hEjt4UbA'

export default function FeedbackButton() {
  if (!FEEDBACK_URL) return null
  return (
    <a
      href={FEEDBACK_URL}
      target="_blank"
      rel="noopener noreferrer"
      // Counted in Google Analytics as a "feedback_click" event.
      onClick={() => (window as { gtag?: (...args: unknown[]) => void }).gtag?.('event', 'feedback_click')}
      style={{ transform: 'rotate(-2deg)' }}
      title="Give feedback"
      aria-label="Give feedback"
      // On phones it's a small round icon so it doesn't sit on top of the page text.
      className="ink-border fixed bottom-4 left-4 z-40 inline-flex h-10 w-10 items-center justify-center gap-2 rounded-full bg-sticky-yellow text-sm font-bold text-ink-on-sticky shadow-md transition-transform hover:-translate-y-0.5 sm:bottom-5 sm:left-5 sm:h-auto sm:w-auto sm:px-4 sm:py-2"
    >
      <MessageSquareHeart size={16} strokeWidth={2.5} />
      <span className="hidden sm:inline">Give feedback</span>
    </a>
  )
}
