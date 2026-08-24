import * as SecureStore from 'expo-secure-store'
import type { MobileIdentity } from '../mobileCore/types'
import {
  normalizeRemoteNodes,
  type StoredRemoteNode,
} from './connectionHistory'

const IDENTITY_KEY = 'mostbox.mobile.identity.v1'
const REMOTE_NODES_KEY = 'mostbox.mobile.remote-nodes.v1'
const STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
}

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const value = await SecureStore.getItemAsync(key, STORE_OPTIONS)
    return value ? (JSON.parse(value) as T) : null
  } catch {
    return null
  }
}

export async function loadMobileIdentity() {
  const identity = await readJson<Partial<MobileIdentity>>(IDENTITY_KEY)
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
  if (!identity) {
    await SecureStore.deleteItemAsync(IDENTITY_KEY, STORE_OPTIONS)
    return
  }
  await SecureStore.setItemAsync(
    IDENTITY_KEY,
    JSON.stringify(identity),
    STORE_OPTIONS
  )
}

export async function loadRemoteNodes() {
  const nodes = await readJson<Partial<StoredRemoteNode>[]>(REMOTE_NODES_KEY)
  return normalizeRemoteNodes(Array.isArray(nodes) ? nodes : [])
}

export async function saveRemoteNodes(nodes: StoredRemoteNode[]) {
  await SecureStore.setItemAsync(
    REMOTE_NODES_KEY,
    JSON.stringify(normalizeRemoteNodes(nodes)),
    STORE_OPTIONS
  )
}
