import {
  getInstallerReleaseAssets,
  isReleaseManifest,
  resolveReleaseAssetDownload,
} from '../server/src/core/releaseManifest.js'
import { isAllowedExternalHost } from './security.js'

export const DEFAULT_RELEASE_MANIFEST_URL =
  'https://download.most.box/releases/latest.json'

const DEFAULT_RELEASE_DOWNLOAD_HOSTS = ['download.most.box', 'github.com']

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

export function findUpdateAsset(manifest, platform, arch) {
  return (
    getInstallerReleaseAssets(manifest).find(
      asset => asset.platform === platform && asset.arch === arch
    ) || null
  )
}

export function isSafeReleaseDownloadUrl(
  value,
  manifestUrl = DEFAULT_RELEASE_MANIFEST_URL
) {
  const allowedHosts = new Set(DEFAULT_RELEASE_DOWNLOAD_HOSTS)
  try {
    allowedHosts.add(new URL(manifestUrl).hostname.toLowerCase())
  } catch {}
  return isAllowedExternalHost(value, allowedHosts)
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
    !isReleaseManifest(manifest) ||
    !isNewerVersion(manifest.version, currentVersion)
  ) {
    return null
  }

  const asset = findUpdateAsset(manifest, platform, arch)
  if (!asset) return null

  const { url: downloadUrl } = resolveReleaseAssetDownload(asset, 'r2')
  if (
    !downloadUrl ||
    !isSafeReleaseDownloadUrl(downloadUrl, options.manifestUrl)
  ) {
    return null
  }

  return {
    version: manifest.version,
    asset,
    downloadUrl,
  }
}
