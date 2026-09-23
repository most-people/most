const CLEANUP_MARKER = 'mostbox.legacy-knowledge-cleanup.v1'
const LEGACY_NOTE_DRAFT_PREFIX = 'mostbox.chatNoteDraft.'
const LEGACY_WEB_KNOWLEDGE_KEY = 'mostbox.web.knowledge.v1'

function removeLegacyBrowserStorage() {
  if (typeof window === 'undefined') return

  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index)
    if (key?.startsWith(LEGACY_NOTE_DRAFT_PREFIX)) {
      window.localStorage.removeItem(key)
    }
  }
  window.localStorage.removeItem(LEGACY_WEB_KNOWLEDGE_KEY)
}

function removeLegacyNotesDatabase() {
  if (typeof indexedDB === 'undefined') return Promise.resolve()

  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('mostbox')
    request.onsuccess = () => resolve()
    request.onblocked = () =>
      reject(new Error('legacy IndexedDB deletion is blocked'))
    request.onerror = () => reject(request.error)
  })
}

export async function cleanupLegacyKnowledgeData() {
  if (typeof window === 'undefined') return

  try {
    if (window.localStorage.getItem(CLEANUP_MARKER) === 'done') return
  } catch {
    // Continue with the deletion when localStorage is unavailable.
  }

  try {
    removeLegacyBrowserStorage()
    await removeLegacyNotesDatabase()
  } catch (error) {
    console.warn('[legacy-cleanup] failed to clear browser knowledge:', error)
    return
  }

  try {
    window.localStorage.setItem(CLEANUP_MARKER, 'done')
  } catch (error) {
    console.warn('[legacy-cleanup] failed to save completion marker:', error)
  }
}
