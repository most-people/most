import '~/styles/about.css'

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
  ['about.why.current.files', Files],
  ['about.why.current.cloud', Cloud],
  ['about.why.current.search', Search],
] as const satisfies ReadonlyArray<readonly [MessageKey, LucideIcon]>

const futureFlow = [
  ['about.why.future.person', CircleUserRound],
  ['about.why.future.agent', Bot],
  ['about.why.future.space', BrainCircuit],
  ['about.why.future.network', Network],
] as const satisfies ReadonlyArray<readonly [MessageKey, LucideIcon]>

const problems = [
  'about.why.problem.relationships',
  'about.why.problem.decisions',
  'about.why.problem.context',
  'about.why.problem.restart',
] as const satisfies readonly MessageKey[]

const evolution: EvolutionStage[] = [
  {
    icon: Cloud,
    generationKey: 'about.evolution.storage.generation',
    titleKey: 'about.evolution.storage.title',
    examplesKey: 'about.evolution.storage.examples',
    bodyKey: 'about.evolution.storage.body',
  },
  {
    icon: Database,
    generationKey: 'about.evolution.base.generation',
    titleKey: 'about.evolution.base.title',
    examplesKey: 'about.evolution.base.examples',
    bodyKey: 'about.evolution.base.body',
  },
  {
    icon: BrainCircuit,
    generationKey: 'about.evolution.os.generation',
    titleKey: 'about.evolution.os.title',
    examplesKey: 'about.evolution.os.examples',
    bodyKey: 'about.evolution.os.body',
  },
]

const principles: MessageItem[] = [
  {
    icon: Server,
    titleKey: 'about.principles.local.title',
    bodyKey: 'about.principles.local.body',
  },
  {
    icon: Bot,
    titleKey: 'about.principles.agent.title',
    bodyKey: 'about.principles.agent.body',
  },
  {
    icon: Network,
    titleKey: 'about.principles.p2p.title',
    bodyKey: 'about.principles.p2p.body',
  },
]

const agentCapabilities = [
  ['about.principles.agent.context', BrainCircuit],
  ['about.principles.agent.memory', FileClock],
  ['about.principles.agent.relationships', Waypoints],
  ['about.principles.agent.permissions', ShieldCheck],
  ['about.principles.agent.history', History],
] as const satisfies ReadonlyArray<readonly [MessageKey, LucideIcon]>

const designDna: MessageItem[] = [
  {
    icon: NotebookPen,
    titleKey: 'about.dna.obsidian.title',
    bodyKey: 'about.dna.obsidian.body',
  },
  {
    icon: GitBranch,
    titleKey: 'about.dna.git.title',
    bodyKey: 'about.dna.git.body',
  },
  {
    icon: Link2,
    titleKey: 'about.dna.mcp.title',
    bodyKey: 'about.dna.mcp.body',
  },
  {
    icon: Network,
    titleKey: 'about.dna.p2p.title',
    bodyKey: 'about.dna.p2p.body',
  },
]

const nodeFoundations = [
  ['about.architecture.knowledge', NotebookPen],
  ['about.architecture.history', GitBranch],
  ['about.architecture.files', Files],
  ['about.architecture.identity', KeyRound],
] as const satisfies ReadonlyArray<readonly [MessageKey, LucideIcon]>

