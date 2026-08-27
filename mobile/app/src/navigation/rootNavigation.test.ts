import assert from 'node:assert/strict'
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
