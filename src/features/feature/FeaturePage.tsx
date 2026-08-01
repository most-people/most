import '~/styles/feature.css'

import type { LucideIcon } from 'lucide-react'
import {
  ArrowDown,
  ArrowRight,
  Bot,
  BrainCircuit,
  Check,
  CircleUserRound,
  Cloud,
  Code2,
  Database,
  Download,
  ExternalLink,
  FileClock,
  Files,
  FolderOpen,
  GitBranch,
  History,
  KeyRound,
  Link2,
  Network,
  NotebookPen,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  Waypoints,
} from 'lucide-react'
import { Link } from '@tanstack/react-router'

import { MarketingHeader } from '~/components/MarketingHeader'
import { MarketingLayout } from '~/components/MarketingLayout'
import { useI18n, type MessageKey } from '~/lib/i18n'

interface MessageItem {
  icon: LucideIcon
  titleKey: MessageKey
  bodyKey: MessageKey
}

interface EvolutionStage extends MessageItem {
  generationKey: MessageKey
  examplesKey: MessageKey
}

interface RelatedProject {
  name: string
  href: string
}

const currentFlow = [
  ['feature.why.current.files', Files],
  ['feature.why.current.cloud', Cloud],
  ['feature.why.current.search', Search],
] as const satisfies ReadonlyArray<readonly [MessageKey, LucideIcon]>

const futureFlow = [
  ['feature.why.future.person', CircleUserRound],
  ['feature.why.future.agent', Bot],
  ['feature.why.future.space', BrainCircuit],
  ['feature.why.future.network', Network],
] as const satisfies ReadonlyArray<readonly [MessageKey, LucideIcon]>

const problems = [
  'feature.why.problem.relationships',
  'feature.why.problem.decisions',
  'feature.why.problem.context',
  'feature.why.problem.restart',
] as const satisfies readonly MessageKey[]

const evolution: EvolutionStage[] = [
  {
    icon: Cloud,
    generationKey: 'feature.evolution.storage.generation',
    titleKey: 'feature.evolution.storage.title',
    examplesKey: 'feature.evolution.storage.examples',
    bodyKey: 'feature.evolution.storage.body',
  },
  {
    icon: Database,
    generationKey: 'feature.evolution.base.generation',
    titleKey: 'feature.evolution.base.title',
    examplesKey: 'feature.evolution.base.examples',
    bodyKey: 'feature.evolution.base.body',
  },
  {
    icon: BrainCircuit,
    generationKey: 'feature.evolution.os.generation',
    titleKey: 'feature.evolution.os.title',
    examplesKey: 'feature.evolution.os.examples',
    bodyKey: 'feature.evolution.os.body',
  },
]

const principles: MessageItem[] = [
  {
    icon: Server,
    titleKey: 'feature.principles.local.title',
    bodyKey: 'feature.principles.local.body',
  },
  {
    icon: Bot,
    titleKey: 'feature.principles.agent.title',
    bodyKey: 'feature.principles.agent.body',
  },
  {
    icon: Network,
    titleKey: 'feature.principles.p2p.title',
    bodyKey: 'feature.principles.p2p.body',
  },
]

const agentCapabilities = [
  ['feature.principles.agent.context', BrainCircuit],
  ['feature.principles.agent.memory', FileClock],
  ['feature.principles.agent.relationships', Waypoints],
  ['feature.principles.agent.permissions', ShieldCheck],
  ['feature.principles.agent.history', History],
] as const satisfies ReadonlyArray<readonly [MessageKey, LucideIcon]>

const designDna: MessageItem[] = [
  {
    icon: NotebookPen,
    titleKey: 'feature.dna.obsidian.title',
    bodyKey: 'feature.dna.obsidian.body',
  },
  {
    icon: GitBranch,
    titleKey: 'feature.dna.git.title',
    bodyKey: 'feature.dna.git.body',
  },
  {
    icon: Link2,
    titleKey: 'feature.dna.mcp.title',
    bodyKey: 'feature.dna.mcp.body',
  },
  {
    icon: Network,
    titleKey: 'feature.dna.p2p.title',
    bodyKey: 'feature.dna.p2p.body',
  },
]

