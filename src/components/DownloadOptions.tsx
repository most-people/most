import { useEffect, useState } from 'react'
import {
  Apple,
  CheckCircle2,
  Cloud,
  Code,
  Download,
  Laptop,
  Monitor,
  Smartphone,
  TabletSmartphone,
} from 'lucide-react'
import {
  getReleaseAssetKey,
  isReleaseManifest,
} from '~server/src/core/releaseManifest.js'
import {
  getDownloadOptionsState,
  getReleaseManifestUrl,
  resolveDownloadAsset,
  type DownloadAsset,
  type DownloadManifest,
  type DownloadSource,
} from '~/lib/downloadOptions'
import { formatMegabytes } from '~/lib/format'
import { useI18n } from '~/lib/i18n'

type DownloadStatus = 'loading' | 'ready' | 'fallback'

const RELEASE_MANIFEST_URL = getReleaseManifestUrl({
  VITE_RELEASE_MANIFEST_URL: import.meta.env.VITE_RELEASE_MANIFEST_URL,
  VITE_R2_PUBLIC_BASE_URL: import.meta.env.VITE_R2_PUBLIC_BASE_URL,
})

const PLATFORM_META = {
  windows: {
    name: 'Windows',
    ext: '.exe',
    descKey: 'download.platform.windows.desc',
    icon: Monitor,
  },
  macos: {
    name: 'macOS',
    ext: '.dmg',
    descKey: 'download.platform.macos.desc',
    icon: Apple,
  },
  linux: {
    name: 'Linux',
    ext: '.AppImage',
    descKey: 'download.platform.linux.desc',
    icon: Laptop,
  },
  android: {
    name: 'Android',
    ext: '.apk',
    descKey: 'download.platform.android.desc',
    icon: TabletSmartphone,
  },
} as const

const MOBILE_PLATFORMS = [
  {
    key: 'ios',
    nameKey: 'download.platform.ios.name',
    descKey: 'download.platform.ios.desc',
    icon: Smartphone,
  },
] as const

const ANDROID_DOWNLOAD_KEY = 'android:universal'

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

  if (/android/.test(platform)) return ANDROID_DOWNLOAD_KEY
  if (/mac|darwin/.test(platform)) return `macos:${arch}`
  if (/linux/.test(platform)) return `linux:${arch}`
  return `windows:${arch}`
}

