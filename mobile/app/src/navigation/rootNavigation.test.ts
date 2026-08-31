import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { getRootBackAction, getTabPressAction } from './rootNavigation'

test('root tabs scroll to top on reselection and guard dirty knowledge edits', () => {
  assert.equal(getTabPressAction('files', 'files', false), 'scrollTop')
  assert.equal(
    getTabPressAction('knowledge', 'transfers', true),
    'confirmDiscard'
  )
  assert.equal(getTabPressAction('files', 'node', false), 'switch')
})

test('back action closes overlays and child routes before exiting', () => {
  const base = {
    activeTab: 'knowledge' as const,
    downloadModalOpen: true,
    knowledgeMode: 'edit' as const,
    languageModalOpen: true,
    nodeRoute: 'status' as const,
  }
  assert.equal(getRootBackAction(base), 'closeLanguage')
  assert.equal(
    getRootBackAction({ ...base, languageModalOpen: false }),
    'closeReceive'
  )
  assert.equal(
    getRootBackAction({
      ...base,
      activeTab: 'node',
      downloadModalOpen: false,
      languageModalOpen: false,
      nodeRoute: 'p2pPing',
    }),
    'closeNodeChild'
  )
  assert.equal(
    getRootBackAction({
      ...base,
      downloadModalOpen: false,
      languageModalOpen: false,
    }),
    'closeKnowledgeChild'
  )
  assert.equal(
    getRootBackAction({
      ...base,
      activeTab: 'files',
      downloadModalOpen: false,
      knowledgeMode: 'browse',
      languageModalOpen: false,
    }),
    'exit'
  )
})

test('confirmed tab changes force the dirty knowledge editor to exit', async () => {
  const [appSource, knowledgeSource] = await Promise.all([
    readFile(path.resolve('App.tsx'), 'utf8'),
    readFile(
      path.resolve('src/features/knowledge/KnowledgeBaseScreen.tsx'),
      'utf8'
    ),
  ])

  assert.equal(
    appSource.includes('setKnowledgeDiscardToken(current => current + 1)'),
    true
  )
  assert.equal(
    appSource.includes('discardRequestToken={knowledgeDiscardToken}'),
    true
  )
  assert.equal(
    knowledgeSource.includes(
      'handledDiscardRequestTokenRef.current === discardRequestToken'
    ),
    true
  )
  assert.equal(
    knowledgeSource.includes(
      "setMode(editorOriginalPath ? 'preview' : 'browse')"
    ),
    true
  )
})
