import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanupLegacyMobileStorage } from './legacyKnowledgeStorage'

function fixture(entries: string[] = []) {
  const base = 'file:///app/Documents'
  const files = new Map(entries.map(name => [`${base}/${name}`, 'keep']))
  let fail = false
  const warnings: unknown[] = []
  const removed: string[] = []
  return {
    files,
    removed,
    warnings,
    failNext() {
      fail = true
    },
    storage: {
      documentDirectory: `${base}/`,
      getInfoAsync: async (uri: string) => ({ exists: files.has(uri) }),
      readDirectoryAsync: async () => entries,
      deleteAsync: async (uri: string) => {
        if (fail) {
          fail = false
          throw new Error('busy')
        }
        removed.push(uri)
        files.delete(uri)
      },
      writeAsStringAsync: async (uri: string, content: string) => {
        files.set(uri, content)
      },
    },
    logger: {
      warn: (...args: unknown[]) => {
        warnings.push(args)
      },
    },
  }
}

test('cleans legacy mobile data once while preserving other files', async () => {
  const state = fixture([
    'mostbox-knowledge',
    'mostbox-knowledge.import-123',
    'mostbox-knowledge.backup-456',
    'identity.json',
    'channels.json',
    'downloads',
    'exported-backup.json',
  ])
  await cleanupLegacyMobileStorage(state.storage, state.logger)
  assert.equal(state.removed.length, 3)
  for (const name of [
    'identity.json',
    'channels.json',
    'downloads',
    'exported-backup.json',
  ]) {
    assert.equal(state.files.has(`file:///app/Documents/${name}`), true)
  }
  await cleanupLegacyMobileStorage(state.storage, state.logger)
  assert.equal(state.removed.length, 3)
  assert.equal(state.warnings.length, 0)
})

test('an empty directory completes and a failed deletion retries next startup', async () => {
  const empty = fixture()
  await cleanupLegacyMobileStorage(empty.storage, empty.logger)
  assert.equal(
    empty.files.get(
      'file:///app/Documents/mostbox-legacy-knowledge-cleanup.v1'
    ),
    'done'
  )
  const state = fixture(['mostbox-knowledge'])
  state.failNext()
  await cleanupLegacyMobileStorage(state.storage, state.logger)
  assert.equal(
    state.files.has(
      'file:///app/Documents/mostbox-legacy-knowledge-cleanup.v1'
    ),
    false
  )
  assert.equal(state.warnings.length, 1)
  await cleanupLegacyMobileStorage(state.storage, state.logger)
  assert.equal(
    state.files.get(
      'file:///app/Documents/mostbox-legacy-knowledge-cleanup.v1'
    ),
    'done'
  )
})

test('rejects escaping entries before deleting any data', async () => {
  for (const suffix of [
    '../../identity.json',
    '%2f..%2fidentity.json',
    '\\..\\identity.json',
  ]) {
    const state = fixture([`mostbox-knowledge.import-${suffix}`])
    await cleanupLegacyMobileStorage(state.storage, state.logger)
    assert.equal(state.removed.length, 0)
    assert.equal(state.warnings.length, 1)
    assert.equal(
      state.files.has(
        'file:///app/Documents/mostbox-legacy-knowledge-cleanup.v1'
      ),
      false
    )
  }
})