export default function DownloadOptions() {
  const { t } = useI18n()
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
        if (!isReleaseManifest(data)) {
          throw new Error('Invalid download manifest')
        }
        setManifest(data as DownloadManifest)
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

  const { currentAsset, otherAssets, hasR2Assets, activeSource } =
    getDownloadOptionsState({
      manifest,
      currentKey,
      requestedSource: downloadSource,
    })

  const getAssetSourceLabel = (asset: DownloadAsset) =>
    resolveDownloadAsset(asset, activeSource).source === 'r2'
      ? t('download.source.r2Mirror')
      : 'GitHub Releases'

  const getAssetDownloadUrl = (asset: DownloadAsset) =>
    resolveDownloadAsset(asset, activeSource).url

  const renderCurrentAsset = (asset: DownloadAsset) => {
    const meta = PLATFORM_META[asset.platform]
    const Icon = meta.icon

    return (
      <article className="download-current-card">
        <div className="download-current-main">
          <div className="download-current-icon">
            <Icon size={34} />
          </div>
          <div className="download-current-copy">
            <div className="download-current-labels">
              <span className="download-current-kicker">
                <CheckCircle2 size={14} />
                {t('download.platform.currentSystem')}
              </span>
              <span className="download-current-recommended">
                {t('download.platform.recommended')}
              </span>
            </div>
            <div className="download-current-heading">
              <h3>{meta.name}</h3>
              <span>{asset.arch}</span>
            </div>
            <p>{t(meta.descKey)}</p>
            <dl className="download-current-meta">
              <div>
                <dt>{t('download.platform.source')}</dt>
                <dd>{getAssetSourceLabel(asset)}</dd>
              </div>
              {asset.size ? (
                <div>
                  <dt>{t('download.platform.size')}</dt>
                  <dd>{formatMegabytes(asset.size)}</dd>
                </div>
              ) : null}
              {asset.cid ? (
                <div>
                  <dt>CID</dt>
                  <dd>{asset.cid.slice(0, 12)}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        </div>
        <div className="download-current-actions">
          <span>{t('download.platform.matchedSystem')}</span>
          <a href={getAssetDownloadUrl(asset)} className="btn btn-primary">
            <Download size={17} />
            {t('download.platform.action', { ext: meta.ext })}
          </a>
          <p>{getAssetSourceLabel(asset)}</p>
        </div>
      </article>
    )
  }

  const renderAssetCard = (asset: DownloadAsset) => {
    const meta = PLATFORM_META[asset.platform]
    const Icon = meta.icon
    const key = getReleaseAssetKey(asset)
    const isCurrent = key === currentKey

    return (
      <article
        key={key}
        className={['download-platform-card', isCurrent ? 'is-recommended' : '']
          .filter(Boolean)
          .join(' ')}
      >
        <div className="download-platform-icon">
          <Icon size={32} />
        </div>
        <div className="download-platform-content">
          <div className="download-platform-heading">
            <h3>{meta.name}</h3>
            <span>{asset.arch}</span>
          </div>
          <p>{t(meta.descKey)}</p>
          <dl className="download-platform-meta">
            <div>
              <dt>{t('download.platform.source')}</dt>
              <dd>{getAssetSourceLabel(asset)}</dd>
            </div>
            {asset.size ? (
              <div>
                <dt>{t('download.platform.size')}</dt>
                <dd>{formatMegabytes(asset.size)}</dd>
              </div>
            ) : null}
            {asset.cid ? (
              <div>
                <dt>CID</dt>
                <dd>{asset.cid.slice(0, 12)}</dd>
              </div>
            ) : null}
          </dl>
          <div className="download-platform-actions">
            <a href={getAssetDownloadUrl(asset)} className="btn btn-primary">
              <Download size={16} />
              {t('download.platform.action', { ext: meta.ext })}
            </a>
          </div>
        </div>
        {isCurrent ? (
          <span className="download-recommended-badge">
            {t('download.platform.current')}
          </span>
        ) : null}
      </article>
    )
  }

  const renderComingSoonCard = (
    platform: (typeof MOBILE_PLATFORMS)[number]
  ) => {
    const Icon = platform.icon

    return (
      <article key={platform.key} className="download-coming-soon-card">
        <div className="download-platform-icon download-coming-soon-icon">
          <Icon size={32} />
        </div>
        <div className="download-platform-content">
          <div className="download-platform-heading">
            <h3>{t(platform.nameKey)}</h3>
            <span>{t('download.platform.comingSoon')}</span>
          </div>
          <p>{t(platform.descKey)}</p>
        </div>
      </article>
    )
  }

  return (
    <div className="download-options">
      <div
        className="ui-segmented-control download-source-tabs"
        role="tablist"
        aria-label={t('download.source.label')}
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeSource === 'r2'}
          disabled={!hasR2Assets}
          className={
            activeSource === 'r2'
              ? 'ui-segmented-option download-source-tab is-active'
              : 'ui-segmented-option download-source-tab'
          }
          onClick={() => setDownloadSource('r2')}
        >
          <Cloud size={15} />
          Cloudflare R2
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeSource === 'github'}
          className={
            activeSource === 'github'
              ? 'ui-segmented-option download-source-tab is-active'
              : 'ui-segmented-option download-source-tab'
          }
          onClick={() => setDownloadSource('github')}
        >
          <Code size={15} />
          GitHub Releases
        </button>
      </div>

      <p className="download-source-note">
        {status === 'loading'
          ? t('download.source.loading')
          : status === 'ready' && manifest
            ? t('download.source.ready', { version: manifest.version })
            : t('download.source.fallback')}
      </p>

      {currentAsset ? (
        <div
          className="download-current-platform"
          aria-label={t('download.platform.currentSystem')}
        >
          {renderCurrentAsset(currentAsset)}
        </div>
      ) : null}

      {otherAssets.length ? (
        <div className="download-other-platforms">
          <p className="download-other-platforms-title">
            {t('download.platform.otherPlatforms')}
          </p>
          <div className="download-platform-grid">
            {otherAssets.map(asset => renderAssetCard(asset))}
          </div>
          <div className="download-coming-soon">
            <p className="download-coming-soon-title">
              {t('download.platform.mobilePlatforms')}
            </p>
            <div className="download-coming-soon-grid">
              {MOBILE_PLATFORMS.map(platform => renderComingSoonCard(platform))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
