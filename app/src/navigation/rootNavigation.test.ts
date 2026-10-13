import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getRootBackAction,
  getRootTabFromPathname,
  getRootTabPath,
  getTabPressAction,
} from './rootNavigation'

test('web root tabs use singular paths', () => {
  assert.equal(getRootTabPath('chat'), '/chat')
  assert.equal(getRootTabPath('files'), '/file')
  assert.equal(getRootTabPath('explore'), '/explore')
  assert.equal(getRootTabPath('node'), '/dot')
  assert.equal(getRootTabFromPathname('/chat'), 'chat')
  assert.equal(getRootTabFromPathname('/file'), 'files')
  assert.equal(getRootTabFromPathname('/explore'), 'explore')
  assert.equal(getRootTabFromPathname('/transfer'), 'node')
  assert.equal(getRootTabFromPathname('/dot'), 'node')
  assert.equal(getRootTabFromPathname('/'), 'chat')
})

test('root tabs scroll to top on reselection and switch cleanly', () => {
  assert.equal(getTabPressAction('chat', 'chat'), 'scrollTop')
  assert.equal(getTabPressAction('chat', 'explore'), 'switch')
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
      filesLibraryOpen: true,
      languageModalOpen: false,
    }),
    'closeFilesLibrary'
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

test('transfer child page closes before returning from Me', () => {
  assert.equal(
    getRootBackAction({
      activeTab: 'node',
      downloadModalOpen: false,
      languageModalOpen: false,
      transfersOpen: true,
      nodeRoute: 'status',
    }),
    'closeTransfers'
  )
})
