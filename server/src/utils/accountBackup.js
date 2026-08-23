import { mostDecode, mostEncode } from './mostWallet.js'

export const ACCOUNT_BACKUP_TYPE = 'mostbox.account-backup'
export const ACCOUNT_BACKUP_SCHEMA_VERSION = 1

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
