import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import {
  CheckCircle2,
  Code2,
  Download,
  ExternalLink,
  FileCheck2,
  Fingerprint,
  FolderOpen,
  HardDrive,
  MessagesSquare,
  Network,
  NotebookPen,
  Share2,
  Users,
  Wallet,
} from 'lucide-react'

import { MarketingHeader } from '~/components/MarketingHeader'
import { MarketingLayout } from '~/components/MarketingLayout'
import { useI18n, type MessageKey } from '~/lib/i18n'

interface StoryItem {
  icon: ReactNode
  titleKey: MessageKey
  bodyKey: MessageKey
}

interface RelatedProject {
  name: string
  href: string
}

const flow: StoryItem[] = [
  {
    icon: <Share2 size={24} />,
    titleKey: 'about.flow.publish.title',
    bodyKey: 'about.flow.publish.body',
  },
  {
    icon: <FileCheck2 size={24} />,
    titleKey: 'about.flow.verify.title',
    bodyKey: 'about.flow.verify.body',
  },
  {
    icon: <Users size={24} />,
    titleKey: 'about.flow.seed.title',
    bodyKey: 'about.flow.seed.body',
  },
]

const differences: StoryItem[] = [
  {
    icon: <Fingerprint size={22} />,
    titleKey: 'about.difference.cid.title',
    bodyKey: 'about.difference.cid.body',
  },
  {
    icon: <HardDrive size={22} />,
    titleKey: 'about.difference.copy.title',
    bodyKey: 'about.difference.copy.body',
  },
  {
    icon: <Network size={22} />,
    titleKey: 'about.difference.people.title',
    bodyKey: 'about.difference.people.body',
  },
]

const tools: StoryItem[] = [
  {
    icon: <MessagesSquare size={22} />,
    titleKey: 'about.toolbox.chat.title',
    bodyKey: 'about.toolbox.chat.body',
  },
  {
    icon: <NotebookPen size={22} />,
    titleKey: 'about.toolbox.note.title',
    bodyKey: 'about.toolbox.note.body',
  },
  {
    icon: <Wallet size={22} />,
    titleKey: 'about.toolbox.web3.title',
    bodyKey: 'about.toolbox.web3.body',
  },
]

const relatedProjects: RelatedProject[] = [
  { name: 'Jami', href: 'https://jami.net/' },
  { name: 'Keet', href: 'https://keet.io/' },
  { name: 'Briar', href: 'https://briarproject.org/' },
  { name: 'RetroShare', href: 'https://retroshare.cc/' },
]

export default function AboutPage() {
  const { t } = useI18n()

  return (
    <MarketingLayout header={<MarketingHeader />}>
      <div className="about-page">
        <section className="about-hero">
          <div className="about-hero-media" aria-hidden="true">
            <img src="/about-artemis.webp" alt="" />
          </div>
          <div className="mkt-container about-hero-content">
            <p className="about-kicker">{t('about.hero.kicker')}</p>
            <h1 className="about-title">{t('about.hero.title')}</h1>
            <p className="about-lede">{t('about.hero.desc')}</p>
            <div className="about-actions">
              <Link to="/download/" className="btn btn-primary">
                <Download size={16} />
                {t('about.cta.download')}
              </Link>
              <Link to="/file/" className="btn btn-secondary">
                <FolderOpen size={16} />
                {t('about.cta.files')}
              </Link>
            </div>
            <code className="about-link-example" translate="no">
              most://&lt;cid&gt;?filename=...
            </code>
          </div>
        </section>

        <section className="about-flow-band">
          <div className="mkt-container">
            <header className="about-section-heading">
              <p className="about-kicker">{t('about.flow.kicker')}</p>
              <h2>{t('about.flow.title')}</h2>
              <p>{t('about.flow.intro')}</p>
            </header>
            <ol className="about-flow">
              {flow.map((item, index) => (
                <li key={item.titleKey} className="about-flow-step">
                  <div className="about-flow-marker">
                    <span>{item.icon}</span>
                    <strong>{index + 1}</strong>
                  </div>
                  <h3>{t(item.titleKey)}</h3>
                  <p>{t(item.bodyKey)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="about-difference-band">
          <div className="mkt-container about-difference-layout">
            <header className="about-section-heading about-difference-heading">
              <p className="about-kicker">{t('about.difference.kicker')}</p>
              <h2>{t('about.difference.title')}</h2>
              <p>{t('about.difference.intro')}</p>
              <div className="about-boundary">
                <CheckCircle2 size={20} />
                <span>{t('about.difference.boundary')}</span>
              </div>
            </header>
            <div className="about-difference-list">
              {differences.map(item => (
                <article key={item.titleKey} className="about-difference-item">
                  <span className="about-topic-icon">{item.icon}</span>
                  <div>
                    <h3>{t(item.titleKey)}</h3>
                    <p>{t(item.bodyKey)}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="about-toolbox-band">
          <div className="mkt-container">
            <header className="about-section-heading">
              <p className="about-kicker">{t('about.toolbox.kicker')}</p>
              <h2>{t('about.toolbox.title')}</h2>
              <p>{t('about.toolbox.intro')}</p>
            </header>
            <div className="about-toolbox-list">
              {tools.map(item => (
                <article key={item.titleKey} className="about-toolbox-item">
                  <span className="about-topic-icon">{item.icon}</span>
                  <h3>{t(item.titleKey)}</h3>
                  <p>{t(item.bodyKey)}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="about-open-source-band">
          <div className="mkt-container about-open-source-layout">
            <div className="about-open-source-mark" aria-hidden="true">
              <Code2 size={32} />
            </div>
            <div className="about-open-source-copy">
              <p className="about-kicker">{t('about.opensource.kicker')}</p>
              <h2>{t('about.opensource.title')}</h2>
              <p>{t('about.opensource.body')}</p>
            </div>
            <a
              className="btn btn-secondary"
              href="https://github.com/most-people/most"
              target="_blank"
              rel="noreferrer"
            >
              <Code2 size={16} />
              {t('about.opensource.cta')}
            </a>
          </div>
        </section>

        <section className="about-related-band">
          <div className="mkt-container about-related-layout">
            <div>
              <p className="about-kicker">{t('about.related.kicker')}</p>
              <h2>{t('about.related.title')}</h2>
            </div>
            <nav
              className="about-related-links"
              aria-label={t('about.related.title')}
            >
              {relatedProjects.map(project => (
                <a
                  key={project.name}
                  href={project.href}
                  target="_blank"
                  rel="noreferrer"
                >
                  {project.name}
                  <ExternalLink size={14} />
                </a>
              ))}
            </nav>
          </div>
        </section>
      </div>
    </MarketingLayout>
  )
}
