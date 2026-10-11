export type RootTab = 'chat' | 'files' | 'transfers' | 'node'

const WEB_TAB_PATHS = {
  chat: '/chat',
  files: '/file',
  transfers: '/transfer',
} as const

export function getRootTabPath(tab: Exclude<RootTab, 'node'>) {
  return WEB_TAB_PATHS[tab]
}

export function getRootTabFromPathname(
  pathname: string,
  fallback: Exclude<RootTab, 'node'> = 'chat'
): Exclude<RootTab, 'node'> {
  if (pathname === WEB_TAB_PATHS.files) return 'files'
  if (pathname === WEB_TAB_PATHS.transfers) return 'transfers'
  if (pathname === WEB_TAB_PATHS.chat) return 'chat'
  return fallback
}

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
