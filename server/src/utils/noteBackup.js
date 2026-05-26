import { mostDecode, mostEncode, mostSignMessage } from './mostWallet.js'
import { calculateNoteCid } from './noteUtils.js'

export const NOTE_BACKUP_API_URL = 'https://api.most.box/api/backup'

async function readBackupApiError(response, fallback) {
  const data = await response
    .clone()
    .json()
    .catch(() => null)
  return data?.error || fallback
}

export function encryptNotesBackup(notes, danger) {
  return mostEncode(JSON.stringify({ notes: notes || [] }), danger)
}

export function decryptNotesBackup(content, danger) {
  if (!String(content || '').startsWith('mp://1')) {
    throw new Error('无效的备份数据格式')
  }

  const decrypted = mostDecode(content, danger)
  if (!decrypted) {
    throw new Error('解密失败，请确认当前 Web3 登录账号正确')
  }

  const data = JSON.parse(decrypted)
  if (!Array.isArray(data.notes)) {
    throw new Error('备份数据缺少 notes')
  }
  return data
}

export async function calculateNotesBackupCid(notes) {
  return calculateNoteCid(JSON.stringify({ notes: notes || [] }))
}

export async function getBackupAuthHeaders(
  wallet,
  method,
  url = NOTE_BACKUP_API_URL
) {
  const timestamp = Date.now().toString()
  const path = new URL(url).pathname
  const message = `${timestamp}:${String(method).toUpperCase()}:${path}`
  const { address, signature } = await mostSignMessage(wallet.danger, message)
  return {
    Authorization: `${address},${timestamp},${signature}`,
  }
}

export async function buildNotesBackupUpload(wallet, notes) {
  const payload = JSON.stringify({ notes: notes || [] })
  const cid = await calculateNoteCid(payload)
  const encrypted = encryptNotesBackup(notes, wallet.danger)
  return {
    cid,
    body: encrypted,
    headers: {
      'Content-Type': 'text/plain',
      'x-backup-cid': cid,
      ...(await getBackupAuthHeaders(wallet, 'PUT', NOTE_BACKUP_API_URL)),
    },
  }
}

export async function uploadNotesBackup(
  wallet,
  notes,
  url = NOTE_BACKUP_API_URL
) {
  const upload = await buildNotesBackupUpload(wallet, notes)
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

export async function downloadNotesBackup(wallet, url = NOTE_BACKUP_API_URL) {
  const response = await fetch(url, {
    method: 'GET',
    headers: await getBackupAuthHeaders(wallet, 'GET', url),
  })
  if (response.status === 404) {
    return {
      found: false,
      cid: '',
      time: 0,
      notes: [],
    }
  }
  if (!response.ok) {
    throw new Error(await readBackupApiError(response, '云端恢复失败'))
  }

  const encrypted = await response.text()
  if (!encrypted) {
    throw new Error('云端无备份数据')
  }

  const data = decryptNotesBackup(encrypted, wallet.danger)
  return {
    found: true,
    cid: response.headers.get('x-backup-cid') || '',
    time: Number(response.headers.get('x-backup-time') || 0),
    notes: data.notes,
  }
}
