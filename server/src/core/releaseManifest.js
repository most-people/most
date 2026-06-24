export const RELEASE_PLATFORMS = ['windows', 'macos', 'linux']
export const RELEASE_ARCHES = ['x64', 'arm64']
export const RELEASE_ASSET_KINDS = ['installer']

export const RELEASE_TARGETS = Object.freeze([
  { platform: 'windows', arch: 'x64' },
  { platform: 'windows', arch: 'arm64' },
  { platform: 'macos', arch: 'x64' },
  { platform: 'macos', arch: 'arm64' },
  { platform: 'linux', arch: 'x64' },
  { platform: 'linux', arch: 'arm64' },
])

const RELEASE_PLATFORM_SET = new Set(RELEASE_PLATFORMS)
const RELEASE_ARCH_SET = new Set(RELEASE_ARCHES)
const RELEASE_ASSET_KIND_SET = new Set(RELEASE_ASSET_KINDS)

function isRecord(value) {
  return typeof value === 'object' && value !== null
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function isPositiveFiniteNumber(value) {
  return Number.isFinite(value) && value > 0
}

function isOptionalNonEmptyString(value) {
  return typeof value === 'undefined' || isNonEmptyString(value)
}

export function isReleaseAsset(value) {
  if (!isRecord(value)) return false

  return (
    RELEASE_PLATFORM_SET.has(value.platform) &&
    RELEASE_ARCH_SET.has(value.arch) &&
    RELEASE_ASSET_KIND_SET.has(value.kind) &&
    isNonEmptyString(value.filename) &&
    isPositiveFiniteNumber(value.size) &&
    isNonEmptyString(value.cid) &&
    isNonEmptyString(value.githubUrl) &&
    isOptionalNonEmptyString(value.r2Url)
  )
}

export function isReleaseManifest(value) {
  if (!isRecord(value)) return false
  if (!isNonEmptyString(value.version)) return false
  if (!isNonEmptyString(value.publishedAt)) return false
  if (!Array.isArray(value.assets)) return false

  return value.assets.every(isReleaseAsset)
}

export function getReleaseAssetKey(asset) {
  return `${asset.platform}:${asset.arch}`
}

export function getInstallerReleaseAssets(manifest) {
  if (!isReleaseManifest(manifest)) return []
  return manifest.assets.filter(asset => asset.kind === 'installer')
}

export function hasR2ReleaseAssets(assets) {
  if (!Array.isArray(assets)) return false
  return assets.some(asset => isRecord(asset) && isNonEmptyString(asset.r2Url))
}

export function resolveReleaseAssetDownload(asset, preferredSource = 'r2') {
  if (
    preferredSource === 'r2' &&
    isRecord(asset) &&
    isNonEmptyString(asset.r2Url)
  ) {
    return {
      source: 'r2',
      url: asset.r2Url,
    }
  }

  return {
    source: 'github',
    url:
      isRecord(asset) && isNonEmptyString(asset.githubUrl)
        ? asset.githubUrl
        : '',
  }
}
