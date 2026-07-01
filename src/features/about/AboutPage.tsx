import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  Check,
  CloudOff,
  Download,
  Fingerprint,
  Gamepad2,
  MessageSquare,
  Network,
  NotebookPen,
  Wallet,
} from 'lucide-react'

import { AppTop } from '~/components/AppTop'
import { MarketingLayout } from '~/components/MarketingLayout'
import { useI18n, type MessageKey } from '~/lib/i18n'

interface AboutSection {
  icon: ReactNode
  titleKey: MessageKey
  bodyKey: MessageKey
  bulletKeys: MessageKey[]
  featured?: boolean
}

const summaryKeys: MessageKey[] = [
  'about.summary.cid',
  'about.summary.seed',
  'about.summary.toolbox',
  'about.summary.opensource',
]

const sections: AboutSection[] = [
  {
    icon: <Fingerprint size={22} />,
    titleKey: 'about.section.identity.title',
    bodyKey: 'about.section.identity.body',
    bulletKeys: [
      'about.section.identity.bullet.filename',
      'about.section.identity.bullet.verify',
      'about.section.identity.bullet.local',
    ],
  },
  {
    icon: <Network size={22} />,
    titleKey: 'about.section.spread.title',
    bodyKey: 'about.section.spread.body',
    bulletKeys: [
      'about.section.spread.bullet.seedAfterDownload',
      'about.section.spread.bullet.restart',
      'about.section.spread.bullet.status',
    ],
  },
  {
    icon: <CloudOff size={22} />,
    titleKey: 'about.section.boundary.title',
    bodyKey: 'about.section.boundary.body',
    bulletKeys: [
      'about.section.boundary.bullet.keepData',
      'about.section.boundary.bullet.noMarket',
      'about.section.boundary.bullet.availability',
    ],
  },
  {
    icon: <MessageSquare size={22} />,
    titleKey: 'about.section.chat.title',
    bodyKey: 'about.section.chat.body',
    bulletKeys: [
      'about.section.chat.bullet.room',
      'about.section.chat.bullet.voice',
      'about.section.chat.bullet.attachments',
    ],
  },
  {
    icon: <NotebookPen size={22} />,
    titleKey: 'about.section.note.title',
    bodyKey: 'about.section.note.body',
    bulletKeys: [
      'about.section.note.bullet.markdown',
      'about.section.note.bullet.fromChat',
      'about.section.note.bullet.backup',
    ],
  },
  {
    icon: <Gamepad2 size={22} />,
    titleKey: 'about.section.game.title',
    bodyKey: 'about.section.game.body',
    bulletKeys: [
      'about.section.game.bullet.channel',
      'about.section.game.bullet.rooms',
      'about.section.game.bullet.lightweight',
    ],
  },
  {
    icon: <Wallet size={22} />,
    titleKey: 'about.section.web3.title',
    bodyKey: 'about.section.web3.body',
    bulletKeys: [
      'about.section.web3.bullet.accounts',
      'about.section.web3.bullet.integrate',
      'about.section.web3.bullet.export',
      'about.section.web3.bullet.separate',
    ],
    featured: true,
  },
]

export default function AboutPage() {
  const { t } = useI18n()

  return (
    <MarketingLayout header={<AboutHeader />}>
      <div className="about-page">
        <section className="about-hero">
          <div className="mkt-container">
            <p className="about-kicker">{t('about.hero.kicker')}</p>
            <h1 className="about-title">{t('about.hero.title')}</h1>
            <p className="about-lede">{t('about.hero.desc')}</p>
            <code className="about-link-example" translate="no">
              {t('about.link.example')}
            </code>

            <ul className="about-summary">
              {summaryKeys.map(key => (
                <li key={key} className="about-summary-item">
                  <span className="about-summary-icon">
                    <Check size={15} strokeWidth={3} />
                  </span>
                  <span>{t(key)}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="about-section-band">
          <div className="mkt-container">
            <div className="about-section-grid">
              {sections.map(section => {
                const className = section.featured
                  ? 'about-topic featured'
                  : 'about-topic'

                return (
                  <article key={section.titleKey} className={className}>
                    <div className="about-topic-icon">{section.icon}</div>
                    <h2>{t(section.titleKey)}</h2>
                    <p>{t(section.bodyKey)}</p>
                    <ul>
                      {section.bulletKeys.map(key => (
                        <li key={key}>
                          <Check size={14} strokeWidth={3} />
                          <span>{t(key)}</span>
                        </li>
                      ))}
                    </ul>
                  </article>
                )
              })}
            </div>

            <div className="about-actions">
              <Link to="/chat/" className="btn btn-primary">
                {t('about.cta.chat')}
                <ArrowRight size={16} />
              </Link>
              <Link to="/download/" className="btn btn-secondary">
                <Download size={16} />
                {t('about.cta.download')}
              </Link>
            </div>
          </div>
        </section>
      </div>
    </MarketingLayout>
  )
}

function AboutHeader() {
  return (
    <header className="about-app-header">
      <div className="mkt-container">
        <AppTop />
      </div>
    </header>
  )
}
