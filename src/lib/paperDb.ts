import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Paper } from '../types'

interface StoredPaper extends Paper {
  fileBlob: Blob
}

interface ScholarlyDB extends DBSchema {
  papers: {
    key: string
    value: StoredPaper
  }
}

let dbPromise: Promise<IDBPDatabase<ScholarlyDB>> | null = null

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<ScholarlyDB>('scholarly-db', 1, {
      upgrade(db) {
        db.createObjectStore('papers', { keyPath: 'id' })
      },
    })
  }
  return dbPromise
}

function normalizeFileName(name: string): string {
  return name.toLowerCase().replace(/\.(pdf|docx?|txt)$/i, '').replace(/[-_\s]+/g, ' ').trim()
}

export interface PaperSummary {
  id: string
  title: string
  fileName: string
  uploadedAt: string
  openIssueCount: number
  draftCount: number
}

export async function listPapers(): Promise<PaperSummary[]> {
  const db = await getDb()
  const all = await db.getAll('papers')
  return all
    .map((p) => ({
      id: p.id,
      title: p.title,
      fileName: p.fileName,
      uploadedAt: p.uploadedAt,
      openIssueCount: p.consistencyIssues.filter((i) => i.status === 'open').length,
      draftCount: p.versions.length,
    }))
    .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
}

export async function getPaper(id: string): Promise<Paper | null> {
  const db = await getDb()
  const record = await db.get('papers', id)
  if (!record) return null
  const { fileBlob: _fileBlob, ...paper } = record
  return paper
}

export async function getPaperBlob(id: string): Promise<Blob | null> {
  const db = await getDb()
  const record = await db.get('papers', id)
  return record?.fileBlob ?? null
}

/** Saves a freshly analyzed paper. If a paper with the same (normalized) filename already
 *  exists, this is treated as a new draft of that same paper: the previous state is archived
 *  into `versions` and the record is updated in place, preserving its id. */
export async function savePaper(file: File, analyzed: Paper): Promise<string> {
  const db = await getDb()
  const all = await db.getAll('papers')
  const normalized = normalizeFileName(file.name)
  const existing = all.find((p) => normalizeFileName(p.fileName) === normalized)

  if (existing) {
    const priorVersions = existing.versions.map((v, i) => ({
      ...v,
      label: v.label.replace(' (current)', '') || `Draft ${i + 1}`,
    }))
    const newVersion = {
      id: `v${priorVersions.length + 1}`,
      label: `Draft ${priorVersions.length + 1} (current)`,
      uploadedAt: analyzed.uploadedAt,
      consistencyOpenCount: analyzed.consistencyIssues.filter((i) => i.status === 'open').length,
      writingAcceptedCount: 0,
      note: 'Re-uploaded draft',
    }
    const merged: StoredPaper = {
      ...analyzed,
      id: existing.id,
      versions: [...priorVersions, newVersion],
      fileBlob: file,
    }
    await db.put('papers', merged)
    return existing.id
  }

  const record: StoredPaper = { ...analyzed, fileBlob: file }
  await db.put('papers', record)
  return analyzed.id
}

export async function updateConsistencyStatus(
  paperId: string,
  issueId: string,
  status: 'open' | 'resolved' | 'dismissed',
): Promise<void> {
  const db = await getDb()
  const record = await db.get('papers', paperId)
  if (!record) return
  record.consistencyIssues = record.consistencyIssues.map((i) => (i.id === issueId ? { ...i, status } : i))
  await db.put('papers', record)
}

/** Updates a suggestion's status and (when accepting one changes the working text) editedText
 *  in a single read-modify-write. These must stay atomic: firing them as two separate
 *  get+put calls lets the second overwrite the first's change if their transactions interleave,
 *  silently losing the status flip or the text edit depending on which one lands last. */
export async function updateWritingStatus(
  paperId: string,
  suggestionId: string,
  status: 'pending' | 'accepted' | 'rejected',
  editedText?: string,
): Promise<void> {
  const db = await getDb()
  const record = await db.get('papers', paperId)
  if (!record) return
  record.writingSuggestions = record.writingSuggestions.map((s) => (s.id === suggestionId ? { ...s, status } : s))
  if (editedText !== undefined) record.editedText = editedText
  await db.put('papers', record)
}

/** Snapshots the current editedText as a new draft in version history — the "Save new version"
 *  action on the Writing page, separate from re-uploading a file. Mirrors savePaper's
 *  version-bumping logic but doesn't touch the stored file or re-run analysis. */
export async function saveEditedVersion(paperId: string, note: string): Promise<void> {
  const db = await getDb()
  const record = await db.get('papers', paperId)
  if (!record) return

  const priorVersions = record.versions.map((v, i) => ({
    ...v,
    label: v.label.replace(' (current)', '') || `Draft ${i + 1}`,
  }))
  const newVersion = {
    id: `v${priorVersions.length + 1}`,
    label: `Draft ${priorVersions.length + 1} (current)`,
    uploadedAt: new Date().toISOString(),
    consistencyOpenCount: record.consistencyIssues.filter((i) => i.status === 'open').length,
    writingAcceptedCount: record.writingSuggestions.filter((s) => s.status === 'accepted').length,
    note,
  }
  record.versions = [...priorVersions, newVersion]
  await db.put('papers', record)
}

export async function deletePaper(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('papers', id)
}
