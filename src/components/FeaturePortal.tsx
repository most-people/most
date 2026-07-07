import type React from 'react'
import { Link } from '@tanstack/react-router'
import {
  ArrowUpRight,
  Download,
  FolderOpen,
  Gamepad2,
  HardDrive,
  MessagesSquare,
  NotebookPen,
  Server,
  Wallet,
} from 'lucide-react'
import { useIsDesktopClient } from '~/hooks'
import { useAppStore } from '~/stores/useAppStore'
import { useI18n, type MessageKey } from '~/lib/i18n'

type InternalRoutePath =
  | '/app/'
  | '/chat/'
  | '/note/'
  | '/game/gandengyan/'
  | '/web3/'

interface FeatureDef {
  id: string
  titleKey: MessageKey
  subtitleKey: MessageKey
  descKey: MessageKey
  icon: React.ReactNode
  path: InternalRoutePath
  requiresBackend: boolean
}

const features: FeatureDef[] = [
  {
    id: 'app',
    titleKey: 'portal.feature.app.title',
    subtitleKey: 'portal.feature.app.subtitle',
    descKey: 'portal.feature.app.desc',
    icon: <FolderOpen size={28} />,
    path: '/app/',
    requiresBackend: true,
  },
  {
    id: 'chat',
    titleKey: 'portal.feature.chat.title',
    subtitleKey: 'portal.feature.chat.subtitle',
    descKey: 'portal.feature.chat.desc',
    icon: <MessagesSquare size={28} />,
    path: '/chat/',
    requiresBackend: true,
  },
  {
    id: 'note',
    titleKey: 'portal.feature.note.title',
    subtitleKey: 'portal.feature.note.subtitle',
    descKey: 'portal.feature.note.desc',
    icon: <NotebookPen size={28} />,
    path: '/note/',
    requiresBackend: false,
  },
  {
    id: 'gandengyan',
    titleKey: 'portal.feature.game.title',
    subtitleKey: 'portal.feature.game.subtitle',
    descKey: 'portal.feature.game.desc',
    icon: <Gamepad2 size={28} />,
    path: '/game/gandengyan/',
    requiresBackend: true,
  },
  {
    id: 'web3',
    titleKey: 'portal.feature.web3.title',
    subtitleKey: 'portal.feature.web3.subtitle',
    descKey: 'portal.feature.web3.desc',
    icon: <Wallet size={28} />,
    path: '/web3/',
    requiresBackend: false,
  },
]

const featureOrder = ['app', 'chat', 'note', 'gandengyan', 'web3']

type PortalBackendStatus = 'checking' | 'connected' | 'disconnected'

function getPortalBackendStatus(hasBackend: boolean | null) {
  if (hasBackend === true) return 'connected'
  if (hasBackend === false) return 'disconnected'
  return 'checking'
}

export default function FeaturePortal() {
  const hasBackend = useAppStore(s => s.hasBackend)
  const openConnectModal = useAppStore(s => s.openConnectModal)
  const { t } = useI18n()
  const isDesktopClient = useIsDesktopClient()
  const orderedFeatures = featureOrder
    .map(id => features.find(f => f.id === id))
    .filter((feature): feature is FeatureDef => Boolean(feature))
  const backendStatus: PortalBackendStatus = getPortalBackendStatus(hasBackend)
  const backendStatusLabel =
    backendStatus === 'connected'
      ? t('common.status.connected')
      : backendStatus === 'disconnected'
        ? t('common.status.needsConnection')
        : t('common.status.checking')

  return (
    <div className="portal-page">
      <section className="portal-hero">
        <div className="mkt-container portal-hero-inner">
          <div className="portal-hero-copy">
            <div className="portal-hero-rule" aria-hidden="true" />
            <div className="portal-hero-kicker-row">
              <p className="portal-hero-kicker">Direct P2P toolbox</p>
              <span
                className={`portal-node-status ${backendStatus}`}
                aria-live="polite"
              >
                <span className={`status-dot ${backendStatus}`} />
                {backendStatusLabel}
              </span>
            </div>
            <h1 className="portal-hero-title">{t('common.brand')}</h1>
            <p className="portal-hero-subtitle">{t('portal.hero.subtitle')}</p>
            <div className="portal-hero-actions">
              {!isDesktopClient && (
                <Link to="/download/" className="btn btn-primary">
                  <Download size={16} />
                  {t('nav.downloadClient')}
                </Link>
              )}
              <button onClick={openConnectModal} className="btn btn-secondary">
                <Server size={16} />
                {t('portal.webConnectNode')}
              </button>
              <Link to="/admin/" className="btn btn-secondary">
                <HardDrive size={16} />
                {t('portal.nodeAdmin')}
              </Link>
            </div>
          </div>

          <div className="portal-feature-grid">
            {orderedFeatures.map(f => (
              <Link
                key={f.id}
                to={f.path}
                className={`portal-feature-card ${f.id}`}
              >
                <div className="portal-feature-card-head">
                  <div className="portal-feature-card-title">
                    <span className="portal-feature-card-icon">{f.icon}</span>
                    <h2>{t(f.titleKey)}</h2>
                  </div>
                  <span className="portal-feature-card-arrow">
                    <ArrowUpRight size={16} />
                  </span>
                </div>
                <p>{t(f.descKey)}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
