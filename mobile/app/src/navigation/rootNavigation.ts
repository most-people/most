export type RootTab = 'chat' | 'files' | 'transfers' | 'node'

export type TabPressAction = 'scrollTop' | 'switch'
export type RootBackAction =
  'closeLanguage' | 'closeReceive' | 'closeNodeChild' | 'exit'

export function getTabPressAction(
  activeTab: RootTab,
  nextTab: RootTab
): TabPressAction {
  return activeTab === nextTab ? 'scrollTop' : 'switch'
}

export function getRootBackAction(input: {
  activeTab: RootTab
  downloadModalOpen: boolean
  languageModalOpen: boolean
  nodeRoute: 'status' | 'p2pPing'
}): RootBackAction {
  if (input.languageModalOpen) return 'closeLanguage'
  if (input.downloadModalOpen) return 'closeReceive'
  if (input.activeTab === 'node' && input.nodeRoute === 'p2pPing') {
    return 'closeNodeChild'
  }
  return 'exit'
}
