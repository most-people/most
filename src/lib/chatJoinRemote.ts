export interface ChatJoinInviteNodeSelection {
  inviteNodeUrl?: string
  inviteNodeInvite?: string
  hasBackend: boolean | null
  activeBackendUrl?: string
  activeRemoteUrl?: string
  activeRemoteInvite?: string
}

export function normalizeChatJoinBackendCandidate(value?: string) {
  return String(value || '')
    .trim()
    .replace(/\/+$/, '')
}

function normalizeChatJoinInviteCode(value?: string) {
  return String(value || '').trim()
}

export function isUsingChatJoinInviteNode({
  inviteNodeUrl,
  inviteNodeInvite,
  hasBackend,
  activeBackendUrl,
  activeRemoteUrl,
  activeRemoteInvite,
}: ChatJoinInviteNodeSelection) {
  const inviteUrl = normalizeChatJoinBackendCandidate(inviteNodeUrl)
  const remoteUrl = normalizeChatJoinBackendCandidate(activeRemoteUrl)
  const backendUrl = normalizeChatJoinBackendCandidate(activeBackendUrl)

  return (
    Boolean(inviteUrl) &&
    Boolean(remoteUrl) &&
    hasBackend === true &&
    backendUrl === remoteUrl &&
    remoteUrl === inviteUrl &&
    normalizeChatJoinInviteCode(activeRemoteInvite) ===
      normalizeChatJoinInviteCode(inviteNodeInvite)
  )
}

export function shouldConnectChatJoinInviteNode(
  selection: ChatJoinInviteNodeSelection
) {
  return (
    Boolean(normalizeChatJoinBackendCandidate(selection.inviteNodeUrl)) &&
    !isUsingChatJoinInviteNode(selection)
  )
}
