import '~/styles/hi.css'

import type { LucideIcon } from 'lucide-react'
import {
  ArrowRight,
  Bot,
  Check,
  CircleCheck,
  FileCheck2,
  FileText,
  Folder,
  GitBranch,
  KeyRound,
  Link2,
  Network,
  NotebookPen,
  Search,
  Share2,
  Sparkles,
  Users,
} from 'lucide-react'
import { Link } from '@tanstack/react-router'

import { LogoIcon } from '~/components/icons/LogoIcon'
import { MarketingLayout } from '~/components/MarketingLayout'
import { useI18n, type MessageKey } from '~/lib/i18n'

interface HiItem {
  icon: LucideIcon
  titleKey: MessageKey
  bodyKey: MessageKey
}

const problems: HiItem[] = [
  {
    icon: Search,
    titleKey: 'hi.problem.scattered.title',
    bodyKey: 'hi.problem.scattered.body',
  },
  {
    icon: Bot,
    titleKey: 'hi.problem.restart.title',
    bodyKey: 'hi.problem.restart.body',
  },
  {
    icon: FileText,
    titleKey: 'hi.problem.archive.title',
    bodyKey: 'hi.problem.archive.body',
  },
]

const brainLayers: HiItem[] = [
  {
    icon: NotebookPen,
    titleKey: 'hi.brain.capture.title',
    bodyKey: 'hi.brain.capture.body',
  },
  {
    icon: Link2,
    titleKey: 'hi.brain.connect.title',
    bodyKey: 'hi.brain.connect.body',
  },
  {
    icon: GitBranch,
    titleKey: 'hi.brain.evolve.title',
    bodyKey: 'hi.brain.evolve.body',
  },
  {
    icon: FileCheck2,
    titleKey: 'hi.brain.source.title',
    bodyKey: 'hi.brain.source.body',
  },
]

const scenarios: HiItem[] = [
  {
    icon: NotebookPen,
    titleKey: 'hi.scenario.personal.title',
    bodyKey: 'hi.scenario.personal.body',
  },
  {
    icon: Bot,
    titleKey: 'hi.scenario.ai.title',
    bodyKey: 'hi.scenario.ai.body',
  },
  {
    icon: Users,
    titleKey: 'hi.scenario.project.title',
    bodyKey: 'hi.scenario.project.body',
  },
  {
    icon: GitBranch,
    titleKey: 'hi.scenario.decision.title',
    bodyKey: 'hi.scenario.decision.body',
  },
]

const availableKeys: MessageKey[] = [
  'hi.status.available.markdown',
  'hi.status.available.organize',
  'hi.status.available.git',
  'hi.status.available.attachment',
  'hi.status.available.p2p',
]

const futureKeys: MessageKey[] = [
  'hi.status.future.aiRead',
  'hi.status.future.aiWrite',
  'hi.status.future.share',
  'hi.status.future.network',
]

function KnowledgeWorkspace() {
  const { t } = useI18n()

  return (
    <div className="hi-workspace" aria-label={t('hi.visual.label')}>
      <div className="hi-workspace-topbar">
        <span className="hi-workspace-brand">
          <LogoIcon />
          MostBox
        </span>
        <span className="hi-workspace-status">
          <span />
          {t('hi.visual.local')}
        </span>
      </div>

      <div className="hi-workspace-body">
        <aside className="hi-workspace-sidebar">
          <div className="hi-workspace-search">
            <Search size={14} />
            <span>{t('hi.visual.search')}</span>
          </div>
          <p className="hi-workspace-group">{t('hi.visual.group')}</p>
          <div className="hi-workspace-tree-row is-open">
            <Folder size={15} />
            <span>{t('hi.visual.folder.project')}</span>
          </div>
          <div className="hi-workspace-tree-row is-child is-active">
            <FileText size={14} />
            <span>{t('hi.visual.note.context')}</span>
          </div>
          <div className="hi-workspace-tree-row is-child">
            <FileText size={14} />
            <span>{t('hi.visual.note.decision')}</span>
          </div>
          <div className="hi-workspace-tree-row">
            <Folder size={15} />
            <span>{t('hi.visual.folder.reading')}</span>
          </div>
        </aside>

        <article className="hi-workspace-document">
          <div className="hi-workspace-document-meta">
            <span>{t('hi.visual.readMode')}</span>
            <span>{t('hi.visual.updated')}</span>
          </div>
          <h2>{t('hi.visual.document.title')}</h2>
          <p>{t('hi.visual.document.intro')}</p>
          <h3>{t('hi.visual.document.section')}</h3>
          <p>{t('hi.visual.document.body')}</p>
          <div className="hi-workspace-links">
            <span>[[{t('hi.visual.link.people')}]]</span>
            <span>[[{t('hi.visual.link.system')}]]</span>
          </div>
          <div className="hi-workspace-file">
            <FileCheck2 size={18} />
            <span>
              <strong>{t('hi.visual.file.name')}</strong>
              <small translate="no">most://bafy...8k2</small>
            </span>
            <em>
              <CircleCheck size={14} />
              {t('hi.visual.file.verified')}
            </em>
          </div>
        </article>

        <aside className="hi-workspace-insight">
          <span className="hi-future-label">{t('hi.common.future')}</span>
          <Bot size={24} />
          <h3>{t('hi.visual.ai.title')}</h3>
          <p>{t('hi.visual.ai.body')}</p>
          <div className="hi-workspace-insight-source">
            <Sparkles size={14} />
            <span>{t('hi.visual.ai.source')}</span>
          </div>
        </aside>
      </div>
    </div>
  )
}

