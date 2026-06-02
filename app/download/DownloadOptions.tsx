'use client'

import { useEffect, useState } from 'react'
import { Apple, Cloud, Code, Download, Laptop, Monitor } from 'lucide-react'

type DownloadPlatform = 'windows' | 'macos' | 'linux'
type DownloadArch = 'x64' | 'arm64'
type DownloadSource = 'r2' | 'github'

type DownloadAsset = {
  platform: DownloadPlatform
  arch: DownloadArch
  kind: 'installer'
  filename: string
  size?: number
  sha256?: string
  r2Url?: string
  githubUrl: string
}

type DownloadManifest = {
  version: string
  publishedAt: string
  assets: DownloadAsset[]
}

type DownloadStatus = 'loading' | 'ready' | 'fallback'

const GITHUB_LATEST_URL = 'https://github.com/most-people/most/releases/latest'

const DEFAULT_R2_PUBLIC_BASE_URL = 'https://download.most.box'

const RELEASE_MANIFEST_URL =
  process.env.NEXT_PUBLIC_RELEASE_MANIFEST_URL ||
  `${(
    process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || DEFAULT_R2_PUBLIC_BASE_URL
  ).replace(/\/+$/, '')}/releases/latest.json`

const FALLBACK_ASSETS: DownloadAsset[] = [
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
]