const nodeFoundations = [
  ['feature.architecture.knowledge', NotebookPen],
  ['feature.architecture.history', GitBranch],
  ['feature.architecture.files', Files],
  ['feature.architecture.identity', KeyRound],
] as const satisfies ReadonlyArray<readonly [MessageKey, LucideIcon]>

const futureLayers = [
  'feature.architecture.future.context',
  'feature.architecture.future.memory',
  'feature.architecture.future.graph',
] as const satisfies readonly MessageKey[]

const relatedProjects: RelatedProject[] = [
  { name: 'Jami', href: 'https://jami.net/' },
  { name: 'Keet', href: 'https://keet.io/' },
  { name: 'Briar', href: 'https://briarproject.org/' },
  { name: 'RetroShare', href: 'https://retroshare.cc/' },
]

export default function FeaturePage() {
  const { t } = useI18n()

  return (
    <MarketingLayout header={<MarketingHeader />}>
      <div className="feature-page">
        <section className="feature-hero">
          <div className="feature-hero-media" aria-hidden="true">
            <img
              src="/about-artemis.webp"
              alt=""
              decoding="async"
              fetchPriority="high"
            />
          </div>
          <div className="feature-hero-shade" aria-hidden="true" />
          <div className="feature-container feature-hero-inner">
            <div className="feature-hero-copy">
              <p className="feature-kicker feature-kicker-light">
                <Sparkles size={15} />
                {t('feature.hero.kicker')}
              </p>
              <h1>{t('feature.hero.title')}</h1>
              <p className="feature-hero-lede">{t('feature.hero.desc')}</p>
              <div className="feature-hero-signals">
                <span>
                  <Server size={16} />
                  {t('feature.hero.local')}
                </span>
                <span>
                  <Bot size={16} />
                  {t('feature.hero.agent')}
                </span>
                <span>
                  <Network size={16} />
                  {t('feature.hero.network')}
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="feature-section feature-why">
          <div className="feature-container">
            <SectionHeading
              kicker={t('feature.why.kicker')}
              title={t('feature.why.title')}
              intro={t('feature.why.intro')}
            />
            <div className="feature-flow-comparison">
              <FlowLane
                label={t('feature.why.current.label')}
                items={currentFlow}
              />
              <FlowLane
                label={t('feature.why.future.label')}
                items={futureFlow}
                featured
              />
            </div>
            <div className="feature-problem-block">
              <h3>{t('feature.why.problem.title')}</h3>
              <ul>
                {problems.map(problem => (
                  <li key={problem}>
                    <Check size={16} />
                    {t(problem)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="feature-section feature-evolution">
          <div className="feature-container">
            <SectionHeading
              kicker={t('feature.evolution.kicker')}
              title={t('feature.evolution.title')}
              intro={t('feature.evolution.intro')}
              light
            />
            <ol className="feature-evolution-list">
              {evolution.map((stage, index) => {
                const Icon = stage.icon
                return (
                  <li key={stage.titleKey}>
                    <div className="feature-evolution-index">
                      <span>0{index + 1}</span>
                      <Icon size={22} />
                    </div>
                    <p className="feature-stage-label">
                      {t(stage.generationKey)}
                    </p>
                    <h3>{t(stage.titleKey)}</h3>
                    <strong>{t(stage.examplesKey)}</strong>
                    <p>{t(stage.bodyKey)}</p>
                  </li>
                )
              })}
            </ol>
          </div>
        </section>

        <section className="feature-section feature-principles">
          <div className="feature-container">
            <SectionHeading
              kicker={t('feature.principles.kicker')}
              title={t('feature.principles.title')}
              intro={t('feature.principles.intro')}
            />
            <div className="feature-principle-list">
              {principles.map((principle, index) => {
                const Icon = principle.icon
                return (
                  <article key={principle.titleKey}>
                    <div className="feature-principle-header">
                      <span className="feature-number">0{index + 1}</span>
                      <Icon size={26} />
                    </div>
                    <h3>{t(principle.titleKey)}</h3>
                    <p>{t(principle.bodyKey)}</p>
                    {index === 0 && <LocalFirstPath />}
                    {index === 1 && <AgentCapabilityList />}
                    {index === 2 && <P2pNetworkDiagram />}
                  </article>
                )
              })}
            </div>
          </div>
        </section>

        <section className="feature-section feature-dna">
          <div className="feature-container">
            <SectionHeading
              kicker={t('feature.dna.kicker')}
              title={t('feature.dna.title')}
              intro={t('feature.dna.intro')}
            />
            <div className="feature-dna-equation">
              {designDna.map((item, index) => {
                const Icon = item.icon
                return (
                  <div key={item.titleKey} className="feature-dna-part">
                    {index > 0 && (
                      <span
                        className="feature-equation-symbol"
                        aria-hidden="true"
                      >
                        +
                      </span>
                    )}
                    <div>
                      <Icon size={22} />
                      <h3>{t(item.titleKey)}</h3>
                      <p>{t(item.bodyKey)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="feature-dna-result">
              <ArrowDown size={20} aria-hidden="true" />
              <strong>MostBox</strong>
              <span>{t('feature.dna.result')}</span>
            </div>
          </div>
        </section>

        <section className="feature-section feature-architecture">
          <div className="feature-container">
            <SectionHeading
              kicker={t('feature.architecture.kicker')}
              title={t('feature.architecture.title')}
              intro={t('feature.architecture.intro')}
            />
            <div
              className="feature-architecture-diagram"
              aria-label={t('feature.architecture.label')}
            >
              <DiagramNode
                icon={Bot}
                title={t('feature.architecture.agents')}
                className="feature-architecture-agents"
              />
              <DiagramConnector />
              <DiagramNode
                icon={Link2}
                title={t('feature.architecture.mcp')}
                className="feature-architecture-mcp"
              />
              <DiagramConnector />
              <div className="feature-personal-node">
                <div className="feature-personal-node-heading">
                  <Server size={24} />
                  <div>
                    <span>{t('feature.architecture.current')}</span>
                    <h3>{t('feature.architecture.node')}</h3>
                  </div>
                </div>
                <div className="feature-node-foundations">
                  {nodeFoundations.map(([messageKey, Icon]) => (
                    <span key={messageKey}>
                      <Icon size={18} />
                      {t(messageKey)}
                    </span>
                  ))}
                </div>
              </div>
              <DiagramConnector />
              <DiagramNode
                icon={Network}
                title={t('feature.architecture.p2p')}
                className="feature-architecture-p2p"
              />
              <DiagramConnector />
              <div className="feature-other-nodes">
                <Server size={22} />
                <Server size={22} />
                <Server size={22} />
                <strong>{t('feature.architecture.others')}</strong>
              </div>
            </div>
            <div className="feature-future-layer">
              <div>
                <Sparkles size={18} />
                <strong>{t('feature.architecture.future.title')}</strong>
              </div>
              <ul>
                {futureLayers.map(messageKey => (
                  <li key={messageKey}>{t(messageKey)}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="feature-vision">
          <div className="feature-container">
            <p className="feature-kicker feature-kicker-light">
              <Sparkles size={15} />
              {t('feature.vision.kicker')}
            </p>
            <h2>{t('feature.vision.title')}</h2>
            <p className="feature-vision-copy">{t('feature.vision.body')}</p>
            <div className="feature-vision-equation" aria-hidden="true">
              <span>{t('feature.vision.personalAi')}</span>
              <strong>+</strong>
              <span>{t('feature.vision.personalNode')}</span>
              <strong>+</strong>
              <span>{t('feature.vision.globalNetwork')}</span>
            </div>
            <blockquote>{t('feature.vision.final')}</blockquote>
            <div className="feature-actions">
              <Link to="/download/" className="btn btn-primary">
                <Download size={16} />
                {t('about.cta.download')}
              </Link>
              <Link to="/file/" className="btn btn-secondary">
                <FolderOpen size={16} />
                {t('about.cta.files')}
              </Link>
            </div>
          </div>
        </section>

        <section className="feature-open-source">
          <div className="feature-container feature-open-source-inner">
            <Code2 size={28} />
            <div>
              <p className="feature-kicker">{t('about.opensource.kicker')}</p>
              <h2>{t('feature.opensource.title')}</h2>
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

        <section className="feature-related">
          <div className="feature-container feature-related-inner">
            <div>
              <p className="feature-kicker">{t('about.related.kicker')}</p>
              <h2>{t('about.related.title')}</h2>
            </div>
            <nav
              className="feature-related-links"
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

function SectionHeading({
  kicker,
  title,
  intro,
  light = false,
}: Readonly<{
  kicker: string
  title: string
  intro: string
  light?: boolean
}>) {
  return (
    <header className="feature-section-heading">
      <p className={`feature-kicker${light ? ' feature-kicker-light' : ''}`}>
        {kicker}
      </p>
      <h2>{title}</h2>
      <p>{intro}</p>
    </header>
  )
}

function FlowLane({
  label,
  items,
  featured = false,
}: Readonly<{
  label: string
  items: ReadonlyArray<readonly [MessageKey, LucideIcon]>
  featured?: boolean
}>) {
  const { t } = useI18n()

  return (
    <article className={`feature-flow-lane${featured ? ' is-featured' : ''}`}>
      <p>{label}</p>
      <div>
        {items.map(([messageKey, Icon], index) => (
          <span key={messageKey} className="feature-flow-node">
            {index > 0 && <ArrowRight size={17} aria-hidden="true" />}
            <span>
              <Icon size={20} />
              <strong>{t(messageKey)}</strong>
            </span>
          </span>
        ))}
      </div>
    </article>
  )
}

function LocalFirstPath() {
  const { t } = useI18n()
  const items = [
    ['feature.principles.local.node', Server],
    ['feature.principles.local.data', Files],
    ['feature.principles.local.agent', Bot],
  ] as const satisfies ReadonlyArray<readonly [MessageKey, LucideIcon]>

  return (
    <div className="feature-local-path">
      {items.map(([messageKey, Icon], index) => (
        <span key={messageKey}>
          {index > 0 && <ArrowDown size={15} aria-hidden="true" />}
          <span>
            <Icon size={16} />
            {t(messageKey)}
          </span>
        </span>
      ))}
    </div>
  )
}

function AgentCapabilityList() {
  const { t } = useI18n()

  return (
    <ul className="feature-capabilities">
      {agentCapabilities.map(([messageKey, Icon]) => (
        <li key={messageKey}>
          <Icon size={15} />
          {t(messageKey)}
        </li>
      ))}
    </ul>
  )
}

function P2pNetworkDiagram() {
  const { t } = useI18n()

  return (
    <div className="feature-p2p-mini" aria-hidden="true">
      <span className="feature-p2p-agent">
        <Bot size={16} />
        Agent
      </span>
      <span className="feature-p2p-a">{t('feature.principles.p2p.userA')}</span>
      <strong>MostBox</strong>
      <span className="feature-p2p-b">{t('feature.principles.p2p.userB')}</span>
      <small>{t('feature.principles.p2p.network')}</small>
    </div>
  )
}

function DiagramNode({
  icon: Icon,
  title,
  className,
}: Readonly<{ icon: LucideIcon; title: string; className?: string }>) {
  return (
    <div className={`feature-diagram-node ${className ?? ''}`}>
      <Icon size={21} />
      <strong>{title}</strong>
    </div>
  )
}

function DiagramConnector() {
  return <span className="feature-diagram-connector" aria-hidden="true" />
}
