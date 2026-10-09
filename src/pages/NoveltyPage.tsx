import { motion } from 'framer-motion'
import { Sparkles, GitCompare, Lightbulb, PlugZap } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import type { StickyColor } from '../components/StickyTag'
import { useCurrentPaper } from '../hooks/useCurrentPaper'
import type { NoveltyPoint } from '../types'

const groups: { type: NoveltyPoint['type']; title: string; icon: typeof Sparkles; tone: StickyColor }[] = [
  { type: 'distinctive', title: 'What appears distinctive', icon: Sparkles, tone: 'green' },
  { type: 'overlap', title: 'Where this overlaps with existing work', icon: GitCompare, tone: 'yellow' },
  { type: 'suggestion', title: 'How to strengthen it', icon: Lightbulb, tone: 'blue' },
]

const toneBg: Record<StickyColor, string> = {
  yellow: 'bg-sticky-yellow',
  pink: 'bg-sticky-pink',
  green: 'bg-sticky-green',
  blue: 'bg-sticky-blue',
  purple: 'bg-sticky-purple',
  peach: 'bg-sticky-peach',
}

export default function NoveltyPage() {
  const { paper } = useCurrentPaper()
  if (!paper) return null

  const isHeuristic = paper.analysisMode === 'heuristic'

  return (
    <div>
      <PageHeader
        eyebrow="judging the contribution"
        title="Novelty Assessment"
        description="A qualitative, sourced assessment of contribution — not a single numerical score."
      />

      {isHeuristic ? (
        <div className="ink-border card-pop flex flex-col items-start gap-2 rounded-3xl bg-surface-hover p-6 shadow-[var(--shadow-card)]">
          <span className="ink-border flex h-10 w-10 items-center justify-center rounded-full bg-white text-ink-muted">
            <PlugZap size={18} />
          </span>
          <p className="mt-2 text-sm font-bold text-ink">Novelty assessment isn't available for uploaded papers yet</p>
          <p className="max-w-lg text-sm text-ink-muted">
            Judging what's distinctive about a contribution requires comparing it against a body of related
            literature and real semantic understanding — pattern-matching alone can't do that honestly. This needs
            a real backend with literature search and an LLM, which isn't wired up in this client-side demo.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group, gi) => {
            const points = paper.noveltyPoints.filter((p) => p.type === group.type)
            if (points.length === 0) return null
            const Icon = group.icon
            return (
              <motion.div
                key={group.type}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: gi * 0.08, ease: [0.16, 1, 0.3, 1] }}
                className="ink-border card-pop rounded-3xl bg-surface shadow-[var(--shadow-card)]"
              >
                <div className="flex items-center gap-2.5 border-b-[1.5px] border-line px-5 py-4">
                  <span className={`ink-border flex h-8 w-8 items-center justify-center rounded-full text-ink-on-sticky ${toneBg[group.tone]}`}>
                    <Icon size={16} />
                  </span>
                  <h2 className="font-display text-lg tracking-wide text-ink uppercase">{group.title}</h2>
                </div>
                <div className="divide-y-[1.5px] divide-line">
                  {points.map((p) => (
                    <div key={p.id} className="px-5 py-4">
                      <p className="text-sm text-ink-2">{p.text}</p>
                      {p.source && <p className="mt-1.5 text-xs font-semibold text-ink-muted">Source: {p.source}</p>}
                    </div>
                  ))}
                </div>
              </motion.div>
            )
          })}
          {paper.noveltyPoints.length === 0 && (
            <div className="ink-border rounded-3xl border-dashed bg-surface p-10 text-center text-sm font-semibold text-ink-muted">
              Nothing notable came back for this draft — try again once it has more results or discussion to assess.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
