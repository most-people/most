export type RootTab = 'chat' | 'files' | 'explore' | 'node'

const WEB_TAB_PATHS = {
  chat: '/chat',
  files: '/file',
  explore: '/explore',
  node: '/dot',
} as const

export function getRootTabPath(tab: RootTab) {
  return WEB_TAB_PATHS[tab]
}

export function getRootTabFromPathname(
  pathname: string,
  fallback: RootTab = 'chat'
): RootTab {
  if (pathname === WEB_TAB_PATHS.files) return 'files'
  if (pathname === WEB_TAB_PATHS.explore) return 'explore'
  if (pathname === WEB_TAB_PATHS.node || pathname === '/transfer') return 'node'
  if (pathname === WEB_TAB_PATHS.chat) return 'chat'
  return fallback
}

export type TabPressAction = 'scrollTop' | 'switch'
export type RootBackAction =
  | 'closeLanguage'
  | 'closeReceive'
  | 'closeFilesLibrary'
  | 'closeNodeChild'
  | 'closeTransfers'
  | 'exit'

export function getTabPressAction(
  activeTab: RootTab,
  nextTab: RootTab
): TabPressAction {
  return activeTab === nextTab ? 'scrollTop' : 'switch'
}

export function getRootBackAction(input: {
  activeTab: RootTab
  downloadModalOpen: boolean
  transfersOpen?: boolean
  filesLibraryOpen?: boolean
  languageModalOpen: boolean
  nodeRoute: 'status' | 'p2pPing'
}): RootBackAction {
  if (input.languageModalOpen) return 'closeLanguage'
  if (input.downloadModalOpen) return 'closeReceive'
  if (input.transfersOpen) return 'closeTransfers'
  if (input.filesLibraryOpen) return 'closeFilesLibrary'
  if (input.activeTab === 'node' && input.nodeRoute === 'p2pPing') {
    return 'closeNodeChild'
  }
  return 'exit'
}
