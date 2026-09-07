interface ChatJoinInviteNodeSelection {
  inviteNodeUrl?: string
  inviteNodeInvite?: string
  hasBackend: boolean | null
  activeBackendUrl?: string
  activeRemoteUrl?: string
  activeRemoteInvite?: string
}

interface ChatJoinConnectionResult {
  ok: boolean
  retryable?: boolean
}

const CHAT_JOIN_RETRY_DELAYS_MS = [1000, 2000, 4000]

function waitForChatJoinRetry(delayMs: number, signal: AbortSignal) {
  signal.throwIfAborted()
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort)
      resolve()
    }, delayMs)

    function abort() {
      clearTimeout(timer)
      reject(signal.reason)
    }

    signal.addEventListener('abort', abort, { once: true })
  })
}

export async function retryChatJoinConnection<
  Result extends ChatJoinConnectionResult,
>(probe: () => Promise<Result>, signal: AbortSignal): Promise<Result> {
  for (let attempt = 0; ; attempt += 1) {
    signal.throwIfAborted()
    const result = await probe()
    signal.throwIfAborted()
    if (
      result.ok ||
      !result.retryable ||
      attempt === CHAT_JOIN_RETRY_DELAYS_MS.length
    ) {
      return result
    }
    await waitForChatJoinRetry(CHAT_JOIN_RETRY_DELAYS_MS[attempt], signal)
  }
}

function normalizeChatJoinBackendCandidate(value?: string) {
  return String(value || '')
    .trim()
    .replace(/\/+$/, '')
}

function normalizeChatJoinInviteCode(value?: string) {
  return String(value || '').trim()
}

function isUsingChatJoinInviteNode({
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