const PLATFORM_META = {
  windows: {
    name: 'Windows',
    ext: '.exe',
    desc: 'Windows 10 或更高版本',
    icon: Monitor,
  },
  macos: {
    name: 'macOS',
    ext: '.dmg',
    desc: 'macOS 12 Monterey 或更高版本',
    icon: Apple,
  },
  linux: {
    name: 'Linux',
    ext: '.AppImage',
    desc: 'Ubuntu 20.04+ / Debian 11+ / 其他主流发行版',
    icon: Laptop,
  },
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isDownloadAsset(value: unknown): value is DownloadAsset {
  if (!isRecord(value)) return false

  return (
    ['windows', 'macos', 'linux'].includes(String(value.platform)) &&
    ['x64', 'arm64'].includes(String(value.arch)) &&
    value.kind === 'installer' &&
    typeof value.filename === 'string' &&
    typeof value.githubUrl === 'string' &&
    (typeof value.r2Url === 'string' || typeof value.r2Url === 'undefined')
  )
}

function isDownloadManifest(value: unknown): value is DownloadManifest {
  if (!isRecord(value)) return false
  if (typeof value.version !== 'string') return false
  if (typeof value.publishedAt !== 'string') return false
  if (!Array.isArray(value.assets)) return false

  return value.assets.every(isDownloadAsset)
}

function getNavigatorPlatform() {
  const navigatorWithData = navigator as Navigator & {
    userAgentData?: { platform?: string }
  }

  return [
    navigatorWithData.userAgentData?.platform,
    navigator.platform,
    navigator.userAgent,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function detectCurrentKey() {
  if (typeof navigator === 'undefined') return 'windows:x64'

  const platform = getNavigatorPlatform()
  const arch = /arm|aarch64/.test(platform) ? 'arm64' : 'x64'

  if (/mac|darwin/.test(platform)) return `macos:${arch}`
  if (/linux/.test(platform)) return `linux:${arch}`
  return `windows:${arch}`
}

function formatSize(size?: number) {
  if (!size) return ''

  const mb = size / 1024 / 1024
  return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`
}

function getSourceLabel(asset: DownloadAsset) {
  return asset.r2Url ? 'Cloudflare R2 高速镜像' : 'GitHub Releases'
}

export default function DownloadOptions() {
  const [manifest, setManifest] = useState<DownloadManifest | null>(null)
  const [status, setStatus] = useState<DownloadStatus>(
    RELEASE_MANIFEST_URL ? 'loading' : 'fallback'
  )
  const [currentKey, setCurrentKey] = useState('windows:x64')
  const [downloadSource, setDownloadSource] = useState<DownloadSource>('r2')

  useEffect(() => {
    setCurrentKey(detectCurrentKey())
  }, [])

  useEffect(() => {
    if (!RELEASE_MANIFEST_URL) return

    const controller = new AbortController()

    fetch(RELEASE_MANIFEST_URL, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(response => {
        if (!response.ok) {
          throw new Error(`Manifest request failed: ${response.status}`)
        }
        return response.json()
      })
      .then(data => {
        if (!isDownloadManifest(data)) {
          throw new Error('Invalid download manifest')
        }
        setManifest(data)
        setStatus('ready')
      })
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }
        setManifest(null)
        setStatus('fallback')
      })

    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (status === 'fallback') {
      setDownloadSource('github')
    }
  }, [status])

  const assets = manifest?.assets.length ? manifest.assets : FALLBACK_ASSETS
  const hasR2Assets = assets.some(asset => asset.r2Url)
  const activeSource = downloadSource === 'r2' && hasR2Assets ? 'r2' : 'github'

  return (
    <div className="download-options">
      <div
        className="download-source-tabs"
        role="tablist"
        aria-label="下载来源"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeSource === 'r2'}
          disabled={!hasR2Assets}
          className={
            activeSource === 'r2'
              ? 'download-source-tab is-active'
              : 'download-source-tab'
          }
          onClick={() => setDownloadSource('r2')}
        >
          <Cloud size={16} />
          Cloudflare R2
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeSource === 'github'}
          className={
            activeSource === 'github'
              ? 'download-source-tab is-active'
              : 'download-source-tab'
          }
          onClick={() => setDownloadSource('github')}
        >
          <Code size={16} />
          GitHub Releases
        </button>
      </div>

      <p className="download-source-note">
        {status === 'loading'
          ? '正在获取 Cloudflare R2 高速镜像。'
          : status === 'ready' && manifest
            ? `当前版本 ${manifest.version}，可切换 Cloudflare R2 或 GitHub Releases 下载。`
            : '无法获取高速镜像信息，已切换到 GitHub Releases 备用下载。'}
      </p>

      <div className="download-platform-grid">
        {assets.map(asset => {
          const meta = PLATFORM_META[asset.platform]
          const Icon = meta.icon
          const key = `${asset.platform}:${asset.arch}`
          const primaryUrl =
            activeSource === 'r2' && asset.r2Url ? asset.r2Url : asset.githubUrl
          const isCurrent = key === currentKey

          return (
            <article
              key={key}
              className={
                isCurrent
                  ? 'download-platform-card is-recommended'
                  : 'download-platform-card'
              }
            >
              <div className="download-platform-icon">
                <Icon size={32} />
              </div>
              <div className="download-platform-content">
                <div className="download-platform-heading">
                  <h3>{meta.name}</h3>
                  <span>{asset.arch}</span>
                </div>
                <p>{meta.desc}</p>
                <dl className="download-platform-meta">
                  <div>
                    <dt>来源</dt>
                    <dd>
                      {activeSource === 'r2' && asset.r2Url
                        ? getSourceLabel(asset)
                        : 'GitHub Releases'}
                    </dd>
                  </div>
                  {asset.size ? (
                    <div>
                      <dt>大小</dt>
                      <dd>{formatSize(asset.size)}</dd>
                    </div>
                  ) : null}
                  {asset.sha256 ? (
                    <div>
                      <dt>SHA256</dt>
                      <dd>{asset.sha256.slice(0, 12)}</dd>
                    </div>
                  ) : null}
                </dl>
                <div className="download-platform-actions">
                  <a href={primaryUrl} className="btn btn-primary">
                    <Download size={16} />
                    下载 {meta.ext}
                  </a>
                </div>
              </div>
              {isCurrent ? (
                <span className="download-recommended-badge">当前</span>
              ) : null}
            </article>
          )
        })}
      </div>
    </div>
  )
}
