import { most25519 } from './mostWallet.js'
import { shortAddress } from '../core/shared.js'
import { createDeviceKey, issueDeviceCert } from './auth.js'
import { deriveAccountSyncTopic } from './accountSync.js'
import { chatAccountFromSeed, deriveChatSeed } from './chatIdentity.js'

/** Stored identities without this version are v1 and must sign in again. */
export const IDENTITY_VERSION = 2

function displayNameFor(username, address) {
  return `${username}#${address.slice(-4).toUpperCase()}`
}

/** Address preview for the login form: the v2 chat identity (scrypt, ~1 s). */
export async function createLoginIdentity(username, password) {
  const chatSeed = await deriveChatSeed(username, password)
  const { address } = chatAccountFromSeed(chatSeed)
  return {
    username,
    address,
    displayName: displayNameFor(username, address),
  }
}

/**
 * 由 v2 聊天身份种子生成本机会话：设备密钥证书、同步子密钥和公钥。
 * `identity` 可持久化，不含种子；`danger`（聊天身份种子）只应留在内存中。
 */
export async function createSessionFromChatSeed(
  { username, chatSeed },
  options = {}
) {
  const { address, syncKey } = chatAccountFromSeed(chatSeed)
  const device = createDeviceKey()
  const cert = await issueDeviceCert(chatSeed, device.publicKey, options)
  const keys = most25519(chatSeed)
  return {
    identity: {
      version: IDENTITY_VERSION,
      username,
      address,
      displayName: displayNameFor(username, address),
      device: { ...device, cert },
      syncKey,
      syncTopic: deriveAccountSyncTopic(syncKey),
      publicKeys: { x25519: keys.public_key, ed25519: keys.ed_public_key },
    },
    danger: chatSeed,
  }
}

/** Signs in with the current chat identity (docs/protocol/v2/signatures.md §7). */
export async function createLoginSession(username, password, options = {}) {
  const chatSeed = await deriveChatSeed(username, password)
  return createSessionFromChatSeed({ username, chatSeed }, options)
}

export function loadIdentity() {
  if (typeof localStorage === 'undefined') return null
  try {
    const data = localStorage.getItem('mostbox_identity')
    if (!data) return null
    return JSON.parse(data)
  } catch {
    return null
  }
}

export function saveIdentity(identity) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem('mostbox_identity', JSON.stringify(identity))
}

export function clearIdentity() {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem('mostbox_identity')
}

export function getDisplayName(address, username) {
  if (!username) {
    return shortAddress(address)
  }
  return displayNameFor(username, address)
}
