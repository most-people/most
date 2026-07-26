import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  Check,
  CloudOff,
  Download,
  ExternalLink,
  Fingerprint,
  MessagesSquare,
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

interface RelatedProject {
  name: string
  href: string
  descriptionKey: MessageKey
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
    icon: <MessagesSquare size={22} />,
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

const relatedProjects: RelatedProject[] = [
  {
    name: 'Keet',
    href: 'https://keet.io/',
    descriptionKey: 'about.related.keet',
  },
  {
    name: 'Jami',
    href: 'https://jami.net/',
    descriptionKey: 'about.related.jami',
  },
  {
    name: 'bitchat',
    href: 'https://bitchat.free/',
    descriptionKey: 'about.related.bitchat',
  },
  {
    name: 'Briar',
    href: 'https://briarproject.org/',
    descriptionKey: 'about.related.briar',
  },
  {
    name: 'RetroShare',
    href: 'https://retroshare.cc/',
    descriptionKey: 'about.related.retroshare',
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

        <section className="about-related-band">
          <div className="mkt-container">
            <div className="about-related-heading">
              <p className="about-kicker">{t('about.related.kicker')}</p>
              <h2>{t('about.related.title')}</h2>
              <p>{t('about.related.intro')}</p>
            </div>

            <div className="about-related-grid">
              {relatedProjects.map(project => (
                <a
                  key={project.name}
                  className="about-related-project"
                  href={project.href}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span className="about-related-project-name">
                    {project.name}
                    <ExternalLink size={15} />
                  </span>
                  <span>{t(project.descriptionKey)}</span>
                </a>
              ))}
            </div>

            <p className="about-related-promise">
              {t('about.related.promise')}
            </p>
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
