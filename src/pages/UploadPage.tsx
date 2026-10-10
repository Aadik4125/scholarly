import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileText,
  UploadCloud,
  ShieldCheck,
  MessageCircleQuestion,
  PenLine,
  Check,
  Loader2,
  Moon,
  Sun,
} from 'lucide-react'
import { useTheme } from '../hooks/useTheme'
import { useSessionFile } from '../hooks/useSessionFile'
import { useToast } from '../hooks/useToast'
import { analyzePaperWithAI } from '../lib/aiEngine'
import { savePaper } from '../lib/paperDb'
import StickyTag from '../components/StickyTag'
import Polaroid from '../components/Polaroid'

// Uploading a real file runs the actual analysis pipeline: text is extracted in the
// browser, then sent to the backend (/api/analyze) where Claude finds contradictions and
// novelty, Claude Haiku checks writing/citations, and OpenAI embeddings flag internal
// near-duplicate passages. The result is persisted to IndexedDB (lib/paperDb) and the
// dashboard navigates to that real paper. "Try a sample paper" stays on the curated demo
// data — zero cost, always works, good for a quick look without an upload.

const steps = [
  'Extracting document structure',
  'Running the consistency engine',
  'Scanning for unsupported claims',
  'Preparing your dashboard',
]

export default function UploadPage() {
  const navigate = useNavigate()
  const { theme, toggle } = useTheme()
  const { setSessionFile } = useSessionFile()
  const { push } = useToast()
  const [isDragging, setIsDragging] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [stepIndex, setStepIndex] = useState(-1)

  const isProcessing = fileName !== null

  const runDemoProcessing = useCallback(
    (displayName: string) => {
      setFileName(displayName)
      setStepIndex(0)
      steps.forEach((_, i) => {
        setTimeout(() => setStepIndex(i + 1), 450 + i * 420)
      })
      setTimeout(() => navigate('/paper/demo'), 450 + steps.length * 420 + 300)
    },
    [navigate],
  )

  const handleRealFile = useCallback(
    async (file: File) => {
      setSessionFile(file)
      setFileName(file.name)
      setStepIndex(0)
      try {
        const paper = await analyzePaperWithAI(file, setStepIndex)
        setStepIndex(steps.length)
        const id = await savePaper(file, paper)
        navigate(`/paper/${id}`)
      } catch (err) {
        console.error(err)
        push(err instanceof Error ? err.message : 'Analysis failed. Check the server and API keys.', 'neutral')
        setFileName(null)
        setStepIndex(-1)
      }
    },
    [setSessionFile, navigate, push],
  )
  const handleSample = useCallback(() => {
    setSessionFile(null)
    runDemoProcessing('dropout-prediction-draft3.pdf')
  }, [setSessionFile, runDemoProcessing])

  return (
    <div className="relative min-h-screen overflow-hidden">
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-5 py-6">
        <div className="flex items-center gap-2">
          <span className="ink-border flex h-8 w-8 items-center justify-center rounded-full bg-ink text-paper">
            <FileText size={16} />
          </span>
          <span className="font-display text-xl tracking-wide text-ink">SCHOLARLY</span>
        </div>
        <button
          onClick={toggle}
          className="ink-border flex h-9 w-9 items-center justify-center rounded-full bg-surface text-ink hover:bg-surface-hover"
          title="Toggle theme"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </header>

      <main className="relative mx-auto max-w-3xl px-6 pt-6 pb-24 text-center">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-10 flex justify-center">
          <div className="relative h-0 w-full max-w-xl">
            <div className="absolute -left-4 top-6 hidden sm:block">
              <StickyTag color="green" rotate={-6}>✦ no project form</StickyTag>
            </div>
            <div className="absolute -right-2 top-0 hidden sm:block">
              <StickyTag color="pink" rotate={6}>upload & go</StickyTag>
            </div>
          </div>
        </div>

        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="font-hand text-2xl text-ink-2"
          style={{ transform: 'rotate(-1.5deg)' }}
        >
          one upload is all it takes
        </motion.p>

        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.08 }}
          className="ink-border mx-auto mt-3 inline-block rounded-2xl bg-surface px-6 py-3 shadow-[var(--shadow-card)]"
        >
          <h1 className="font-display text-5xl tracking-wide text-ink sm:text-6xl">SCHOLARLY</h1>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.14 }}
          className="mx-auto mt-5 max-w-md text-ink-2"
        >
          I check your paper for contradictions, missing citations, and shaky prose — then help you fix them. ✦
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          onDragOver={(e) => {
            e.preventDefault()
            if (!isProcessing) setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setIsDragging(false)
            if (isProcessing) return
            const file = e.dataTransfer.files[0]
            if (file) handleRealFile(file)
          }}
          className={`ink-border mx-auto mt-8 flex min-h-[260px] max-w-xl flex-col items-center justify-center gap-3 rounded-3xl px-8 py-14 shadow-[var(--shadow-card)] transition-colors ${
            isDragging ? 'bg-sticky-yellow' : 'bg-surface'
          }`}
        >
          <AnimatePresence mode="wait">
            {!isProcessing ? (
              <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-3">
                <UploadCloud size={32} className="text-ink-2" />
                <p className="text-sm font-bold text-ink">Drag and drop your paper here</p>
                <p className="text-xs text-ink-muted">PDF or DOCX, up to 40 pages</p>
                <label className="ink-border mt-2 cursor-pointer rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-paper shadow-[var(--shadow-pop)] transition-transform hover:-translate-y-0.5 active:translate-y-0">
                  Browse files
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      // Reset so picking the same file again (e.g. a re-exported draft with
                      // an unchanged name) still fires this handler — browsers don't fire
                      // 'change' a second time if the input's value didn't change.
                      e.target.value = ''
                      if (file) handleRealFile(file)
                    }}
                  />
                </label>
                <button
                  onClick={handleSample}
                  className="mt-1 font-hand text-lg text-ink-2 underline decoration-dotted underline-offset-4 hover:text-ink"
                >
                  or try it with a sample paper
                </button>
              </motion.div>
            ) : (
              <motion.div key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex w-full max-w-sm flex-col items-center gap-5">
                <div className="ink-border flex h-12 w-12 items-center justify-center rounded-full bg-sticky-yellow text-ink-on-sticky">
                  <FileText size={22} />
                </div>
                <p className="text-sm font-bold text-ink">{fileName}</p>

                <div className="flex w-full flex-col gap-2.5">
                  {steps.map((label, i) => {
                    const done = stepIndex > i
                    const active = stepIndex === i
                    return (
                      <div key={label} className="flex items-center gap-3 text-left">
                        <div
                          className={`ink-border flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors ${
                            done ? 'bg-sticky-green text-ink-on-sticky' : active ? 'bg-sticky-yellow text-ink-on-sticky' : 'bg-surface text-transparent'
                          }`}
                        >
                          {done ? <Check size={12} /> : active ? <Loader2 size={12} className="animate-spin" /> : null}
                        </div>
                        <span className={`text-sm font-medium ${done || active ? 'text-ink' : 'text-ink-muted'}`}>{label}</span>
                      </div>
                    )
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.28 }}
          className="mt-14 flex flex-wrap items-center justify-center gap-6"
        >
          <Polaroid caption="findings" rotate={-5} tape="pink" width={110}>
            <ShieldCheck size={32} className="text-ink/60" />
          </Polaroid>
          <div className="flex flex-col gap-3 text-left">
            <Feature icon={ShieldCheck} title="Consistency checks" description="Catch contradictions in numbers, methods, and models." rotate={-1} />
            <Feature icon={MessageCircleQuestion} title="Ask My Paper" description="Grounded answers and likely viva questions." rotate={1} />
            <Feature icon={PenLine} title="Writing improvement" description="Clarity and tone edits that preserve meaning." rotate={-1} />
          </div>
          <Polaroid caption="paper.pdf" rotate={4} tape="yellow" width={110}>
            <FileText size={32} className="text-ink/60" />
          </Polaroid>
        </motion.div>
      </main>
    </div>
  )
}

function Feature({ icon: Icon, title, description, rotate }: { icon: typeof ShieldCheck; title: string; description: string; rotate: number }) {
  return (
    <div
      style={{ transform: `rotate(${rotate}deg)` }}
      className="ink-border flex items-center gap-3 rounded-2xl bg-surface px-4 py-3 shadow-[var(--shadow-card)]"
    >
      <Icon size={18} className="shrink-0 text-ink" />
      <div>
        <p className="text-sm font-bold text-ink">{title}</p>
        <p className="text-xs text-ink-2">{description}</p>
      </div>
    </div>
  )
}
