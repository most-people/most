const BLOCKED_EXTENSIONS = new Set([
  'aab',
  'apk',
  'apks',
  'app',
  'bat',
  'cmd',
  'com',
  'dex',
  'dmg',
  'exe',
  'ipa',
  'jar',
  'msi',
  'pkg',
  'ps1',
  'sh',
  'so',
  'xapk',
])

const BLOCKED_MIME_TYPES = new Set([
  'application/java-archive',
  'application/vnd.android.package-archive',
  'application/x-apple-diskimage',
  'application/x-dosexec',
  'application/x-msdownload',
])

export function getStoreFilePolicyError(fileName: string, mimeType?: string) {
  const extension = fileName.trim().split('.').pop()?.toLowerCase() || ''
  const normalizedMimeType = mimeType?.trim().toLowerCase() || ''

  if (
    BLOCKED_EXTENSIONS.has(extension) ||
    BLOCKED_MIME_TYPES.has(normalizedMimeType)
  ) {
    return 'Google Play 版本不接收应用安装包、脚本或其他可执行文件。'
  }

  return ''
}

export function getStoreDownloadPolicyError(
  fileName: string,
  hasExplicitFileName: boolean
) {
  if (!hasExplicitFileName) {
    return 'Google Play 版本只接收带有明确 filename 的 most:// 链接。'
  }

  return getStoreFilePolicyError(fileName)
}
