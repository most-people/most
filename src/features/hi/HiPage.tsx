import '~/styles/hi.css'

import { Link } from '@tanstack/react-router'
import {
  Files,
  FileText,
  MessagesSquare,
  Network,
  Paperclip,
  Send,
  ShieldCheck,
} from 'lucide-react'

import { MarketingLayout } from '~/components/MarketingLayout'
import { useI18n } from '~/lib/i18n'

export default function HiPage() {
  const { t } = useI18n()

  return (
    <MarketingLayout>
      <div className="hi-page">
        <section className="hi-hero">
          <div className="hi-container hi-hero-inner">
            <p className="hi-kicker">{t('hi.hero.kicker')}</p>
            <h1>{t('hi.hero.title')}</h1>
            <p className="hi-hero-body">{t('hi.hero.body')}</p>
            <div className="hi-actions">
              <Link to="/chat/" className="btn btn-primary">
                <MessagesSquare size={18} />
                {t('hi.hero.primary')}
              </Link>
              <Link to="/download/" className="btn btn-secondary">
                {t('hi.hero.secondary')}
              </Link>
            </div>
            <div className="hi-preview" aria-label={t('hi.preview.channel')}>
              <div className="hi-preview-bar">
                <MessagesSquare size={20} />
                <div>
                  <strong>{t('hi.preview.channel')}</strong>
                  <span>{t('hi.preview.status')}</span>
                </div>
                <Network size={18} />
              </div>
              <div className="hi-preview-body">
                <div className="hi-preview-message hi-preview-message-incoming">
                  {t('hi.preview.message')}
                </div>
                <div className="hi-preview-attachment">
                  <FileText size={22} />
                  <div>
                    <strong>{t('hi.preview.file')}</strong>
                    <span>{t('hi.preview.fileMeta')}</span>
                  </div>
                  <small>most://</small>
                </div>
                <div className="hi-preview-message hi-preview-message-outgoing">
                  {t('hi.preview.send')}
                </div>
              </div>
              <div className="hi-preview-composer">
                <Paperclip size={17} />
                <span>{t('hi.preview.send')}</span>
                <Send size={17} />
              </div>
            </div>
          </div>
        </section>

        <section className="hi-principles">
          <div className="hi-container">
            <header className="hi-heading">
              <p className="hi-kicker">{t('hi.principles.kicker')}</p>
              <h2>{t('hi.principles.title')}</h2>
              <p>{t('hi.principles.body')}</p>
            </header>
            <div className="hi-principle-grid">
              <article className="hi-principle-card">
                <MessagesSquare size={24} />
                <h3>{t('hi.principles.chat.title')}</h3>
                <p>{t('hi.principles.chat.body')}</p>
              </article>
              <article className="hi-principle-card">
                <Files size={24} />
                <h3>{t('hi.principles.files.title')}</h3>
                <p>{t('hi.principles.files.body')}</p>
              </article>
              <article className="hi-principle-card">
                <Network size={24} />
                <h3>{t('hi.principles.network.title')}</h3>
                <p>{t('hi.principles.network.body')}</p>
              </article>
            </div>
          </div>
        </section>

        <section className="hi-steps">
          <div className="hi-container hi-steps-grid">
            <div>
              <p className="hi-kicker">{t('hi.steps.kicker')}</p>
              <h2>{t('hi.steps.title')}</h2>
              <p>{t('hi.steps.body')}</p>
            </div>
            <ol>
              <li>
                <span>01</span>
                <div>
                  <h3>{t('hi.steps.one.title')}</h3>
                  <p>{t('hi.steps.one.body')}</p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <h3>{t('hi.steps.two.title')}</h3>
                  <p>{t('hi.steps.two.body')}</p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <h3>{t('hi.steps.three.title')}</h3>
                  <p>{t('hi.steps.three.body')}</p>
                </div>
              </li>
            </ol>
          </div>
        </section>

        <section className="hi-trust">
          <div className="hi-container hi-trust-inner">
            <ShieldCheck size={24} />
            <p>{t('hi.trust.body')}</p>
          </div>
        </section>
      </div>
    </MarketingLayout>
  )
}
