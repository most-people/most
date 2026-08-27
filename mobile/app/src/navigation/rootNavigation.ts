export type RootTab = 'files' | 'knowledge' | 'transfers' | 'node'
export type KnowledgePresentation = 'browse' | 'preview' | 'edit'

export type TabPressAction = 'scrollTop' | 'switch' | 'confirmDiscard'
export type RootBackAction =
  | 'closeLanguage'
  | 'closeReceive'
  | 'closeNodeChild'
  | 'closeKnowledgeChild'
  | 'exit'

export function getTabPressAction(
  activeTab: RootTab,
  nextTab: RootTab,
  knowledgeDirty: boolean
): TabPressAction {
  if (activeTab === nextTab) return 'scrollTop'
  if (activeTab === 'knowledge' && knowledgeDirty) return 'confirmDiscard'
  return 'switch'
}

export function getRootBackAction(input: {
  activeTab: RootTab
  downloadModalOpen: boolean
  knowledgeMode: KnowledgePresentation
  languageModalOpen: boolean
  nodeRoute: 'status' | 'p2pPing'
}): RootBackAction {
  if (input.languageModalOpen) return 'closeLanguage'
  if (input.downloadModalOpen) return 'closeReceive'
  if (input.activeTab === 'node' && input.nodeRoute === 'p2pPing') {
    return 'closeNodeChild'
  }
  if (input.activeTab === 'knowledge' && input.knowledgeMode !== 'browse') {
    return 'closeKnowledgeChild'
  }
  return 'exit'
}
