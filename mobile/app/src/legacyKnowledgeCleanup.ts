import * as FileSystem from 'expo-file-system/legacy'
import { Platform } from 'react-native'
import { cleanupLegacyMobileStorage } from './legacyKnowledgeStorage'

const CLEANUP_MARKER = 'mostbox.legacy-knowledge-cleanup.v1'
const WEB_KNOWLEDGE_KEY = 'mostbox.web.knowledge.v1'

function removeLegacyNotesDatabase() {
  if (typeof indexedDB === 'undefined') return Promise.resolve()

  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('mostbox')
    request.onsuccess = () => resolve()
    request.onerror = () =>
      reject(request.error ?? new Error('IndexedDB deletion failed'))
    request.onblocked = () =>
      reject(new Error('IndexedDB deletion was blocked'))
  })
}

export async function cleanupLegacyKnowledgeData() {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      if (localStorage.getItem(CLEANUP_MARKER) === 'done') return
      localStorage.removeItem(WEB_KNOWLEDGE_KEY)
      for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index)
        if (key?.startsWith('mostbox.chatNoteDraft.')) {
          localStorage.removeItem(key)
        }
      }
      await removeLegacyNotesDatabase()
      localStorage.setItem(CLEANUP_MARKER, 'done')
    } catch (error) {
      console.warn('[legacy-cleanup] failed to clear web knowledge:', error)
    }
  }

  if (Platform.OS === 'web') return

  await cleanupLegacyMobileStorage(FileSystem)
}
