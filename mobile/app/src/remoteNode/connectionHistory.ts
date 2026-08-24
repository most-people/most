import type { NodeHistoryItem, RemoteNodeConfig } from '../mobileCore/types'

export const MAX_REMOTE_NODES = 8

export type StoredRemoteNode = RemoteNodeConfig & {
  preferred: boolean
  updatedAt: number
}

export function normalizeRemoteUrl(value: string) {
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

function normalizeStoredNode(input: Partial<StoredRemoteNode>) {
  const url = normalizeRemoteUrl(String(input.url || ''))
  if (!url) return null
  return {
    url,
    invite: String(input.invite || '').trim(),
    preferred: input.preferred === true,
    updatedAt: Number(input.updatedAt) || Date.now(),
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
  if (!url) throw new Error('Enter a valid HTTP or HTTPS node URL')

  return normalizeRemoteNodes([
    {
      url,
      invite: input.invite.trim(),
      preferred,
      updatedAt: now,
    },
    ...nodes.map(node => ({
      ...node,
      preferred: preferred ? false : node.preferred,
    })),
  ])
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
