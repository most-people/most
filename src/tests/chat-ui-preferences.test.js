import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  getChatUiPreferences,
  getChatUiPreferencesStorageKey,
  normalizeChatUiPreferences,
  readStoredChatUiPreferences,
  updateChatUiPreferences,
  writeStoredChatUiPreferences,
} from '../lib/chatUiPreferencesRuntime.js'

class MemoryStorage {
  #values = new Map()

  getItem(key) {
    return this.#values.has(key) ? this.#values.get(key) : null
  }

  setItem(key, value) {
    this.#values.set(key, String(value))
  }
}

describe('chat UI preferences', () => {
  it('normalizes partial and invalid channel preferences', () => {
    assert.deepEqual(normalizeChatUiPreferences({ pinned: 1, draft: 42 }), {
      pinned: false,
      muted: false,
      draft: '',
      lastReadAt: 0,
    })
    assert.deepEqual(
      normalizeChatUiPreferences({
        pinned: true,
        muted: true,
        draft: 'hello',
        lastReadAt: 12.9,
      }),
      { pinned: true, muted: true, draft: 'hello', lastReadAt: 12 }
    )
  })

  it('persists preferences under a normalized wallet address', () => {
    const storage = new MemoryStorage()
    const key = getChatUiPreferencesStorageKey(
      '  0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA  '
    )
    const preferences = updateChatUiPreferences({}, ' General ', {
      pinned: true,
      draft: 'draft text',
      lastReadAt: 1234,
    })

    writeStoredChatUiPreferences(key, preferences, storage)

    assert.equal(
      key,
      'mostbox.chat.uiPreferences:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    )
    assert.deepEqual(readStoredChatUiPreferences(key, storage), {
      General: {
        pinned: true,
        muted: false,
        draft: 'draft text',
        lastReadAt: 1234,
      },
    })
  })

  it('returns defaults for unknown channels and preserves immutable updates', () => {
    const previous = {
      general: {
        pinned: false,
        muted: false,
        draft: '',
        lastReadAt: 1,
      },
    }
    const next = updateChatUiPreferences(previous, 'general', { muted: true })

    assert.deepEqual(getChatUiPreferences(next, 'general'), {
      pinned: false,
      muted: true,
      draft: '',
      lastReadAt: 1,
    })
    assert.deepEqual(getChatUiPreferences(next, 'missing'), {
      pinned: false,
      muted: false,
      draft: '',
      lastReadAt: 0,
    })
    assert.equal(previous.general.muted, false)
  })

  it('ignores malformed persisted payloads', () => {
    const storage = new MemoryStorage()
    const key = getChatUiPreferencesStorageKey('0xabc')
    storage.setItem(key, '{broken')
    assert.deepEqual(readStoredChatUiPreferences(key, storage), {})
  })
})
