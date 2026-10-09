import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Sparkles, BookOpen, User } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import { useCurrentPaper } from '../hooks/useCurrentPaper'
import { getMockAnswer } from '../data/askMyPaper'
import { getRealAnswer } from '../lib/realAnswerEngine'
import { getAIAnswer } from '../lib/aiAnswerEngine'
import type { ChatMessage } from '../types'

let msgId = 0
const nextId = () => `m-${msgId++}`

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-ink-muted"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
        />
      ))}
    </div>
  )
}

export default function AskPaperPage() {
  const { paper } = useCurrentPaper()
  const isHeuristic = paper?.analysisMode === 'heuristic'
  const isAI = paper?.analysisMode === 'ai'

  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: nextId(),
      role: 'assistant',
      content: isHeuristic
        ? `I've extracted the text from "${paper!.title}" and run the pattern-based checks on it. I don't have real semantic understanding (no LLM backend is wired up), but I can ground answers in what those checks actually found. Ask me anything, or try a suggestion below.`
        : isAI
          ? `I've read "${paper!.title}" in full. Ask me about any section, or try one of the suggested questions below — answers are grounded in your actual document, via Claude.`
          : `I've read "${paper?.title}". Ask me about any section, or try one of the suggested questions below.`,
    },
  ])
  const [input, setInput] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const isFirstRender = useRef(true)

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [messages, isThinking])

  if (!paper) return null

  const send = async (text: string) => {
    if (!text.trim()) return
    const userMsg: ChatMessage = { id: nextId(), role: 'user', content: text }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setIsThinking(true)

    if (isAI) {
      try {
        const answer = await getAIAnswer(paper, text)
        setMessages((prev) => [
          ...prev,
          { id: nextId(), role: 'assistant', content: answer.content, groundedIn: answer.groundedIn },
        ])
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            id: nextId(),
            role: 'assistant',
            content: err instanceof Error ? `Couldn't reach the server: ${err.message}` : 'Something went wrong.',
          },
        ])
      } finally {
        setIsThinking(false)
      }
      return
    }

    setTimeout(() => {
      const answer = isHeuristic ? getRealAnswer(paper, text) : getMockAnswer(text)
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: 'assistant', content: answer.content, groundedIn: answer.groundedIn },
      ])
      setIsThinking(false)
    }, 700)
  }

  return (
    <div className="flex flex-col">
      <PageHeader eyebrow="talk to your paper" title="Ask My Paper" description="Document-grounded answers, viva questions, and claim checks." />

      <div className="flex min-h-[55vh] flex-col gap-4">
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className={`mx-auto flex w-full max-w-2xl items-end gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {m.role === 'assistant' && (
                <div className="ink-border flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sticky-purple text-ink-on-sticky">
                  <Sparkles size={14} />
                </div>
              )}
              <div
                className={`ink-border max-w-[80%] rounded-2xl px-4 py-3 text-sm shadow-[var(--shadow-card)] ${
                  m.role === 'user' ? 'rounded-br-sm bg-ink text-paper' : 'rounded-bl-sm bg-surface text-ink-2'
                }`}
              >
                <p className="whitespace-pre-wrap">{m.content}</p>
                {m.groundedIn && m.groundedIn.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5 border-t-[1.5px] border-line-soft pt-2">
                    {m.groundedIn.map((g) => (
                      <span key={g} className="flex items-center gap-1 rounded-full bg-paper px-2 py-0.5 text-xs text-ink-muted">
                        <BookOpen size={11} />
                        {g}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {m.role === 'user' && (
                <div className="ink-border flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sticky-yellow text-ink-on-sticky">
                  <User size={14} />
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {isThinking && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mx-auto flex w-full max-w-2xl items-end gap-2">
            <div className="ink-border flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sticky-purple text-ink-on-sticky">
              <Sparkles size={14} />
            </div>
            <div className="ink-border rounded-2xl rounded-bl-sm bg-surface px-3 py-2 shadow-[var(--shadow-card)]">
              <TypingDots />
            </div>
          </motion.div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="sticky bottom-3 mt-4">
        <div className="mx-auto w-full max-w-2xl">
          {messages.length <= 1 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {paper.suggestedQuestions.map((q, i) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  style={{ transform: `rotate(${i % 2 === 0 ? -1 : 1}deg)` }}
                  className="ink-border rounded-full bg-surface-raised px-3 py-1.5 text-xs font-semibold text-ink-2 shadow-[var(--shadow-card)] transition-colors hover:bg-sticky-yellow hover:text-ink-on-sticky"
                >
                  {q}
                </button>
              ))}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              send(input)
            }}
            className="ink-border flex items-center gap-2 rounded-full bg-surface-raised p-1.5 shadow-[var(--shadow-card)]"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything about your paper..."
              className="flex-1 bg-transparent px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-muted"
            />
            <motion.button
              whileTap={{ scale: 0.92 }}
              type="submit"
              className="ink-border flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-paper"
            >
              <Send size={16} />
            </motion.button>
          </form>
        </div>
      </div>
    </div>
  )
}
