import {
  computeHmac,
  decodeBase64,
  encodeBase64,
  getBytes,
  hexlify,
} from 'ethers'
import nacl from 'tweetnacl'

export const ACCOUNT_SYNC_ENVELOPE_PREFIX = 'ma://1'
const SYNC_KEY_DOMAIN = 'most-box-account-sync-key-v1'
const SYNC_TOPIC_DOMAIN = 'most-box-account-sync-topic-v1'
const ENTRY_VERSION = 1

function hmacSha256(key, label) {
  return getBytes(computeHmac('sha256', key, new TextEncoder().encode(label)))
}

/** 节点只持有同步子密钥，topic 由它派生，两端各自算出同一个值。 */
export function deriveAccountSyncTopic(syncKey) {
  return hexlify(hmacSha256(getBytes(syncKey), SYNC_TOPIC_DOMAIN))
}

/**
 * 从账号种子单向派生同步子密钥。节点只保存子密钥，泄露它不会泄露种子或钱包签名能力。
 * topic 由子密钥再派生，不含公开地址，外人无法凭地址猜出账号同步 topic。
 */
export function deriveAccountSyncKeys(danger) {
  const syncKey = hexlify(hmacSha256(getBytes(danger), SYNC_KEY_DOMAIN))
  return { syncKey, topic: deriveAccountSyncTopic(syncKey) }
}

function normalizeEntry(input) {
  const kind = String(input?.kind || '').trim()
  const id = String(input?.id || '').trim()
  const deviceId = String(input?.deviceId || '').trim()
  const updatedAt = Number(input?.updatedAt)
  if (!kind || !id || !deviceId || !Number.isFinite(updatedAt)) {
    throw new TypeError('Invalid account sync entry')
  }
  return {
    v: ENTRY_VERSION,
    kind,
    id,
    deviceId,
    updatedAt,
    deleted: input.deleted === true,
    data: input.deleted === true ? null : (input.data ?? null),
  }
}

export function sealAccountEntry(entry, syncKey) {
  const normalized = normalizeEntry(entry)
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength)
  const encrypted = nacl.secretbox(
    new TextEncoder().encode(JSON.stringify(normalized)),
    nonce,
    getBytes(syncKey)
  )
  return [
    ACCOUNT_SYNC_ENVELOPE_PREFIX,
    encodeBase64(nonce),
    encodeBase64(encrypted),
  ].join('.')
}

/** 解密失败、被篡改或格式非法时返回 null，调用方直接忽略该条目。 */
export function openAccountEntry(envelope, syncKey) {
  try {
    const [prefix, nonce64, encrypted64] = String(envelope || '').split('.')
    if (prefix !== ACCOUNT_SYNC_ENVELOPE_PREFIX || !nonce64 || !encrypted64) {
      return null
    }
    const decrypted = nacl.secretbox.open(
      decodeBase64(encrypted64),
      decodeBase64(nonce64),
      getBytes(syncKey)
    )
    if (!decrypted) return null
    const parsed = JSON.parse(new TextDecoder().decode(decrypted))
    if (parsed?.v !== ENTRY_VERSION) return null
    return normalizeEntry(parsed)
  } catch {
    return null
  }
}

export function compareAccountEntries(left, right) {
  return (
    left.updatedAt - right.updatedAt ||
    (left.deviceId < right.deviceId
      ? -1
      : left.deviceId > right.deviceId
        ? 1
        : 0) ||
    compareText(JSON.stringify(left.data), JSON.stringify(right.data))
  )
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}

/**
 * 按 kind+id 取最新条目（last-writer-wins），结果与输入顺序无关。
 * 删除用 deleted 墓碑表示，保留在结果里以免旧条目复活。
 */
export function mergeAccountEntries(entries) {
  const winners = new Map()
  for (const entry of entries) {
    const key = `${entry.kind}:${entry.id}`
    const current = winners.get(key)
    if (!current || compareAccountEntries(entry, current) > 0) {
      winners.set(key, entry)
    }
  }
  return winners
}
