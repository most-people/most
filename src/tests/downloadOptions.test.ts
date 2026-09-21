import { describe, expect, it } from 'vitest'

import {
  FALLBACK_DOWNLOAD_ASSETS,
  detectDownloadPlatformKey,
  getDownloadOptionsState,
  getReleaseManifestUrl,
  resolveDownloadAsset,
  type DownloadManifest,
} from '~/lib/downloadOptions'

describe('detectDownloadPlatformKey', () => {
  it('returns null when no hint is available', () => {
    expect(detectDownloadPlatformKey({})).toBeNull()
  })

  it('detects windows on x64 and arm64', () => {
    expect(
      detectDownloadPlatformKey({ userAgentDataPlatform: 'Windows' })
    ).toBe('windows:x64')
    expect(
      detectDownloadPlatformKey({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; ARM64)',
      })
    ).toBe('windows:arm64')
  })

  it('detects macOS on x64 and apple silicon', () => {
    expect(detectDownloadPlatformKey({ navigatorPlatform: 'MacIntel' })).toBe(
      'macos:x64'
    )
    expect(
      detectDownloadPlatformKey({
        navigatorPlatform: 'MacIntel',
        userAgent: 'arm64',
      })
    ).toBe('macos:arm64')
  })

  it('detects linux', () => {
    expect(
      detectDownloadPlatformKey({ navigatorPlatform: 'Linux x86_64' })
    ).toBe('linux:x64')
    expect(
      detectDownloadPlatformKey({ navigatorPlatform: 'Linux aarch64' })
    ).toBe('linux:arm64')
  })

  it('prefers iOS over macOS for iphone and ipad user agents', () => {
    expect(
      detectDownloadPlatformKey({
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      })
    ).toBe('ios:universal')
    expect(
      detectDownloadPlatformKey({
        userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0)',
      })
    ).toBe('ios:universal')
  })

  it('treats a touch mac as iPadOS', () => {
    expect(
      detectDownloadPlatformKey({
        navigatorPlatform: 'MacIntel',
        maxTouchPoints: 5,
      })
    ).toBe('ios:universal')
  })

  it('detects android from the user agent', () => {
    expect(
      detectDownloadPlatformKey({
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)',
      })
    ).toBe('android:universal')
  })

  it('treats mobile linux as android', () => {
    expect(
      detectDownloadPlatformKey({
        userAgentDataPlatform: 'Linux',
        userAgentDataMobile: true,
      })
    ).toBe('android:universal')
  })

  it('treats touch linux arm as android', () => {
    expect(
      detectDownloadPlatformKey({
        navigatorPlatform: 'Linux aarch64',
        maxTouchPoints: 5,
      })
    ).toBe('android:universal')
  })
})

describe('getReleaseManifestUrl', () => {
  it('prefers an explicit manifest url', () => {
    expect(
      getReleaseManifestUrl({
        VITE_RELEASE_MANIFEST_URL: 'https://example.com/latest.json',
        VITE_R2_PUBLIC_BASE_URL: 'https://download.example.com',
      })
    ).toBe('https://example.com/latest.json')
  })

  it('builds the manifest url from an r2 base url', () => {
    expect(
      getReleaseManifestUrl({
        VITE_R2_PUBLIC_BASE_URL: 'https://dl.example.com/',
      })
    ).toBe('https://dl.example.com/releases/latest.json')
  })

  it('falls back to the default public base url', () => {
    expect(getReleaseManifestUrl({})).toBe(
      'https://download.most.box/releases/latest.json'
    )
  })
})

describe('fallback assets', () => {
  it('covers six desktop targets without android', () => {
    expect(FALLBACK_DOWNLOAD_ASSETS).toHaveLength(6)
    expect(
      FALLBACK_DOWNLOAD_ASSETS.some(asset => asset.platform === 'android')
    ).toBe(false)
    expect(
      FALLBACK_DOWNLOAD_ASSETS.every(asset => asset.size === undefined)
    ).toBe(true)
    expect(
      FALLBACK_DOWNLOAD_ASSETS.every(asset => asset.r2Url === undefined)
    ).toBe(true)
  })
})

const installer = (
  platform: 'windows' | 'macos' | 'linux' | 'android',
  arch: 'x64' | 'arm64' | 'universal',
  extra: { r2Url?: string; size?: number } = {}
) => ({
  platform,
  arch,
  kind: 'installer' as const,
  filename: `MostBox-1.2.3-${platform}-${arch}.bin`,
  size: extra.size ?? 1024,
  cid: 'bafytest',
  githubUrl: `https://github.com/most-people/most/releases/download/v1.2.3/${platform}-${arch}`,
  ...(extra.r2Url ? { r2Url: extra.r2Url } : {}),
})

