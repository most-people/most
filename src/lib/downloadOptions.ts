import {
  getInstallerReleaseAssets,
  getReleaseAssetKey,
  hasR2ReleaseAssets,
  resolveReleaseAssetDownload,
} from '~server/src/core/releaseManifest.js'

export type DownloadPlatform = 'windows' | 'macos' | 'linux' | 'android'
export type DownloadArch = 'x64' | 'arm64' | 'universal'
export type DownloadSource = 'r2' | 'github'

export type DownloadAsset = {
  platform: DownloadPlatform
  arch: DownloadArch
  kind: 'installer'
  filename: string
  size?: number
  cid?: string
  r2Url?: string
  githubUrl: string
}

export type DownloadManifest = {
  version: string
  publishedAt: string
  assets: DownloadAsset[]
}

export type DownloadOptionsState = {
  assets: DownloadAsset[]
  currentAsset: DownloadAsset | null
  otherAssets: DownloadAsset[]
  hasR2Assets: boolean
  activeSource: DownloadSource
  currentDownload: {
    source: DownloadSource
    url: string
  } | null
}

export const GITHUB_LATEST_URL =
  'https://github.com/most-people/most/releases/latest'

export const DEFAULT_R2_PUBLIC_BASE_URL = 'https://download.most.box'

export const FALLBACK_DOWNLOAD_ASSETS: DownloadAsset[] = [
  {
    platform: 'windows',
    arch: 'x64',
    kind: 'installer',
    filename: 'GitHub Releases',
    githubUrl: GITHUB_LATEST_URL,
  },
  {
    platform: 'windows',
    arch: 'arm64',
    kind: 'installer',
    filename: 'GitHub Releases',
    githubUrl: GITHUB_LATEST_URL,
  },
  {
    platform: 'macos',
    arch: 'x64',
    kind: 'installer',
    filename: 'GitHub Releases',
    githubUrl: GITHUB_LATEST_URL,
  },
  {
    platform: 'macos',
    arch: 'arm64',
    kind: 'installer',
    filename: 'GitHub Releases',
    githubUrl: GITHUB_LATEST_URL,
  },
  {
    platform: 'linux',
    arch: 'x64',
    kind: 'installer',
    filename: 'GitHub Releases',
    githubUrl: GITHUB_LATEST_URL,
  },
  {
    platform: 'linux',
    arch: 'arm64',
    kind: 'installer',
    filename: 'GitHub Releases',
    githubUrl: GITHUB_LATEST_URL,
  },
  {
    platform: 'android',
    arch: 'universal',
    kind: 'installer',
    filename: 'GitHub Releases',
    githubUrl: GITHUB_LATEST_URL,
  },
]

export function getReleaseManifestUrl(env: {
  VITE_RELEASE_MANIFEST_URL?: string
  VITE_R2_PUBLIC_BASE_URL?: string
}) {
  return (
    env.VITE_RELEASE_MANIFEST_URL ||
    `${(env.VITE_R2_PUBLIC_BASE_URL || DEFAULT_R2_PUBLIC_BASE_URL).replace(
      /\/+$/,
      ''
    )}/releases/latest.json`
  )
}

export function getDownloadOptionsState({
  manifest,
  currentKey,
  requestedSource,
}: {
  manifest: DownloadManifest | null
  currentKey: string
  requestedSource: DownloadSource
}): DownloadOptionsState {
  const installerAssets = manifest
    ? (getInstallerReleaseAssets(manifest) as DownloadAsset[])
    : []
  const assets = installerAssets.length
    ? installerAssets
    : FALLBACK_DOWNLOAD_ASSETS
  const hasR2Assets = hasR2ReleaseAssets(assets)
  const activeSource = requestedSource === 'r2' && hasR2Assets ? 'r2' : 'github'
  const currentAsset =
    assets.find(asset => getReleaseAssetKey(asset) === currentKey) || null
  const otherAssets = currentAsset
    ? assets.filter(asset => getReleaseAssetKey(asset) !== currentKey)
    : assets
  const currentDownload = currentAsset
    ? (resolveReleaseAssetDownload(currentAsset, activeSource) as {
        source: DownloadSource
        url: string
      })
    : null

  return {
    assets,
    currentAsset,
    otherAssets,
    hasR2Assets,
    activeSource,
    currentDownload,
  }
}

export function resolveDownloadAsset(
  asset: DownloadAsset,
  activeSource: DownloadSource
) {
  return resolveReleaseAssetDownload(asset, activeSource) as {
    source: DownloadSource
    url: string
  }
}
