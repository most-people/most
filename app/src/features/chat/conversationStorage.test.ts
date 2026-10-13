import assert from 'node:assert/strict'
import test from 'node:test'
import {
  loadHiddenConversations,
  saveHiddenConversations,
} from './conversationStorage.web'

test('hidden conversations persist across reloads, remain scoped to the node and account, and can be restored', async () => {
  const values = new Map<string, string>()
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) || null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  })
  try {
    await saveHiddenConversations('node-a:alice', ['8848'])
    await saveHiddenConversations('node-b:bob', ['other'])
    assert.deepEqual(await loadHiddenConversations('node-a:alice'), ['8848'])
    assert.deepEqual(await loadHiddenConversations('node-b:bob'), ['other'])
    assert.deepEqual(await loadHiddenConversations('node-a:bob'), [])
    await saveHiddenConversations('node-a:alice', [])
    assert.deepEqual(await loadHiddenConversations('node-a:alice'), [])
    values.set('mostbox.hidden-conversations.v1', 'invalid json')
    assert.deepEqual(await loadHiddenConversations('node-b:bob'), [])
    await saveHiddenConversations('node-b:bob', ['other'])
    assert.deepEqual(await loadHiddenConversations('node-b:bob'), ['other'])
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  }
})
