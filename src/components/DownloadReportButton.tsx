import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import type { Paper } from '../types'
import { useToast } from '../hooks/useToast'
import { track } from '../lib/analytics'

/** Downloads the similarity + AI-content report as a PDF, built in the browser. */
export default function DownloadReportButton({ paper, from }: { paper: Paper; from: string }) {
  const { push } = useToast()
  const [busy, setBusy] = useState(false)

  const download = async () => {
    setBusy(true)
    try {
      const { downloadIntegrityReport } = await import('../lib/exportReport')
      await downloadIntegrityReport(paper)
      track('report_download', { from })
      push('Report downloaded')
    } catch (err) {
      console.error('[report]', err)
      push('Could not create the report. Please try again.', 'neutral')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      onClick={download}
      disabled={busy}
      className="ink-border flex shrink-0 items-center gap-1.5 rounded-full bg-surface px-4 py-2.5 text-sm font-bold text-ink transition-transform hover:-translate-y-0.5 hover:bg-surface-hover active:translate-y-0 disabled:opacity-60"
    >
      {busy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
      {busy ? 'Preparing…' : 'Download report'}
    </button>
  )
}
