import type { ReactNode } from 'react'
import { motion } from 'framer-motion'

interface PageHeaderProps {
  eyebrow?: string
  title: string
  description?: string
  action?: ReactNode
}

export default function PageHeader({ eyebrow, title, description, action }: PageHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="pt-7 pb-6"
    >
      {eyebrow && (
        <p className="inline-block w-fit font-hand text-xl leading-none text-ink-2" style={{ transform: 'rotate(-1.5deg)' }}>
          {eyebrow}
        </p>
      )}
      <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-[2.75rem] leading-[0.95] tracking-tight text-ink uppercase sm:text-5xl">
          {title}
        </h1>
        {action}
      </div>
      {description && <p className="mt-3 max-w-2xl text-sm text-ink-2">{description}</p>}
    </motion.div>
  )
}
