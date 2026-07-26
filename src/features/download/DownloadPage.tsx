import '~/styles/marketing.css'
import '~/styles/download.css'
import { useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import {
  Container,
  Download,
  ExternalLink,
  Monitor,
  Terminal,
} from 'lucide-react'
import { CopyButton } from '~/components/CopyButton'
import DownloadOptions from '~/components/DownloadOptions'
import { MarketingHeader } from '~/components/MarketingHeader'
import { useI18n } from '~/lib/i18n'

const NPM_COMMAND = 'npx most-box@latest'
const DOCKER_COMMAND =
  'docker run -d --name mostbox --network host --restart unless-stopped -e HOME=/data -v "$PWD/mostbox-data:/data" ghcr.io/most-people/most-box:latest'

const deploymentOptions = [
  {
    key: 'desktop',
    titleKey: 'download.deployment.desktop.title',
    tagKey: 'download.deployment.desktop.tag',
    descKey: 'download.deployment.desktop.desc',
    actionKey: 'download.deployment.desktop.action',
    href: '#client-downloads',
    command: null,
    icon: Monitor,
    external: false,
  },
  {
    key: 'npm',
    titleKey: 'download.deployment.npm.title',
    tagKey: 'download.deployment.npm.tag',
    descKey: 'download.deployment.npm.desc',
    actionKey: 'download.deployment.npm.action',
    href: 'https://www.npmjs.com/package/most-box',
    command: NPM_COMMAND,
    icon: Terminal,
    external: true,
  },
  {
    key: 'docker',
    titleKey: 'download.deployment.docker.title',
    tagKey: 'download.deployment.docker.tag',
    descKey: 'download.deployment.docker.desc',
    actionKey: 'download.deployment.docker.action',
    href: 'https://github.com/most-people/most#飞牛-os--nas-局域网部署',
    command: DOCKER_COMMAND,
    icon: Container,
    external: true,
  },
] as const

const webVsDesktop = [
  {
    featureKey: 'download.comparison.node',
    webKey: 'download.comparison.webConnectsNode',
    desktopKey: 'download.comparison.desktopBuiltinNode',
  },
  {
    featureKey: 'download.comparison.fileSharing',
    webKey: 'download.comparison.webDependsNode',
    desktopKey: 'download.comparison.desktopFull',
  },
  {
    featureKey: 'download.comparison.verification',
    webKey: 'download.comparison.webDependsNode',
    desktopKey: 'download.comparison.desktopFull',
  },
  {
    featureKey: 'download.comparison.seeding',
    webKey: 'download.comparison.webDependsNode',
    desktopKey: 'download.comparison.desktopDefaultOn',
  },
  {
    featureKey: 'download.comparison.largeFiles',
    webKey: 'download.comparison.webDependsNode',
    desktopKey: 'download.comparison.desktop10gb',
  },
] as const

export default function DownloadPage() {
  const { t } = useI18n()

  useEffect(() => {
    document.title = t('download.meta.title')
  }, [t])

  return (
    <div className="download-page">
      <MarketingHeader />

      <section className="download-hero">
        <div className="mkt-container">
          <div className="download-hero-icon">
            <Download size={40} />
          </div>
          <h1 className="download-hero-title">{t('download.hero.title')}</h1>
          <p className="download-hero-desc">{t('download.hero.desc')}</p>
        </div>
      </section>

      <section id="client-downloads" className="download-platforms">
        <div className="mkt-container">
          <h2 className="download-section-title">
            {t('download.platforms.title')}
          </h2>
          <DownloadOptions />
        </div>
      </section>

      <section className="download-deployments">
        <div className="mkt-container">
          <h2 className="download-section-title">
            {t('download.deployment.title')}
          </h2>
          <p className="download-section-desc">
            {t('download.deployment.desc')}
          </p>

          <div className="download-deployment-grid">
            {deploymentOptions.map(option => {
              const Icon = option.icon

              return (
                <article
                  key={option.key}
                  className="download-deployment-card ui-glass-surface"
                >
                  <div className="download-deployment-heading">
                    <span className="download-deployment-icon">
                      <Icon size={24} />
                    </span>
                    <div>
                      <h3>{t(option.titleKey)}</h3>
                      <span>{t(option.tagKey)}</span>
                    </div>
                  </div>

                  <p>{t(option.descKey)}</p>

                  {option.command ? (
                    <div className="download-deployment-command">
                      <code>{option.command}</code>
                      <CopyButton text={option.command} />
                    </div>
                  ) : null}

                  <a
                    href={option.href}
                    className="btn btn-secondary download-deployment-action"
                    target={option.external ? '_blank' : undefined}
                    rel={option.external ? 'noreferrer' : undefined}
                  >
                    {option.external ? (
                      <ExternalLink size={16} />
                    ) : (
                      <Download size={16} />
                    )}
                    {t(option.actionKey)}
                  </a>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      <section className="download-comparison">
        <div className="mkt-container">
          <h2 className="download-section-title">
            {t('download.comparison.title')}
          </h2>
          <div className="download-table-wrap">
            <table className="download-table">
              <thead>
                <tr>
                  <th>{t('download.comparison.feature')}</th>
                  <th>{t('download.comparison.web')}</th>
                  <th>{t('download.comparison.desktop')}</th>
                </tr>
              </thead>
              <tbody>
                {webVsDesktop.map(row => (
                  <tr key={row.featureKey}>
                    <td>{t(row.featureKey)}</td>
                    <td className="col-web">{t(row.webKey)}</td>
                    <td className="col-desktop">{t(row.desktopKey)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="download-cta">
        <div className="mkt-container">
          <Link to="/" className="btn btn-primary">
            {t('common.backHome')}
          </Link>
        </div>
      </section>

      <footer className="mkt-footer">
        <div className="mkt-container">
          <div className="mkt-footer-inner">
            <p className="mkt-footer-copy">MostBox</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
