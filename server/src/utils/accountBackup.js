import { mostDecode, mostEncode, mostSignMessage } from './mostWallet.js'
import { calculateNoteCid } from './noteUtils.js'

export const ACCOUNT_BACKUP_API_URL = 'https://api.most.box/auth/backup'
export const ACCOUNT_BACKUP_TYPE = 'mostbox.account-backup'
export const ACCOUNT_BACKUP_SCHEMA_VERSION = 1

async function readBackupApiError(response, fallback) {
  const data = await response
    .clone()
    .json()
    .catch(() => null)
  return data?.error || fallback
}

export function validateAccountBackupPayload(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('无效的账号备份数据')
  }
  if (
    input.type !== ACCOUNT_BACKUP_TYPE ||
    Number(input.schemaVersion) !== ACCOUNT_BACKUP_SCHEMA_VERSION
  ) {
    throw new Error('无效的账号备份格式')
  }
  if (!String(input.ownerAddress || '').trim()) {
    throw new Error('账号备份缺少 ownerAddress')
  }
  if (!Array.isArray(input.notes)) {
    throw new Error('账号备份缺少 notes')
  }
  if (
    input.noteVault !== undefined &&
    (!input.noteVault ||
      typeof input.noteVault !== 'object' ||
      !Array.isArray(input.noteVault.files))
  ) {
    throw new Error('账号备份 noteVault 格式无效')
  }
  return input
}

export function encryptAccountBackup(payload, danger) {
  return mostEncode(
    JSON.stringify(validateAccountBackupPayload(payload)),
    danger
  )
}

export function decryptAccountBackup(content, danger) {
  if (!String(content || '').startsWith('mp://1')) {
    throw new Error('无效的备份数据格式')
  }

  const decrypted = mostDecode(content, danger)
  if (!decrypted) {
    throw new Error('解密失败，请确认当前 Web3 登录账号正确')
  }

  return validateAccountBackupPayload(JSON.parse(decrypted))
}

export async function calculateAccountBackupCid(payload) {
  return calculateNoteCid(JSON.stringify(validateAccountBackupPayload(payload)))
}

export async function getAccountBackupAuthHeaders(
  wallet,
  method,
  url = ACCOUNT_BACKUP_API_URL
) {
  const timestamp = Date.now().toString()
  const path = new URL(url).pathname
  const message = `${timestamp}:${String(method).toUpperCase()}:${path}`
  const { address, signature } = await mostSignMessage(wallet.danger, message)
  return {
    Authorization: `${address},${timestamp},${signature}`,
  }
}

export async function buildAccountBackupUpload(wallet, payload) {
  const cid = await calculateAccountBackupCid(payload)
  const encrypted = encryptAccountBackup(payload, wallet.danger)
  return {
    cid,
    body: encrypted,
    headers: {
      'Content-Type': 'text/plain',
      'x-backup-cid': cid,
      ...(await getAccountBackupAuthHeaders(
        wallet,
        'PUT',
        ACCOUNT_BACKUP_API_URL
      )),
    },
  }
}

export async function uploadAccountBackup(
  wallet,
  payload,
  url = ACCOUNT_BACKUP_API_URL
) {
  const upload = await buildAccountBackupUpload(wallet, payload)
  const response = await fetch(url, {
    method: 'PUT',
    headers: upload.headers,
    body: upload.body,
  })
  if (!response.ok) {
    throw new Error(await readBackupApiError(response, '云备份失败'))
  }
  return {
    cid: upload.cid,
  }
}

export async function downloadAccountBackup(
  wallet,
  url = ACCOUNT_BACKUP_API_URL
) {
  const response = await fetch(url, {
    method: 'GET',
    headers: await getAccountBackupAuthHeaders(wallet, 'GET', url),
  })
  if (response.status === 404) {
    return {
      found: false,
      cid: '',
      time: 0,
      payload: null,
    }
  }
  if (!response.ok) {
    throw new Error(await readBackupApiError(response, '云端恢复失败'))
  }

  const encrypted = await response.text()
  if (!encrypted) {
    throw new Error('云端无备份数据')
  }

  return {
    found: true,
    cid: response.headers.get('x-backup-cid') || '',
    time: Number(response.headers.get('x-backup-time') || 0),
    payload: decryptAccountBackup(encrypted, wallet.danger),
  }
}
