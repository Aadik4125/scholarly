import { openDB } from 'idb'

// Google sign-in leaves the page and comes back, which drops the in-memory File. The chosen
// file is parked in IndexedDB so the upload can continue automatically after sign-in.
const dbPromise = () =>
  openDB('scholarly-pending', 1, { upgrade: (db) => db.createObjectStore('file') })

export async function stashPendingUpload(file: File) {
  try {
    const db = await dbPromise()
    await db.put('file', { blob: file, name: file.name, type: file.type, at: Date.now() }, 'pending')
  } catch (err) {
    console.error('Could not stash the pending upload', err)
  }
}

/** Returns and removes the parked file (if it is recent), or null. */
export async function takePendingUpload(): Promise<File | null> {
  try {
    const db = await dbPromise()
    const rec = await db.get('file', 'pending')
    await db.delete('file', 'pending')
    if (!rec || Date.now() - rec.at > 60 * 60 * 1000) return null
    return new File([rec.blob], rec.name, { type: rec.type })
  } catch {
    return null
  }
}

export async function clearPendingUpload() {
  try {
    const db = await dbPromise()
    await db.delete('file', 'pending')
  } catch {
    /* ignore */
  }
}
