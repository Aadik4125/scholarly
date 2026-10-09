import { FileText, ExternalLink, Info } from 'lucide-react'
import { useCurrentPaper } from '../hooks/useCurrentPaper'
import { useSessionFile } from '../hooks/useSessionFile'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function DocumentViewerCard() {
  const { paper, blobUrl: realBlobUrl } = useCurrentPaper()
  const { file: sessionFile, objectUrl: sessionUrl } = useSessionFile()
  if (!paper) return null

  // A file the user actually dropped in this session takes priority over the demo paper's
  // own (nonexistent) blob — the findings everywhere else stay the curated mock data, but
  // the document itself, when one was really uploaded, is real.
  const hasSessionFile = sessionFile !== null
  const displayFileName = hasSessionFile ? sessionFile.name : paper.fileName
  const displaySizeBytes = hasSessionFile ? sessionFile.size : paper.fileSizeBytes
  const displayUrl = hasSessionFile ? sessionUrl : realBlobUrl
  const isReal = hasSessionFile || paper.analysisMode === 'heuristic'
  const isPdf = /\.pdf$/i.test(displayFileName)

  return (
    <div className="ink-border card-pop mb-6 overflow-hidden rounded-3xl bg-surface shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-[1.5px] border-line px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="ink-border flex h-8 w-8 items-center justify-center rounded-full bg-sticky-blue text-ink-on-sticky">
            <FileText size={16} />
          </span>
          <div>
            <h2 className="font-display text-lg tracking-wide text-ink uppercase">Your document</h2>
            <p className="text-xs text-ink-muted">
              {displayFileName}
              {displaySizeBytes ? ` · ${formatBytes(displaySizeBytes)}` : ''}
            </p>
          </div>
        </div>
        {displayUrl && (
          <a
            href={displayUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ink-border flex items-center gap-1.5 rounded-full bg-surface-raised px-3.5 py-1.5 text-xs font-bold text-ink hover:bg-surface-hover"
          >
            Open original
            <ExternalLink size={12} />
          </a>
        )}
      </div>

      {isReal ? (
        isPdf && displayUrl ? (
          <iframe src={displayUrl} title="Uploaded document preview" className="h-[480px] w-full border-0" />
        ) : (
          <div className="flex flex-col items-center gap-2 px-5 py-14 text-center">
            <FileText size={32} className="text-ink-muted" />
            <p className="text-sm font-bold text-ink">Preview isn't available for this file type</p>
            <p className="max-w-sm text-xs text-ink-muted">
              Word documents can't be rendered inline in the browser. Use "Open original" above to view it in your
              system's default app.
            </p>
          </div>
        )
      ) : (
        <div className="flex items-start gap-2.5 bg-sticky-yellow px-5 py-4">
          <Info size={16} className="mt-0.5 shrink-0 text-ink-on-sticky" />
          <p className="text-sm text-ink-on-sticky">
            This is the sample paper, with no uploaded file to preview — the findings throughout this dashboard
            are curated demo data either way. Upload your own PDF or DOCX from the home screen to see it
            previewed here.
          </p>
        </div>
      )}
    </div>
  )
}