const manifest = (
  assets: ReturnType<typeof installer>[]
): DownloadManifest => ({
  version: '1.2.3',
  publishedAt: '2026-01-01T00:00:00.000Z',
  assets,
})

describe('getDownloadOptionsState', () => {
  it('falls back to the built-in assets when the manifest is missing', () => {
    const state = getDownloadOptionsState({
      manifest: null,
      currentKey: null,
      requestedSource: 'r2',
    })

    expect(state.assets).toEqual(FALLBACK_DOWNLOAD_ASSETS)
    expect(state.hasR2Assets).toBe(false)
    expect(state.activeSource).toBe('github')
    expect(state.currentAsset).toBeNull()
    expect(state.otherAssets).toEqual(FALLBACK_DOWNLOAD_ASSETS)
    expect(state.currentDownload).toBeNull()
  })

  it('falls back when the manifest does not validate', () => {
    const invalid = {
      version: '1.2.3',
      publishedAt: '2026-01-01T00:00:00.000Z',
      assets: [{ platform: 'windows' }],
    } as unknown as DownloadManifest

    const state = getDownloadOptionsState({
      manifest: invalid,
      currentKey: null,
      requestedSource: 'r2',
    })

    expect(state.assets).toEqual(FALLBACK_DOWNLOAD_ASSETS)
  })

  it('drops android from a valid manifest and keeps the desktop assets', () => {
    const state = getDownloadOptionsState({
      manifest: manifest([
        installer('windows', 'x64'),
        installer('macos', 'arm64'),
        installer('android', 'universal'),
      ]),
      currentKey: null,
      requestedSource: 'github',
    })

    expect(state.assets).toHaveLength(2)
    expect(state.assets.some(asset => asset.platform === 'android')).toBe(false)
  })

  it('selects the requested asset and lists the rest as other assets', () => {
    const state = getDownloadOptionsState({
      manifest: manifest([
        installer('windows', 'x64'),
        installer('windows', 'arm64'),
      ]),
      currentKey: 'windows:arm64',
      requestedSource: 'github',
    })

    expect(state.currentAsset?.arch).toBe('arm64')
    expect(
      state.otherAssets.map(asset => `${asset.platform}:${asset.arch}`)
    ).toEqual(['windows:x64'])
    expect(state.currentDownload).toEqual({
      source: 'github',
      url: state.currentAsset?.githubUrl,
    })
  })

  it('returns null for a current download when no asset matches the key', () => {
    const state = getDownloadOptionsState({
      manifest: manifest([installer('windows', 'x64')]),
      currentKey: 'linux:arm64',
      requestedSource: 'github',
    })

    expect(state.currentAsset).toBeNull()
    expect(state.currentDownload).toBeNull()
    expect(state.otherAssets).toHaveLength(1)
  })

  it('uses r2 only when the requested source is r2 and an r2 url exists', () => {
    const withR2 = manifest([
      installer('windows', 'x64', {
        r2Url: 'https://download.most.box/win.exe',
      }),
    ])

    const r2State = getDownloadOptionsState({
      manifest: withR2,
      currentKey: 'windows:x64',
      requestedSource: 'r2',
    })
    expect(r2State.hasR2Assets).toBe(true)
    expect(r2State.activeSource).toBe('r2')
    expect(r2State.currentDownload).toEqual({
      source: 'r2',
      url: 'https://download.most.box/win.exe',
    })

    const githubState = getDownloadOptionsState({
      manifest: withR2,
      currentKey: 'windows:x64',
      requestedSource: 'github',
    })
    expect(githubState.activeSource).toBe('github')
    expect(githubState.currentDownload?.source).toBe('github')
  })

  it('forces github when r2 was requested but no asset has an r2 url', () => {
    const state = getDownloadOptionsState({
      manifest: manifest([installer('windows', 'x64')]),
      currentKey: 'windows:x64',
      requestedSource: 'r2',
    })

    expect(state.hasR2Assets).toBe(false)
    expect(state.activeSource).toBe('github')
    expect(state.currentDownload?.source).toBe('github')
  })
})

describe('resolveDownloadAsset', () => {
  it('prefers r2 when available', () => {
    expect(
      resolveDownloadAsset(
        installer('linux', 'x64', { r2Url: 'https://download.most.box/linux' }),
        'r2'
      )
    ).toEqual({ source: 'r2', url: 'https://download.most.box/linux' })
  })

  it('falls back to the github url', () => {
    const asset = installer('linux', 'x64')
    expect(resolveDownloadAsset(asset, 'r2')).toEqual({
      source: 'github',
      url: asset.githubUrl,
    })
  })
})
