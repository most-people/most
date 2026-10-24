import type { NodeHistoryItem, RemoteNodeConfig } from '../mobileCore/types'

export const MAX_REMOTE_NODES = 8

export type StoredRemoteNode = RemoteNodeConfig & {
  preferred: boolean
  updatedAt: number
  /** 用户明确允许此远程节点持有账号同步子密钥。 */
  accountSync: boolean
}

function normalizeExplicitRemoteUrl(value: string) {
  const input = value.trim().replace(/\/+$/, '')
  if (!input) return ''
  try {
    const url = new URL(input)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
    url.hash = ''
    url.search = ''
    return url.toString().replace(/\/+$/, '')
  } catch {
    return ''
  }
}

function hasExplicitUrlProtocol(value: string) {
  return /^[a-z][a-z\d+.-]*:\/\//i.test(value.trim())
}

export function getRemoteUrlCandidates(value: string) {
  const input = value.trim().replace(/\/+$/, '')
  if (!input) return []

  const candidates = hasExplicitUrlProtocol(input)
    ? [input]
    : [`https://${input}`, `http://${input}`]

  return [
    ...new Set(candidates.map(normalizeExplicitRemoteUrl).filter(Boolean)),
  ]
}

export function hasExplicitRemoteUrlProtocol(value: string) {
  return hasExplicitUrlProtocol(value)
}

export function normalizeRemoteUrl(value: string) {
  return getRemoteUrlCandidates(value)[0] || ''
}

function normalizeStoredNode(input: Partial<StoredRemoteNode>) {
  const url = normalizeRemoteUrl(String(input.url || ''))
  if (!url) return null
  return {
    url,
    invite: String(input.invite || '').trim(),
    preferred: input.preferred === true,
    updatedAt: Number(input.updatedAt) || Date.now(),
    accountSync: input.accountSync === true,
  }
}

export function normalizeRemoteNodes(inputs: Partial<StoredRemoteNode>[]) {
  const nodes = new Map<string, StoredRemoteNode>()
  for (const input of inputs) {
    const node = normalizeStoredNode(input)
    if (!node) continue
    const previous = nodes.get(node.url)
    if (!previous || node.updatedAt >= previous.updatedAt) {
      nodes.set(node.url, node)
    }
  }

  const sorted = [...nodes.values()].sort((left, right) => {
    if (left.preferred !== right.preferred) return left.preferred ? -1 : 1
    return right.updatedAt - left.updatedAt
  })
  const preferredUrl = sorted.find(node => node.preferred)?.url || ''

  return sorted.slice(0, MAX_REMOTE_NODES).map(node => ({
    ...node,
    preferred: node.url === preferredUrl,
  }))
}

export function saveRemoteNode(
  nodes: StoredRemoteNode[],
  input: RemoteNodeConfig,
  preferred = true,
  now = Date.now()
) {
  const url = normalizeRemoteUrl(input.url)
  if (!url) throw new Error('Enter a valid node URL')

  return normalizeRemoteNodes([
    {
      url,
      invite: input.invite.trim(),
      preferred,
      updatedAt: now,
      accountSync: nodes.some(node => node.url === url && node.accountSync),
    },
    ...nodes.map(node => ({
      ...node,
      preferred: preferred ? false : node.preferred,
    })),
  ])
}

/** 回环地址上的节点就是用户自己的本机 daemon，账号同步不需要额外授权。 */
export function isLoopbackNodeUrl(value: string) {
  try {
    const { hostname } = new URL(value)
    const host = hostname.toLowerCase()
    return (
      host === 'localhost' ||
      host === '::1' ||
      host === '[::1]' ||
      host.startsWith('127.')
    )
  } catch {
    return false
  }
}

export function setRemoteAccountSync(
  nodes: StoredRemoteNode[],
  url: string,
  accountSync: boolean
) {
  const target = normalizeRemoteUrl(url)
  return normalizeRemoteNodes(
    nodes.map(node => (node.url === target ? { ...node, accountSync } : node))
  )
}

export function clearPreferredRemote(nodes: StoredRemoteNode[]) {
  return normalizeRemoteNodes(
    nodes.map(node => ({ ...node, preferred: false }))
  )
}

export function buildNodeHistory(
  nodes: StoredRemoteNode[],
  currentMode: 'local' | 'remote',
  currentRemoteUrl = ''
): NodeHistoryItem[] {
  const remote = normalizeRemoteNodes(nodes).map(node => ({
    ...node,
    local: false,
    current:
      currentMode === 'remote' &&
      node.url === normalizeRemoteUrl(currentRemoteUrl),
  }))
  return [
    {
      url: '',
      invite: '',
      local: true,
      preferred: !remote.some(node => node.preferred),
      current: currentMode === 'local',
      updatedAt: Number.MAX_SAFE_INTEGER,
    },
    ...remote,
  ]
}
