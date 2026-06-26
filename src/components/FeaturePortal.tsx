import React, { useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  FolderOpen,
  MessageSquare,
  NotebookPen,
  Wallet,
  ArrowRight,
  ArrowUpRight,
  Check,
  ExternalLink,
  Download,
  Server,
  HardDrive,
  Gamepad2,
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
  | '/admin/'
  | '/download/'

interface FeatureDef {
  id: string
  titleKey: MessageKey
  subtitleKey: MessageKey
  icon: React.ReactNode
  path: InternalRoutePath
  requiresBackend: boolean
  heroKey: MessageKey
  descKey: MessageKey
  featureKeys: MessageKey[]
  steps: {
    num: string
    titleKey: MessageKey
    descKey: MessageKey
    code?: string
    link?: InternalRoutePath
    linkTextKey?: MessageKey
    hideInDesktopClient?: boolean
  }[]
}

const features: FeatureDef[] = [
  {
    id: 'app',
    titleKey: 'portal.feature.app.title',
    subtitleKey: 'portal.feature.app.subtitle',
    icon: <FolderOpen size={28} />,
    path: '/app/',
    requiresBackend: true,
    heroKey: 'portal.feature.app.hero',
    descKey: 'portal.feature.app.desc',
    featureKeys: [
      'portal.feature.app.bullet.localIdentity',
      'portal.feature.app.bullet.hyperswarm',
      'portal.feature.app.bullet.largeFiles',
      'portal.feature.app.bullet.cid',
      'portal.feature.app.bullet.seedAfterDownload',
      'portal.feature.app.bullet.noCloud',
      'portal.feature.app.bullet.desktop',
      'portal.feature.app.bullet.openSource',
    ],
    steps: [
      {
        num: '1',
        titleKey: 'portal.feature.app.step.download.title',
        descKey: 'portal.feature.app.step.download.desc',
        link: '/download/',
        linkTextKey: 'portal.feature.app.step.download.link',
        hideInDesktopClient: true,
      },
      {
        num: '2',
        titleKey: 'portal.feature.app.step.install.title',
        descKey: 'portal.feature.app.step.install.desc',
        hideInDesktopClient: true,
      },
      {
        num: '3',
        titleKey: 'portal.feature.app.step.share.title',
        descKey: 'portal.feature.app.step.share.desc',
      },
    ],
  },
  {
    id: 'chat',
    titleKey: 'portal.feature.chat.title',
    subtitleKey: 'portal.feature.chat.subtitle',
    icon: <MessageSquare size={28} />,
    path: '/chat/',
    requiresBackend: true,
    heroKey: 'portal.feature.chat.hero',
    descKey: 'portal.feature.chat.desc',
    featureKeys: [
      'portal.feature.chat.bullet.encrypted',
      'portal.feature.chat.bullet.identity',
      'portal.feature.chat.bullet.sync',
      'portal.feature.chat.bullet.offline',
      'portal.feature.chat.bullet.noAccount',
    ],
    steps: [
      {
        num: '1',
        titleKey: 'portal.feature.chat.step.download.title',
        descKey: 'portal.feature.chat.step.download.desc',
        link: '/download/',
        linkTextKey: 'portal.feature.chat.step.download.link',
        hideInDesktopClient: true,
      },
      {
        num: '2',
        titleKey: 'portal.feature.chat.step.create.title',
        descKey: 'portal.feature.chat.step.create.desc',
      },
      {
        num: '3',
        titleKey: 'portal.feature.chat.step.send.title',
        descKey: 'portal.feature.chat.step.send.desc',
      },
    ],
  },
  {
    id: 'note',
    titleKey: 'portal.feature.note.title',
    subtitleKey: 'portal.feature.note.subtitle',
    icon: <NotebookPen size={28} />,
    path: '/note/',
    requiresBackend: false,
    heroKey: 'portal.feature.note.hero',
    descKey: 'portal.feature.note.desc',
    featureKeys: [
      'portal.feature.note.bullet.markdown',
      'portal.feature.note.bullet.privacy',
      'portal.feature.note.bullet.folders',
      'portal.feature.note.bullet.web3',
      'portal.feature.note.bullet.backup',
      'portal.feature.note.bullet.independent',
    ],
    steps: [
      {
        num: '1',
        titleKey: 'portal.feature.note.step.account.title',
        descKey: 'portal.feature.note.step.account.desc',
      },
      {
        num: '2',
        titleKey: 'portal.feature.note.step.create.title',
        descKey: 'portal.feature.note.step.create.desc',
      },
      {
        num: '3',
        titleKey: 'portal.feature.note.step.backup.title',
        descKey: 'portal.feature.note.step.backup.desc',
      },
    ],
  },
  {
    id: 'gandengyan',
    titleKey: 'portal.feature.game.title',
    subtitleKey: 'portal.feature.game.subtitle',
    icon: <Gamepad2 size={28} />,
    path: '/game/gandengyan/',
    requiresBackend: true,
    heroKey: 'portal.feature.game.hero',
    descKey: 'portal.feature.game.desc',
    featureKeys: [
      'portal.feature.game.bullet.account',
      'portal.feature.game.bullet.channel',
      'portal.feature.game.bullet.link',
      'portal.feature.game.bullet.rules',
      'portal.feature.game.bullet.maintain',
    ],
    steps: [
      {
        num: '1',
        titleKey: 'portal.feature.game.step.login.title',
        descKey: 'portal.feature.game.step.login.desc',
      },
      {
        num: '2',
        titleKey: 'portal.feature.game.step.create.title',
        descKey: 'portal.feature.game.step.create.desc',
      },
      {
        num: '3',
        titleKey: 'portal.feature.game.step.test.title',
        descKey: 'portal.feature.game.step.test.desc',
      },
    ],
  },
  {
    id: 'web3',
    titleKey: 'portal.feature.web3.title',
    subtitleKey: 'portal.feature.web3.subtitle',
    icon: <Wallet size={28} />,
    path: '/web3/',
    requiresBackend: false,
    heroKey: 'portal.feature.web3.hero',
    descKey: 'portal.feature.web3.desc',
    featureKeys: [
      'portal.feature.web3.bullet.frontend',
      'portal.feature.web3.bullet.keys',
      'portal.feature.web3.bullet.mnemonic',
      'portal.feature.web3.bullet.eth',
      'portal.feature.web3.bullet.pem',
      'portal.feature.web3.bullet.qr',
    ],
    steps: [
      {
        num: '1',
        titleKey: 'portal.feature.web3.step.username.title',
        descKey: 'portal.feature.web3.step.username.desc',
      },
      {
        num: '2',
        titleKey: 'portal.feature.web3.step.keys.title',
        descKey: 'portal.feature.web3.step.keys.desc',
      },
      {
        num: '3',
        titleKey: 'portal.feature.web3.step.export.title',
        descKey: 'portal.feature.web3.step.export.desc',
      },
    ],
  },
]

const featureOrder = ['chat', 'app', 'note', 'gandengyan', 'web3']

export default function FeaturePortal() {
  const hasBackend = useAppStore(s => s.hasBackend)
  const openConnectModal = useAppStore(s => s.openConnectModal)
  const [selected, setSelected] = useState<string>('chat')
  const { t } = useI18n()
  const isDesktopClient = useIsDesktopClient()
  const orderedFeatures = featureOrder
    .map(id => features.find(f => f.id === id))
    .filter((feature): feature is FeatureDef => Boolean(feature))

  const activeFeature =
    orderedFeatures.find(f => f.id === selected) || orderedFeatures[0]
  const activeFeatureTitle = t(activeFeature.titleKey)
  const activeFeatureSteps = activeFeature.steps.filter(
    step => !(isDesktopClient && step.hideInDesktopClient)
  )

  return (
    <div className="portal-page">
      <section className="portal-hero">
        <div className="mkt-container">
          <h1 className="portal-hero-title">{t('common.brand')}</h1>
          <p className="portal-hero-subtitle">{t('portal.hero.subtitle')}</p>
        </div>
      </section>

      <section className="portal-cards-section">
        <div className="mkt-container">
          <div className="portal-cards">
            {orderedFeatures.map(f => {
              const isActive = selected === f.id
              const needsBackend = f.requiresBackend
              const backendStatus = needsBackend
                ? hasBackend === true
                  ? 'connected'
                  : hasBackend === false
                    ? 'disconnected'
                    : 'checking'
                : 'none'
              const title = t(f.titleKey)

              return (
                <button
                  key={f.id}
                  className={`portal-card ${isActive ? 'active' : ''}`}
                  onClick={() => setSelected(f.id)}
                >
                  <Link
                    to={f.path}
                    className="btn btn-icon portal-card-open-btn"
                    onClick={e => e.stopPropagation()}
                    title={t('portal.openFeature', { title })}
                  >
                    <ArrowUpRight size={16} />
                  </Link>
                  <div className="portal-card-icon">{f.icon}</div>
                  <div className="portal-card-title">{title}</div>
                  <div className="portal-card-subtitle">
                    {t(f.subtitleKey)}
                  </div>
                  {needsBackend ? (
                    <div
                      className={`ui-badge portal-card-status ${backendStatus}`}
                    >
                      {backendStatus === 'checking' && (
                        <>
                          <span className="status-dot checking" />
                          {t('common.status.checking')}
                        </>
                      )}
                      {backendStatus === 'connected' && (
                        <>
                          <span className="status-dot connected" />
                          {t('common.status.connected')}
                        </>
                      )}
                      {backendStatus === 'disconnected' && (
                        <>
                          <span className="status-dot disconnected" />
                          {t('common.status.needsConnection')}
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="ui-badge portal-card-status ready">
                      <span className="status-dot ready" />
                      {t('common.status.ready')}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
          <div className="portal-node-actions" aria-label={t('portal.nodeEntry')}>
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
      </section>

      <section className="portal-marketing">
        <div className="mkt-container">
          <div className="portal-marketing-inner">
            <div className="portal-marketing-header">
              <h2>{t(activeFeature.heroKey)}</h2>
              <p>{t(activeFeature.descKey)}</p>
            </div>

            <div className="portal-marketing-features">
              {activeFeature.featureKeys.map(featKey => (
                <div key={featKey} className="portal-feature-item">
                  <span className="portal-feature-icon">
                    <Check size={14} strokeWidth={3} />
                  </span>
                  <span>{t(featKey)}</span>
                </div>
              ))}
            </div>

            <div className="portal-marketing-steps">
              {activeFeatureSteps.map((step, index) => (
                <div key={step.num} className="portal-step">
                  <span className="portal-step-num">{index + 1}</span>
                  <div className="portal-step-content">
                    <strong>{t(step.titleKey)}</strong>
                    <p>{t(step.descKey)}</p>
                    {step.code && (
                      <code className="portal-step-code" translate="no">
                        {step.code}
                      </code>
                    )}
                    {step.link && step.linkTextKey && (
                      <p className="portal-step-link">
                        <Link to={step.link}>
                          {t(step.linkTextKey)} <ExternalLink size={12} />
                        </Link>
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="portal-actions">
              <Link to={activeFeature.path} className="btn btn-primary">
                {t('portal.enterFeature', { title: activeFeatureTitle })}
                <ArrowRight size={16} />
              </Link>
              {activeFeature.requiresBackend && hasBackend === false && (
                <>
                  <button
                    onClick={openConnectModal}
                    className="btn btn-secondary"
                  >
                    <Server size={16} />
                    {t('portal.webConnectNode')}
                  </button>
                  {!isDesktopClient && (
                    <Link to="/download/" className="btn btn-secondary">
                      <Download size={16} />
                      {t('nav.downloadClient')}
                    </Link>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
