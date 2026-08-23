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

export const STORE_FILE_POLICY_ERROR_KEYS = {
  blockedExecutable: 'app.file.blockedExecutable',
} as const

export function getStoreFilePolicyErrorKey(
  fileName: string,
  mimeType?: string
) {
  const extension = fileName.trim().split('.').pop()?.toLowerCase() || ''
  const normalizedMimeType = mimeType?.trim().toLowerCase() || ''

  if (
    BLOCKED_EXTENSIONS.has(extension) ||
    BLOCKED_MIME_TYPES.has(normalizedMimeType)
  ) {
    return STORE_FILE_POLICY_ERROR_KEYS.blockedExecutable
  }

  return null
}

export function getStoreDownloadPolicyErrorKey(fileName: string) {
  return getStoreFilePolicyErrorKey(fileName)
}
