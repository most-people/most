import '~/styles/about.css'

import type { LucideIcon } from 'lucide-react'
import {
  ArrowRight,
  CheckCircle2,
  CloudOff,
  Code2,
  Download,
  FileCheck2,
  FileUp,
  FolderOpen,
  KeyRound,
  Link2,
  Network,
  PauseCircle,
  Radio,
  ShieldCheck,
} from 'lucide-react'
import { Link } from '@tanstack/react-router'

import { MarketingHeader } from '~/components/MarketingHeader'
import { MarketingLayout } from '~/components/MarketingLayout'
import { useIsDesktopClient } from '~/hooks'
import { useI18n, type MessageKey } from '~/lib/i18n'

interface ContentItem {
  icon: LucideIcon
  titleKey: MessageKey
  bodyKey: MessageKey
}

const shareSteps: ContentItem[] = [
  {
    icon: FileUp,
    titleKey: 'about.flow.publish.title',
    bodyKey: 'about.flow.publish.body',
  },
  {
    icon: FileCheck2,
    titleKey: 'about.flow.verify.title',
    bodyKey: 'about.flow.verify.body',
  },
  {
    icon: Network,
    titleKey: 'about.flow.relay.title',
    bodyKey: 'about.flow.relay.body',
  },
]

const heroSignals = [
  ['about.hero.signal.noCloud', CloudOff],
  ['about.hero.signal.verify', ShieldCheck],
  ['about.hero.signal.relay', Radio],
] as const satisfies ReadonlyArray<readonly [MessageKey, LucideIcon]>

const boundaries: ContentItem[] = [
  {
    icon: CloudOff,
    titleKey: 'about.boundaries.cloud.title',
    bodyKey: 'about.boundaries.cloud.body',
  },
  {
    icon: Radio,
    titleKey: 'about.boundaries.online.title',
    bodyKey: 'about.boundaries.online.body',
  },
  {
    icon: KeyRound,
    titleKey: 'about.boundaries.link.title',
    bodyKey: 'about.boundaries.link.body',
  },
  {
    icon: PauseCircle,
    titleKey: 'about.boundaries.stop.title',
    bodyKey: 'about.boundaries.stop.body',
  },
]

export default function AboutPage() {
  const { t } = useI18n()
  const isDesktopClient = useIsDesktopClient()

  return (
    <MarketingLayout header={<MarketingHeader />}>
      <div className="about-page">
        <section className="about-hero">
          <div className="about-container about-hero-inner">
            <div className="about-hero-copy">
              <p className="about-kicker about-kicker-light">
                <Network size={16} />
                {t('about.hero.kicker')}
              </p>
              <h1>{t('about.hero.title')}</h1>
              <p className="about-hero-lede">{t('about.hero.desc')}</p>
              <div className="about-hero-actions">
                {!isDesktopClient && (
                  <Link to="/download/" className="btn btn-primary">
                    <Download size={16} />
                    {t('about.cta.download')}
                  </Link>
                )}
                <Link to="/file/" className="btn btn-secondary">
                  <FolderOpen size={16} />
                  {t('about.cta.files')}
                </Link>
              </div>
              <div className="about-hero-signals">
                {heroSignals.map(([messageKey, Icon]) => (
                  <span key={messageKey}>
                    <Icon size={16} />
                    {t(messageKey)}
                  </span>
                ))}
              </div>
            </div>

            <div className="about-flow-heading">
              <p>{t('about.flow.kicker')}</p>
              <h2>{t('about.flow.title')}</h2>
              <span>{t('about.flow.intro')}</span>
            </div>
            <ol className="about-share-flow">
              {shareSteps.map((step, index) => {
                const Icon = step.icon
                return (
                  <li key={step.titleKey}>
                    <div className="about-step-number">0{index + 1}</div>
                    <Icon size={25} />
                    <h3>{t(step.titleKey)}</h3>
                    <p>{t(step.bodyKey)}</p>
                    {index < shareSteps.length - 1 && (
                      <ArrowRight
                        className="about-step-arrow"
                        size={20}
                        aria-hidden="true"
                      />
                    )}
                  </li>
                )
              })}
            </ol>
          </div>
        </section>

        <section className="about-section about-cid">
          <div className="about-container about-cid-inner">
            <div className="about-section-copy">
              <p className="about-kicker">{t('about.cid.kicker')}</p>
              <h2>{t('about.cid.title')}</h2>
              <p>{t('about.cid.body')}</p>
              <p className="about-cid-note">{t('about.cid.filename')}</p>
            </div>

            <div
              className="about-cid-proof"
              aria-label={t('about.cid.visualLabel')}
            >
              <div className="about-cid-file">
                <FileUp size={24} />
                <div>
                  <span>{t('about.cid.fileLabel')}</span>
                  <strong>{t('about.cid.fileValue')}</strong>
                </div>
              </div>
              <ArrowRight size={20} aria-hidden="true" />
              <div className="about-cid-link">
                <Link2 size={22} />
                <div>
                  <span>{t('about.cid.linkLabel')}</span>
                  <code>most://bafy...</code>
                </div>
              </div>
              <div className="about-cid-result">
                <CheckCircle2 size={20} />
                <strong>{t('about.cid.match')}</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="about-section about-boundaries">
          <div className="about-container">
            <header className="about-section-heading">
              <p className="about-kicker">{t('about.boundaries.kicker')}</p>
              <h2>{t('about.boundaries.title')}</h2>
              <p>{t('about.boundaries.intro')}</p>
            </header>
            <div className="about-boundary-grid">
              {boundaries.map(item => {
                const Icon = item.icon
                return (
                  <article key={item.titleKey}>
                    <Icon size={23} />
                    <div>
                      <h3>{t(item.titleKey)}</h3>
                      <p>{t(item.bodyKey)}</p>
                    </div>
                  </article>
                )
              })}
            </div>
          </div>
        </section>

        <section className="about-close">
          <div className="about-container about-close-inner">
            <div>
              <p className="about-kicker about-kicker-light">
                {t('about.close.kicker')}
              </p>
              <h2>{t('about.close.title')}</h2>
              <p>{t('about.close.body')}</p>
            </div>
            <div className="about-close-actions">
              {!isDesktopClient && (
                <Link to="/download/" className="btn btn-primary">
                  <Download size={16} />
                  {t('about.cta.download')}
                </Link>
              )}
              <Link to="/file/" className="btn btn-secondary">
                <FolderOpen size={16} />
                {t('about.cta.files')}
              </Link>
            </div>
          </div>
        </section>

        <section className="about-next">
          <div className="about-container about-next-inner">
            <div>
              <p className="about-kicker">{t('about.next.kicker')}</p>
              <h2>{t('about.next.title')}</h2>
              <p>{t('about.next.body')}</p>
            </div>
            <div className="about-next-links">
              <Link to="/future/" className="btn btn-secondary">
                {t('about.next.future')}
                <ArrowRight size={16} />
              </Link>
              <a
                href="https://github.com/most-people/most"
                className="about-source-link"
                target="_blank"
                rel="noreferrer"
              >
                <Code2 size={16} />
                {t('about.next.source')}
              </a>
            </div>
          </div>
        </section>
      </div>
    </MarketingLayout>
  )
}
