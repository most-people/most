import { mostCrust, mostDecode, mostEncode } from './mostWallet.js'
import { calculateNoteCid } from './noteUtils.js'

export const NOTE_BACKUP_API_URL = 'https://api.most.box/api/backup'

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

export function getBackupAuthHeaders(wallet, method, url = NOTE_BACKUP_API_URL) {
  const { crust_address, sign } = mostCrust(wallet.danger)
  const timestamp = Date.now().toString()
  const path = new URL(url).pathname
  const message = `${timestamp}:${String(method).toUpperCase()}:${path}`
  return {
    Authorization: `${crust_address},${timestamp},${sign(message)}`,
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
      ...getBackupAuthHeaders(wallet, 'PUT', NOTE_BACKUP_API_URL),
    },
  }
}
