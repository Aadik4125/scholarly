import { MessageSquareHeart } from 'lucide-react'

// Temporary, for the friends-and-testers round. Paste the Google Form link here; the button
// stays hidden while it's empty. Delete this file and its line in App.tsx to remove it.
const FEEDBACK_URL = 'https://forms.gle/7zAZzMAy8hEjt4UbA'

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
      className="ink-border fixed bottom-5 left-5 z-40 inline-flex items-center gap-2 rounded-full bg-sticky-yellow px-4 py-2 text-sm font-bold text-ink-on-sticky shadow-md transition-transform hover:-translate-y-0.5"
    >
      <MessageSquareHeart size={16} strokeWidth={2.5} />
      Give feedback
    </a>
  )
}
