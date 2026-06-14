import '~/styles/marketing.css'
import '~/styles/download.css'
import { useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, Download } from 'lucide-react'
import DownloadOptions from '~/components/DownloadOptions'
import { LanguageToggle } from '~/components/LanguageToggle'
import { MarketingThemeToggle } from '~/components/MarketingThemeToggle'
import { useI18n } from '~/lib/i18n'

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
      <nav className="mkt-nav">
        <div className="mkt-nav-inner">
          <Link to="/" className="mkt-nav-logo">
            <ArrowLeft size={18} />
            <span>MOST PEOPLE</span>
          </Link>
          <div className="mkt-nav-cta">
            <MarketingThemeToggle />
            <LanguageToggle className="mkt-theme-toggle" />
          </div>
        </div>
      </nav>

      <section className="download-hero">
        <div className="mkt-container">
          <div className="download-hero-icon">
            <Download size={40} />
          </div>
          <h1 className="download-hero-title">{t('download.hero.title')}</h1>
          <p className="download-hero-desc">{t('download.hero.desc')}</p>
        </div>
      </section>

      <section className="download-platforms">
        <div className="mkt-container">
          <h2 className="download-section-title">
            {t('download.platforms.title')}
          </h2>
          <DownloadOptions />
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
          <p className="download-hero-desc">{t('download.npmNote')}</p>
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
