import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

interface SessionFileContextValue {
  file: File | null
  objectUrl: string | null
  setSessionFile: (file: File | null) => void
}

const SessionFileContext = createContext<SessionFileContextValue | null>(null)

/** Holds whatever file the user most recently dropped into the uploader, purely in memory
 *  for this tab session — independent of which paper (mock or real) is being displayed.
 *  Used so "Your Document" can show the real file the user actually picked even while every
 *  finding on the dashboard is the curated demo data. */
export function SessionFileProvider({ children }: { children: ReactNode }) {
  const [file, setFile] = useState<File | null>(null)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const urlRef = useRef<string | null>(null)

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    },
    [],
  )

  const setSessionFile = useCallback((next: File | null) => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current)
      urlRef.current = null
    }
    if (next) {
      const url = URL.createObjectURL(next)
      urlRef.current = url
      setObjectUrl(url)
    } else {
      setObjectUrl(null)
    }
    setFile(next)
  }, [])

  return (
    <SessionFileContext.Provider value={{ file, objectUrl, setSessionFile }}>{children}</SessionFileContext.Provider>
  )
}

export function useSessionFile() {
  const ctx = useContext(SessionFileContext)
  if (!ctx) throw new Error('useSessionFile must be used within SessionFileProvider')
  return ctx
}
