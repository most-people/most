import '~/styles/future.css'

import type { LucideIcon } from 'lucide-react'
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Code2,
  FileCheck2,
  Files,
  History,
  KeyRound,
  Link2,
  Network,
  NotebookPen,
  Search,
  Server,
  Share2,
  ShieldCheck,
  Sparkles,
  Waypoints,
} from 'lucide-react'
import { Link } from '@tanstack/react-router'

import { MarketingHeader } from '~/components/MarketingHeader'
import { MarketingLayout } from '~/components/MarketingLayout'
import { useI18n, type MessageKey } from '~/lib/i18n'

interface FutureItem {
  icon: LucideIcon
  titleKey: MessageKey
  bodyKey: MessageKey
}

interface FutureDirection extends FutureItem {
  eyebrowKey: MessageKey
  signals: ReadonlyArray<readonly [MessageKey, LucideIcon]>
}

const foundations: FutureItem[] = [
  {
    icon: FileCheck2,
    titleKey: 'future.foundation.cid.title',
    bodyKey: 'future.foundation.cid.body',
  },
  {
    icon: Link2,
    titleKey: 'future.foundation.link.title',
    bodyKey: 'future.foundation.link.body',
  },
  {
    icon: ShieldCheck,
    titleKey: 'future.foundation.verify.title',
    bodyKey: 'future.foundation.verify.body',
  },
  {
    icon: Network,
    titleKey: 'future.foundation.seed.title',
    bodyKey: 'future.foundation.seed.body',
  },
]

const directions: FutureDirection[] = [
  {
    icon: NotebookPen,
    eyebrowKey: 'future.direction.context.eyebrow',
    titleKey: 'future.direction.context.title',
    bodyKey: 'future.direction.context.body',
    signals: [
      ['future.direction.context.files', Files],
      ['future.direction.context.notes', NotebookPen],
      ['future.direction.context.history', History],
    ],
  },
  {
    icon: Bot,
    eyebrowKey: 'future.direction.action.eyebrow',
    titleKey: 'future.direction.action.title',
    bodyKey: 'future.direction.action.body',
    signals: [
      ['future.direction.action.request', Search],
      ['future.direction.action.approval', KeyRound],
      ['future.direction.action.result', CheckCircle2],
    ],
  },
  {
    icon: Waypoints,
    eyebrowKey: 'future.direction.network.eyebrow',
    titleKey: 'future.direction.network.title',
    bodyKey: 'future.direction.network.body',
    signals: [
      ['future.direction.network.personal', Server],
      ['future.direction.network.authorized', Share2],
      ['future.direction.network.collaboration', Network],
    ],
  },
]

const principles: FutureItem[] = [
  {
    icon: Server,
    titleKey: 'future.principles.control.title',
    bodyKey: 'future.principles.control.body',
  },
  {
    icon: FileCheck2,
    titleKey: 'future.principles.cid.title',
    bodyKey: 'future.principles.cid.body',
  },
  {
    icon: KeyRound,
    titleKey: 'future.principles.permission.title',
    bodyKey: 'future.principles.permission.body',
  },
  {
    icon: Network,
    titleKey: 'future.principles.network.title',
    bodyKey: 'future.principles.network.body',
  },
]

export default function FuturePage() {
  const { t } = useI18n()

  return (
    <MarketingLayout header={<MarketingHeader />}>
      <div className="future-page">
        <section className="future-hero">
          <div className="future-hero-media" aria-hidden="true">
            <img
              src="/about-artemis.webp"
              alt=""
              decoding="async"
              fetchPriority="high"
            />
          </div>
          <div className="future-hero-shade" aria-hidden="true" />
          <div className="future-container future-hero-inner">
            <div className="future-hero-copy">
              <p className="future-kicker future-kicker-light">
                <Sparkles size={16} />
                {t('future.hero.kicker')}
              </p>
              <h1>{t('future.hero.title')}</h1>
              <p className="future-hero-lede">{t('future.hero.body')}</p>
              <div className="future-disclaimer">
                <ShieldCheck size={18} />
                <span>{t('future.hero.disclaimer')}</span>
              </div>
              <Link to="/about/" className="btn btn-secondary">
                {t('future.hero.about')}
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </section>

        <section className="future-section future-foundation">
          <div className="future-container">
            <header className="future-section-heading">
              <p className="future-kicker">{t('future.foundation.kicker')}</p>
              <h2>{t('future.foundation.title')}</h2>
              <p>{t('future.foundation.intro')}</p>
            </header>
            <div className="future-foundation-grid">
              {foundations.map(item => {
                const Icon = item.icon
                return (
                  <article key={item.titleKey}>
                    <Icon size={23} />
                    <h3>{t(item.titleKey)}</h3>
                    <p>{t(item.bodyKey)}</p>
                  </article>
                )
              })}
            </div>
          </div>
        </section>

        <section className="future-directions">
          <div className="future-container">
            <header className="future-section-heading">
              <p className="future-kicker">{t('future.direction.kicker')}</p>
              <h2>{t('future.direction.title')}</h2>
              <p>{t('future.direction.intro')}</p>
            </header>
            <div className="future-direction-list">
              {directions.map((direction, index) => {
                const Icon = direction.icon
                return (
                  <article key={direction.titleKey}>
                    <div className="future-direction-copy">
                      <div className="future-direction-label">
                        <span>0{index + 1}</span>
                        <Icon size={22} />
                        <strong>{t(direction.eyebrowKey)}</strong>
                      </div>
                      <h3>{t(direction.titleKey)}</h3>
                      <p>{t(direction.bodyKey)}</p>
                    </div>
                    <div className="future-direction-signal">
                      {direction.signals.map(
                        ([messageKey, SignalIcon], signalIndex) => (
                          <div key={messageKey}>
                            <span>
                              <SignalIcon size={19} />
                              {t(messageKey)}
                            </span>
                            {signalIndex < direction.signals.length - 1 && (
                              <ArrowRight size={17} aria-hidden="true" />
                            )}
                          </div>
                        )
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          </div>
        </section>

        <section className="future-developer">
          <div className="future-container future-developer-inner">
            <Code2 size={26} />
            <div>
              <p className="future-kicker">{t('future.developer.kicker')}</p>
              <h2>{t('future.developer.title')}</h2>
              <p>{t('future.developer.body')}</p>
            </div>
            <Link to="/docs/mcp/" className="btn btn-secondary">
              {t('future.developer.cta')}
              <ArrowRight size={16} />
            </Link>
          </div>
        </section>

        <section className="future-section future-principles">
          <div className="future-container">
            <header className="future-section-heading future-section-heading-light">
              <p className="future-kicker future-kicker-light">
                {t('future.principles.kicker')}
              </p>
              <h2>{t('future.principles.title')}</h2>
              <p>{t('future.principles.intro')}</p>
            </header>
            <div className="future-principle-grid">
              {principles.map(item => {
                const Icon = item.icon
                return (
                  <article key={item.titleKey}>
                    <Icon size={22} />
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

        <section className="future-close">
          <div className="future-container future-close-inner">
            <div>
              <p className="future-kicker">{t('future.close.kicker')}</p>
              <h2>{t('future.close.title')}</h2>
              <p>{t('future.close.body')}</p>
            </div>
            <div className="future-actions">
              <Link to="/about/" className="btn btn-secondary">
                {t('future.close.about')}
              </Link>
            </div>
          </div>
        </section>
      </div>
    </MarketingLayout>
  )
}
