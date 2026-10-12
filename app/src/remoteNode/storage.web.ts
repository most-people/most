import type { MobileIdentity } from '../mobileCore/types'
import {
  normalizeRemoteNodes,
  type StoredRemoteNode,
} from './connectionHistory'

const IDENTITY_KEY = 'mostbox.mobile.identity.v1'
const REMOTE_NODES_KEY = 'mostbox.mobile.remote-nodes.v1'

function readJson<T>(key: string): T | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const value = localStorage.getItem(key)
    return value ? (JSON.parse(value) as T) : null
  } catch {
    return null
  }
}

export async function loadMobileIdentity() {
  const identity = readJson<Partial<MobileIdentity>>(IDENTITY_KEY)
  if (
    !identity?.username ||
    !identity.address ||
    !/^0x[0-9a-f]{40}$/i.test(identity.address) ||
    !/^0x[0-9a-f]{64}$/i.test(identity.danger || '')
  ) {
    return null
  }
  return identity as MobileIdentity
}

export async function saveMobileIdentity(identity: MobileIdentity | null) {
  if (typeof localStorage === 'undefined') return
  if (!identity) {
    localStorage.removeItem(IDENTITY_KEY)
    return
  }
  localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity))
}

export async function loadRemoteNodes() {
  const nodes = readJson<Partial<StoredRemoteNode>[]>(REMOTE_NODES_KEY)
  return normalizeRemoteNodes(Array.isArray(nodes) ? nodes : [])
}

export async function saveRemoteNodes(nodes: StoredRemoteNode[]) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(
    REMOTE_NODES_KEY,
    JSON.stringify(normalizeRemoteNodes(nodes))
  )
}
