import { most25519, mostWallet } from './mostWallet.js'
import { shortAddress } from '../core/shared.js'
import { createDeviceKey, issueDeviceCert } from './auth.js'
import { deriveAccountSyncKeys } from './accountSync.js'

export function createLoginIdentity(username, password) {
  const { address, danger } = mostWallet(username, password)
  return {
    username,
    address,
    danger,
    displayName: `${username}#${address.slice(-4).toUpperCase()}`,
  }
}

/**
 * 由钱包结果（密码已派生出种子）生成本机会话：设备密钥证书、同步子密钥和公钥。
 * `identity` 可持久化，不含种子；`danger` 只应留在内存中供钱包类操作使用。
 */
export async function createSessionFromWallet(wallet, options = {}) {
  const { danger, username, address } = wallet
  const device = createDeviceKey()
  const cert = await issueDeviceCert(danger, device.publicKey, options)
  const { syncKey, topic: syncTopic } = deriveAccountSyncKeys(danger)
  const keys = most25519(danger)
  return {
    identity: {
      username,
      address,
      displayName: `${username}#${address.slice(-4).toUpperCase()}`,
      device: { ...device, cert },
      syncKey,
      syncTopic,
      publicKeys: { x25519: keys.public_key, ed25519: keys.ed_public_key },
    },
    danger,
  }
}

export function createLoginSession(username, password, options = {}) {
  return createSessionFromWallet(mostWallet(username, password), options)
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
  return `${username}#${address.slice(-4).toUpperCase()}`
}
