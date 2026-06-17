export const DEFAULT_RELEASE_MANIFEST_URL =
  'https://download.most.box/releases/latest.json'

const PLATFORM_BY_PROCESS = {
  darwin: 'macos',
  linux: 'linux',
  win32: 'windows',
}

export function getReleaseManifestUrl(env = process.env) {
  return env.MOSTBOX_RELEASE_MANIFEST_URL || DEFAULT_RELEASE_MANIFEST_URL
}

export function getCurrentPlatform(processPlatform = process.platform) {
  return PLATFORM_BY_PROCESS[processPlatform] || null
}

export function getCurrentArch(processArch = process.arch) {
  if (processArch === 'x64' || processArch === 'arm64') return processArch
  return null
}

function parseVersion(version) {
  if (typeof version !== 'string') return null

  const match = version.trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/)
  if (!match) return null

  return match.slice(1).map(part => Number(part))
}

export function isNewerVersion(candidateVersion, currentVersion) {
  const candidate = parseVersion(candidateVersion)
  const current = parseVersion(currentVersion)

  if (!candidate || !current) return false

  for (let index = 0; index < candidate.length; index += 1) {
    if (candidate[index] > current[index]) return true
    if (candidate[index] < current[index]) return false
  }

  return false
}

function isRecord(value) {
  return typeof value === 'object' && value !== null
}

function hasDownloadUrl(asset) {
  return typeof asset.r2Url === 'string' || typeof asset.githubUrl === 'string'
}

export function findUpdateAsset(manifest, platform, arch) {
  if (!isRecord(manifest) || !Array.isArray(manifest.assets)) return null

  const compatibleAssets = manifest.assets.filter(
    asset =>
      isRecord(asset) &&
      asset.platform === platform &&
      asset.arch === arch &&
      (asset.kind === 'updater' || asset.kind === 'installer') &&
      typeof asset.cid === 'string' &&
      hasDownloadUrl(asset) &&
      (typeof asset.githubUrl === 'string' ||
        typeof asset.githubUrl === 'undefined') &&
      (typeof asset.r2Url === 'string' || typeof asset.r2Url === 'undefined')
  )

  return (
    compatibleAssets.find(asset => asset.kind === 'updater') ||
    compatibleAssets.find(asset => asset.kind === 'installer') ||
    null
  )
}

export function formatBytes(size) {
  if (!Number.isFinite(size) || size <= 0) return ''

  const mb = size / 1024 / 1024
  return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`
}

export function getAvailableUpdate(manifest, options = {}) {
  const currentVersion = options.currentVersion
  const platform = options.platform
  const arch = options.arch

  if (
    !isRecord(manifest) ||
    typeof manifest.version !== 'string' ||
    !isNewerVersion(manifest.version, currentVersion)
  ) {
    return null
  }

  const asset = findUpdateAsset(manifest, platform, arch)
  if (!asset) return null

  const downloadUrl = asset.r2Url || asset.githubUrl

  return {
    version: manifest.version,
    asset,
    cid: asset.cid,
    downloadUrl,
  }
}
