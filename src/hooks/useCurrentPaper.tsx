import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { mockPaper } from '../data/mockPaper'
import { getPaper, getPaperBlob, updateConsistencyStatus, updateWritingStatus } from '../lib/paperDb'
import type { ConsistencyIssue, Paper, WritingSuggestion } from '../types'

interface CurrentPaperContextValue {
  paper: Paper | null
  blobUrl: string | null
  loading: boolean
  notFound: boolean
  setConsistencyStatus: (issueId: string, status: ConsistencyIssue['status']) => void
  setWritingStatus: (suggestionId: string, status: WritingSuggestion['status']) => void
}

const CurrentPaperContext = createContext<CurrentPaperContextValue | null>(null)

export function CurrentPaperProvider({ paperId, children }: { paperId: string; children: ReactNode }) {
  const [paper, setPaper] = useState<Paper | null>(null)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const blobUrlRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setNotFound(false)

    async function load() {
      if (paperId === 'demo') {
        if (!cancelled) {
          setPaper(mockPaper)
          setBlobUrl(null)
          setLoading(false)
        }
        return
      }

      const found = await getPaper(paperId)
      if (cancelled) return
      if (!found) {
        setPaper(null)
        setNotFound(true)
        setLoading(false)
        return
      }
      setPaper(found)

      const blob = await getPaperBlob(paperId)
      if (cancelled) return
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
      if (blob) {
        const url = URL.createObjectURL(blob)
        blobUrlRef.current = url
        setBlobUrl(url)
      } else {
        setBlobUrl(null)
      }
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [paperId])

  useEffect(
    () => () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
    },
    [],
  )

  const setConsistencyStatus = useCallback(
    (issueId: string, status: ConsistencyIssue['status']) => {
      setPaper((prev) =>
        prev
          ? { ...prev, consistencyIssues: prev.consistencyIssues.map((i) => (i.id === issueId ? { ...i, status } : i)) }
          : prev,
      )
      if (paperId !== 'demo') void updateConsistencyStatus(paperId, issueId, status)
    },
    [paperId],
  )

  const setWritingStatus = useCallback(
    (suggestionId: string, status: WritingSuggestion['status']) => {
      setPaper((prev) =>
        prev
          ? {
              ...prev,
              writingSuggestions: prev.writingSuggestions.map((s) => (s.id === suggestionId ? { ...s, status } : s)),
            }
          : prev,
      )
      if (paperId !== 'demo') void updateWritingStatus(paperId, suggestionId, status)
    },
    [paperId],
  )

  return (
    <CurrentPaperContext.Provider value={{ paper, blobUrl, loading, notFound, setConsistencyStatus, setWritingStatus }}>
      {children}
    </CurrentPaperContext.Provider>
  )
}

export function useCurrentPaper() {
  const ctx = useContext(CurrentPaperContext)
  if (!ctx) throw new Error('useCurrentPaper must be used within CurrentPaperProvider')
  return ctx
}
