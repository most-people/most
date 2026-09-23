import assert from 'node:assert/strict'
import test from 'node:test'
import { getRootBackAction, getTabPressAction } from './rootNavigation'

test('root tabs scroll to top on reselection and switch cleanly', () => {
  assert.equal(getTabPressAction('chat', 'chat'), 'scrollTop')
  assert.equal(getTabPressAction('chat', 'transfers'), 'switch')
  assert.equal(getTabPressAction('files', 'node'), 'switch')
})

test('back action closes overlays and node child routes before exiting', () => {
  const base = {
    activeTab: 'chat' as const,
    downloadModalOpen: true,
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
      activeTab: 'files',
      downloadModalOpen: false,
      languageModalOpen: false,
    }),
    'exit'
  )
})