function PermissionFlow() {
  const { t } = useI18n()

  return (
    <div className="hi-permission-flow" aria-label={t('hi.ai.flowLabel')}>
      <div className="hi-permission-agent">
        <span className="hi-permission-icon">
          <Bot size={24} />
        </span>
        <div>
          <small>{t('hi.ai.flow.request')}</small>
          <strong>{t('hi.ai.flow.requestBody')}</strong>
        </div>
      </div>
      <ArrowRight className="hi-flow-arrow" size={22} />
      <div className="hi-permission-scope">
        <span className="hi-permission-icon">
          <KeyRound size={24} />
        </span>
        <div>
          <small>{t('hi.ai.flow.scope')}</small>
          <strong>{t('hi.ai.flow.scopeBody')}</strong>
        </div>
        <span className="hi-permission-allowed">
          <Check size={14} />
          {t('hi.ai.flow.allowed')}
        </span>
      </div>
      <ArrowRight className="hi-flow-arrow" size={22} />
      <div className="hi-permission-result">
        <span className="hi-permission-icon">
          <NotebookPen size={24} />
        </span>
        <div>
          <small>{t('hi.ai.flow.result')}</small>
          <strong>{t('hi.ai.flow.resultBody')}</strong>
        </div>
      </div>
    </div>
  )
}

function KnowledgeNetwork() {
  const { t } = useI18n()

  return (
    <div className="hi-network-visual" aria-label={t('hi.organization.visual')}>
      <div className="hi-network-person hi-network-person-a">
        <span>01</span>
        <strong>{t('hi.organization.person.a')}</strong>
        <small>{t('hi.organization.person.aNote')}</small>
      </div>
      <div className="hi-network-person hi-network-person-b">
        <span>02</span>
        <strong>{t('hi.organization.person.b')}</strong>
        <small>{t('hi.organization.person.bNote')}</small>
      </div>
      <div className="hi-network-person hi-network-person-c">
        <span>03</span>
        <strong>{t('hi.organization.person.c')}</strong>
        <small>{t('hi.organization.person.cNote')}</small>
      </div>
      <div className="hi-network-context">
        <Share2 size={23} />
        <strong>{t('hi.organization.shared')}</strong>
        <small>{t('hi.organization.sharedBody')}</small>
      </div>
      <span className="hi-network-line hi-network-line-a" />
      <span className="hi-network-line hi-network-line-b" />
      <span className="hi-network-line hi-network-line-c" />
    </div>
  )
}