const futureLayers = [
  'about.architecture.future.context',
  'about.architecture.future.memory',
  'about.architecture.future.graph',
] as const satisfies readonly MessageKey[]

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
            <img
              src="/about-artemis.webp"
              alt=""
              decoding="async"
              fetchPriority="high"
            />
          </div>
          <div className="about-hero-shade" aria-hidden="true" />
          <div className="about-container about-hero-inner">
            <div className="about-hero-copy">
              <p className="about-kicker about-kicker-light">
                <Sparkles size={15} />
                {t('about.hero.kicker')}
              </p>
              <h1>{t('about.hero.title')}</h1>
              <p className="about-hero-lede">{t('about.hero.desc')}</p>
              <div className="about-hero-signals">
                <span>
                  <Server size={16} />
                  {t('about.hero.local')}
                </span>
                <span>
                  <Bot size={16} />
                  {t('about.hero.agent')}
                </span>
                <span>
                  <Network size={16} />
                  {t('about.hero.network')}
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="about-section about-why">
          <div className="about-container">
            <SectionHeading
              kicker={t('about.why.kicker')}
              title={t('about.why.title')}
              intro={t('about.why.intro')}
            />
            <div className="about-flow-comparison">
              <FlowLane
                label={t('about.why.current.label')}
                items={currentFlow}
              />
              <FlowLane
                label={t('about.why.future.label')}
                items={futureFlow}
                featured
              />
            </div>
            <div className="about-problem-block">
              <h3>{t('about.why.problem.title')}</h3>
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

        <section className="about-section about-evolution">
          <div className="about-container">
            <SectionHeading
              kicker={t('about.evolution.kicker')}
              title={t('about.evolution.title')}
              intro={t('about.evolution.intro')}
              light
            />
            <ol className="about-evolution-list">
              {evolution.map((stage, index) => {
                const Icon = stage.icon
                return (
                  <li key={stage.titleKey}>
                    <div className="about-evolution-index">
                      <span>0{index + 1}</span>
                      <Icon size={22} />
                    </div>
                    <p className="about-stage-label">
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

        <section className="about-section about-principles">
          <div className="about-container">
            <SectionHeading
              kicker={t('about.principles.kicker')}
              title={t('about.principles.title')}
              intro={t('about.principles.intro')}
            />
            <div className="about-principle-list">
              {principles.map((principle, index) => {
                const Icon = principle.icon
                return (
                  <article key={principle.titleKey}>
                    <div className="about-principle-header">
                      <span className="about-number">0{index + 1}</span>
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

        <section className="about-section about-dna">
          <div className="about-container">
            <SectionHeading
              kicker={t('about.dna.kicker')}
              title={t('about.dna.title')}
              intro={t('about.dna.intro')}
            />
            <div className="about-dna-equation">
              {designDna.map((item, index) => {
                const Icon = item.icon
                return (
                  <div key={item.titleKey} className="about-dna-part">
                    {index > 0 && (
                      <span
                        className="about-equation-symbol"
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
            <div className="about-dna-result">
              <ArrowDown size={20} aria-hidden="true" />
              <strong>MostBox</strong>
              <span>{t('about.dna.result')}</span>
            </div>
          </div>
        </section>

        <section className="about-section about-architecture">
          <div className="about-container">
            <SectionHeading
              kicker={t('about.architecture.kicker')}
              title={t('about.architecture.title')}
              intro={t('about.architecture.intro')}
            />
            <div
              className="about-architecture-diagram"
              aria-label={t('about.architecture.label')}
            >
              <DiagramNode
                icon={Bot}
                title={t('about.architecture.agents')}
                className="about-architecture-agents"
              />
              <DiagramConnector />
              <DiagramNode
                icon={Link2}
                title={t('about.architecture.mcp')}
                className="about-architecture-mcp"
              />
              <DiagramConnector />
              <div className="about-personal-node">
                <div className="about-personal-node-heading">
                  <Server size={24} />
                  <div>
                    <span>{t('about.architecture.current')}</span>
                    <h3>{t('about.architecture.node')}</h3>
                  </div>
                </div>
                <div className="about-node-foundations">
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
                title={t('about.architecture.p2p')}
                className="about-architecture-p2p"
              />
              <DiagramConnector />
              <div className="about-other-nodes">
                <Server size={22} />
                <Server size={22} />
                <Server size={22} />
                <strong>{t('about.architecture.others')}</strong>
              </div>
            </div>
            <div className="about-future-layer">
              <div>
                <Sparkles size={18} />
                <strong>{t('about.architecture.future.title')}</strong>
              </div>
              <ul>
                {futureLayers.map(messageKey => (
                  <li key={messageKey}>{t(messageKey)}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="about-vision">
          <div className="about-container">
            <p className="about-kicker about-kicker-light">
              <Sparkles size={15} />
              {t('about.vision.kicker')}
            </p>
            <h2>{t('about.vision.title')}</h2>
            <p className="about-vision-copy">{t('about.vision.body')}</p>
            <div className="about-vision-equation" aria-hidden="true">
              <span>{t('about.vision.personalAi')}</span>
              <strong>+</strong>
              <span>{t('about.vision.personalNode')}</span>
              <strong>+</strong>
              <span>{t('about.vision.globalNetwork')}</span>
            </div>
            <blockquote>{t('about.vision.final')}</blockquote>
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
          </div>
        </section>

        <section className="about-open-source">
          <div className="about-container about-open-source-inner">
            <Code2 size={28} />
            <div>
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

        <section className="about-related">
          <div className="about-container about-related-inner">
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
    <header className="about-section-heading">
      <p className={`about-kicker${light ? ' about-kicker-light' : ''}`}>
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
    <article className={`about-flow-lane${featured ? ' is-featured' : ''}`}>
      <p>{label}</p>
      <div>
        {items.map(([messageKey, Icon], index) => (
          <span key={messageKey} className="about-flow-node">
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
    ['about.principles.local.node', Server],
    ['about.principles.local.data', Files],
    ['about.principles.local.agent', Bot],
  ] as const satisfies ReadonlyArray<readonly [MessageKey, LucideIcon]>

  return (
    <div className="about-local-path">
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
    <ul className="about-capabilities">
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
    <div className="about-p2p-mini" aria-hidden="true">
      <span className="about-p2p-agent">
        <Bot size={16} />
        Agent
      </span>
      <span className="about-p2p-a">{t('about.principles.p2p.userA')}</span>
      <strong>MostBox</strong>
      <span className="about-p2p-b">{t('about.principles.p2p.userB')}</span>
      <small>{t('about.principles.p2p.network')}</small>
    </div>
  )
}

function DiagramNode({
  icon: Icon,
  title,
  className,
}: Readonly<{ icon: LucideIcon; title: string; className?: string }>) {
  return (
    <div className={`about-diagram-node ${className ?? ''}`}>
      <Icon size={21} />
      <strong>{title}</strong>
    </div>
  )
}

function DiagramConnector() {
  return <span className="about-diagram-connector" aria-hidden="true" />
}
