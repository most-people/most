import * as FileSystem from 'expo-file-system/legacy'
import type { MobileIdentity } from '../mobileCore/types'
import {
  normalizeRemoteNodes,
  type StoredRemoteNode,
} from './connectionHistory'

const STATE_FILE = 'mostbox-remote-state.json'

type PersistedState = {
  identity?: Partial<MobileIdentity> | null
  nodes?: Partial<StoredRemoteNode>[]
}

function stateUri() {
  const base = FileSystem.documentDirectory || FileSystem.cacheDirectory
  return base ? `${base.replace(/\/$/, '')}/${STATE_FILE}` : ''
}

async function readState(): Promise<PersistedState> {
  const uri = stateUri()
  if (!uri) return {}
  try {
    const info = await FileSystem.getInfoAsync(uri)
    if (!info.exists) return {}
    const value = await FileSystem.readAsStringAsync(uri)
    const parsed: unknown = JSON.parse(value)
    return parsed && typeof parsed === 'object'
      ? (parsed as PersistedState)
      : {}
  } catch {
    return {}
  }
}

async function writeState(next: PersistedState) {
  const uri = stateUri()
  if (!uri) return
  await FileSystem.writeAsStringAsync(uri, JSON.stringify(next))
}

function normalizeIdentity(value: PersistedState['identity']) {
  if (
    !value?.username ||
    !value.address ||
    !/^0x[0-9a-f]{40}$/i.test(value.address) ||
    !/^0x[0-9a-f]{64}$/i.test(value.danger || '')
  ) {
    return null
  }
  return value as MobileIdentity
}

export async function loadMobileIdentity() {
  return normalizeIdentity((await readState()).identity)
}

export async function saveMobileIdentity(identity: MobileIdentity | null) {
  const state = await readState()
  await writeState({ ...state, identity })
}

export async function loadRemoteNodes() {
  const nodes = (await readState()).nodes
  return normalizeRemoteNodes(Array.isArray(nodes) ? nodes : [])
}

export async function saveRemoteNodes(nodes: StoredRemoteNode[]) {
  const state = await readState()
  await writeState({ ...state, nodes: normalizeRemoteNodes(nodes) })
}