export default function HiPage() {
  const { t } = useI18n()

  return (
    <MarketingLayout>
      <div className="hi-page">
        <section className="hi-hero">
          <div className="hi-container hi-hero-inner">
            <p className="hi-kicker">{t('hi.hero.kicker')}</p>
            <h1>MostBox</h1>
            <p className="hi-hero-title">{t('hi.hero.title')}</p>
            <p className="hi-hero-body">{t('hi.hero.body')}</p>
            <div className="hi-actions">
              <Link to="/note/" className="btn btn-primary">
                <NotebookPen size={17} />
                {t('hi.hero.primary')}
              </Link>
              <Link to="/download/" className="btn btn-secondary">
                {t('hi.hero.secondary')}
                <ArrowRight size={16} />
              </Link>
            </div>
            <KnowledgeWorkspace />
          </div>
        </section>

        <section className="hi-problem">
          <div className="hi-container">
            <header className="hi-heading hi-heading-narrow">
              <p className="hi-kicker">{t('hi.problem.kicker')}</p>
              <h2>{t('hi.problem.title')}</h2>
              <p>{t('hi.problem.body')}</p>
            </header>
            <div className="hi-problem-list">
              {problems.map((problem, index) => {
                const Icon = problem.icon
                return (
                  <article key={problem.titleKey}>
                    <span className="hi-problem-number">0{index + 1}</span>
                    <Icon size={23} />
                    <h3>{t(problem.titleKey)}</h3>
                    <p>{t(problem.bodyKey)}</p>
                  </article>
                )
              })}
            </div>
          </div>
        </section>

        <section className="hi-brain">
          <div className="hi-container hi-brain-layout">
            <header className="hi-heading hi-heading-light">
              <p className="hi-kicker">{t('hi.brain.kicker')}</p>
              <h2>{t('hi.brain.title')}</h2>
              <p>{t('hi.brain.body')}</p>
            </header>
            <div className="hi-brain-layers">
              {brainLayers.map((layer, index) => {
                const Icon = layer.icon
                return (
                  <article key={layer.titleKey}>
                    <span>0{index + 1}</span>
                    <Icon size={22} />
                    <div>
                      <h3>{t(layer.titleKey)}</h3>
                      <p>{t(layer.bodyKey)}</p>
                    </div>
                  </article>
                )
              })}
            </div>
          </div>
        </section>

        <section className="hi-ai">
          <div className="hi-container">
            <header className="hi-heading hi-heading-narrow">
              <span className="hi-future-label">{t('hi.common.future')}</span>
              <p className="hi-kicker">{t('hi.ai.kicker')}</p>
              <h2>{t('hi.ai.title')}</h2>
              <p>{t('hi.ai.body')}</p>
            </header>
            <PermissionFlow />
            <p className="hi-ai-note">
              <KeyRound size={17} />
              {t('hi.ai.note')}
            </p>
          </div>
        </section>

        <section className="hi-organization">
          <div className="hi-container hi-organization-layout">
            <header className="hi-heading">
              <span className="hi-future-label hi-future-label-light">
                {t('hi.common.future')}
              </span>
              <p className="hi-kicker">{t('hi.organization.kicker')}</p>
              <h2>{t('hi.organization.title')}</h2>
              <p>{t('hi.organization.body')}</p>
            </header>
            <KnowledgeNetwork />
          </div>
        </section>

        <section className="hi-foundation">
          <div className="hi-container hi-foundation-layout">
            <div className="hi-foundation-visual" aria-hidden="true">
              <div className="hi-foundation-note">
                <FileText size={21} />
                <span>{t('hi.foundation.note')}</span>
              </div>
              <span className="hi-foundation-arrow">+</span>
              <div className="hi-foundation-cid">
                <FileCheck2 size={25} />
                <span>CID</span>
                <small translate="no">most://bafy...</small>
              </div>
              <span className="hi-foundation-arrow">→</span>
              <div className="hi-foundation-nodes">
                <span>
                  <Network size={18} />
                </span>
                <span>
                  <Network size={18} />
                </span>
                <span>
                  <Network size={18} />
                </span>
              </div>
            </div>
            <header className="hi-heading hi-heading-light">
              <p className="hi-kicker">{t('hi.foundation.kicker')}</p>
              <h2>{t('hi.foundation.title')}</h2>
              <p>{t('hi.foundation.body')}</p>
              <div className="hi-foundation-points">
                <span>{t('hi.foundation.identity')}</span>
                <span>{t('hi.foundation.verify')}</span>
                <span>{t('hi.foundation.seed')}</span>
              </div>
            </header>
          </div>
        </section>

        <section className="hi-scenarios">
          <div className="hi-container">
            <header className="hi-heading hi-heading-narrow">
              <p className="hi-kicker">{t('hi.scenario.kicker')}</p>
              <h2>{t('hi.scenario.title')}</h2>
              <p>{t('hi.scenario.body')}</p>
            </header>
            <div className="hi-scenario-list">
              {scenarios.map((scenario, index) => {
                const Icon = scenario.icon
                return (
                  <article key={scenario.titleKey}>
                    <span className="hi-scenario-icon">
                      <Icon size={24} />
                    </span>
                    <span className="hi-scenario-number">0{index + 1}</span>
                    <h3>{t(scenario.titleKey)}</h3>
                    <p>{t(scenario.bodyKey)}</p>
                  </article>
                )
              })}
            </div>
          </div>
        </section>

        <section className="hi-status">
          <div className="hi-container">
            <header className="hi-heading hi-heading-narrow">
              <p className="hi-kicker">{t('hi.status.kicker')}</p>
              <h2>{t('hi.status.title')}</h2>
              <p>{t('hi.status.body')}</p>
            </header>
            <div className="hi-status-columns">
              <section className="hi-status-available">
                <span className="hi-status-label">
                  <CircleCheck size={17} />
                  {t('hi.status.available')}
                </span>
                <ul>
                  {availableKeys.map(key => (
                    <li key={key}>{t(key)}</li>
                  ))}
                </ul>
              </section>
              <section className="hi-status-future">
                <span className="hi-status-label">
                  <Sparkles size={17} />
                  {t('hi.status.future')}
                </span>
                <ul>
                  {futureKeys.map(key => (
                    <li key={key}>{t(key)}</li>
                  ))}
                </ul>
              </section>
            </div>
          </div>
        </section>

        <section className="hi-close">
          <div className="hi-container hi-close-inner">
            <LogoIcon />
            <p className="hi-kicker">{t('hi.close.kicker')}</p>
            <h2>{t('hi.close.title')}</h2>
            <p>{t('hi.close.body')}</p>
            <div className="hi-actions">
              <Link to="/note/" className="btn btn-primary">
                <NotebookPen size={17} />
                {t('hi.close.primary')}
              </Link>
              <Link to="/about/" className="btn btn-secondary">
                {t('hi.close.secondary')}
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </section>
      </div>
    </MarketingLayout>
  )
}
