import '~/styles/docs.css'

import { lazy, Suspense } from 'react'
import { ClientOnly, Link } from '@tanstack/react-router'
import {
  ArrowRight,
  BookOpen,
  Bot,
  Braces,
  Cable,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
  Terminal,
  TriangleAlert,
} from 'lucide-react'

import { CopyButton } from '~/components/CopyButton'
import { MarketingHeader } from '~/components/MarketingHeader'
import { MarketingLayout } from '~/components/MarketingLayout'
import { useI18n, type MessageKey } from '~/lib/i18n'

const OpenApiReference = lazy(() => import('./OpenApiReference'))

const CODEX_CONFIG = `export MOSTBOX_MCP_TOKEN='<token>'
codex mcp add mostbox \\
  --url http://127.0.0.1:1976/mcp \\
  --bearer-token-env-var MOSTBOX_MCP_TOKEN
codex mcp list`

const CLAUDE_CONFIG = `{
  "mcpServers": {
    "mostbox": {
      "command": "npx",
      "args": ["-y", "most-box@latest", "mcp"],
      "env": {
        "MOSTBOX_URL": "http://127.0.0.1:1976",
        "MOSTBOX_MCP_TOKEN": "<token>"
      }
    }
  }
}`

const VSCODE_CONFIG = `{
  "inputs": [
    {
      "type": "promptString",
      "id": "mostbox-token",
      "description": "MostBox MCP token",
      "password": true
    }
  ],
  "servers": {
    "mostbox": {
      "type": "http",
      "url": "http://127.0.0.1:1976/mcp",
      "headers": {
        "Authorization": "Bearer \${input:mostbox-token}"
      }
    }
  }
}`

const MCP_TOC = [
  ['overview', 'docs.mcp.overview'],
  ['transports', 'docs.mcp.transports'],
  ['clients', 'docs.mcp.clients'],
  ['capabilities', 'docs.mcp.capabilities'],
  ['security', 'docs.mcp.security'],
  ['troubleshooting', 'docs.mcp.troubleshooting'],
] as const satisfies ReadonlyArray<readonly [string, MessageKey]>

const OPENAPI_TOC = [
  ['openapi-overview', 'docs.openapi.title'],
  ['api-reference', 'docs.tabs.openapi'],
] as const satisfies ReadonlyArray<readonly [string, MessageKey]>

const SCOPES = [
  ['node:read', 'docs.mcp.scope.nodeRead'],
  ['files:read', 'docs.mcp.scope.filesRead'],
  ['files:publish', 'docs.mcp.scope.filesPublish'],
  ['files:download', 'docs.mcp.scope.filesDownload'],
  ['downloads:cancel', 'docs.mcp.scope.downloadsCancel'],
] as const satisfies ReadonlyArray<readonly [string, MessageKey]>

const RESOURCES = [
  ['mostbox://node/status', 'docs.mcp.resource.node'],
  ['mostbox://files', 'docs.mcp.resource.files'],
  ['mostbox://holdings', 'docs.mcp.resource.holdings'],
  ['mostbox://downloads', 'docs.mcp.resource.downloads'],
] as const satisfies ReadonlyArray<readonly [string, MessageKey]>

const TOOLS = [
  ['mostbox_node_status', 'docs.mcp.tool.nodeStatus'],
  ['mostbox_list_files', 'docs.mcp.tool.listFiles'],
  ['mostbox_list_holdings', 'docs.mcp.tool.listHoldings'],
  ['mostbox_check_download', 'docs.mcp.tool.checkDownload'],
  ['mostbox_get_share_link', 'docs.mcp.tool.getShareLink'],
  ['mostbox_list_downloads', 'docs.mcp.tool.listDownloads'],
  ['mostbox_publish_local_file', 'docs.mcp.tool.publish'],
  ['mostbox_start_download', 'docs.mcp.tool.download'],
  ['mostbox_cancel_download', 'docs.mcp.tool.cancel'],
] as const satisfies ReadonlyArray<readonly [string, MessageKey]>

const SECURITY_ITEMS = [
  'docs.mcp.security.loopback',
  'docs.mcp.security.token',
  'docs.mcp.security.roots',
  'docs.mcp.security.cid',
  'docs.mcp.security.content',
] as const satisfies readonly MessageKey[]

const PROBLEMS = [
  ['docs.mcp.problem.daemon', 'docs.mcp.problem.daemon.desc'],
  ['docs.mcp.problem.token', 'docs.mcp.problem.token.desc'],
  ['docs.mcp.problem.scope', 'docs.mcp.problem.scope.desc'],
  ['docs.mcp.problem.path', 'docs.mcp.problem.path.desc'],
] as const satisfies ReadonlyArray<readonly [MessageKey, MessageKey]>

function DocsPage() {
  const { t } = useI18n()

  return (
    <MarketingLayout header={<MarketingHeader />}>
      <div className="docs-page">
        <DocsHeader
          title={t('docs.hero.title')}
          description={t('docs.hero.desc')}
        />
        <main className="docs-container docs-home">
          <nav className="docs-home-nav" aria-label={t('docs.tabs.label')}>
            <DocsHomeLink
              to="/docs/mcp/"
              icon={<Bot size={22} />}
              title={t('docs.tabs.mcp')}
              description={t('docs.home.mcp.desc')}
            />
            <DocsHomeLink
              to="/docs/api/"
              icon={<Braces size={22} />}
              title={t('docs.tabs.openapi')}
              description={t('docs.home.api.desc')}
            />
          </nav>
        </main>
      </div>
    </MarketingLayout>
  )
}

export function McpDocsPage() {
  const { t } = useI18n()

  return (
    <DocsGuidePage
      title={t('docs.tabs.mcp')}
      description={t('docs.hero.desc')}
      toc={MCP_TOC}
    >
      <McpGuide />
    </DocsGuidePage>
  )
}

export function ApiDocsPage() {
  const { t } = useI18n()

  return (
    <DocsGuidePage
      title={t('docs.tabs.openapi')}
      description={t('docs.openapi.desc')}
      toc={OPENAPI_TOC}
    >
      <OpenApiGuide />
    </DocsGuidePage>
  )
}

function DocsHeader({
  title,
  description,
}: Readonly<{ title: string; description: string }>) {
  const { t } = useI18n()

  return (
    <header className="docs-header">
      <div className="docs-container docs-header-inner">
        <div className="docs-heading">
          <Link to="/docs/" className="docs-kicker">
            <BookOpen size={15} />
            {t('docs.hero.kicker')}
          </Link>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </div>
    </header>
  )
}

function DocsGuidePage({
  title,
  description,
  toc,
  children,
}: Readonly<{
  title: string
  description: string
  toc: ReadonlyArray<readonly [string, MessageKey]>
  children: React.ReactNode
}>) {
  const { t } = useI18n()

  return (
    <MarketingLayout header={<MarketingHeader />}>
      <div className="docs-page">
        <DocsHeader title={title} description={description} />
        <div className="docs-container docs-shell">
          <aside className="docs-toc" aria-label={t('docs.toc.label')}>
            <strong>{t('docs.toc.label')}</strong>
            <nav>
              {toc.map(([id, labelKey]) => (
                <a key={id} href={`#${id}`}>
                  {t(labelKey)}
                </a>
              ))}
            </nav>
          </aside>
          <main className="docs-content">{children}</main>
        </div>
      </div>
    </MarketingLayout>
  )
}

function DocsHomeLink({
  to,
  icon,
  title,
  description,
}: Readonly<{
  to: '/docs/mcp/' | '/docs/api/'
  icon: React.ReactNode
  title: string
  description: string
}>) {
  return (
    <Link to={to} className="docs-home-link">
      <span className="docs-home-icon">{icon}</span>
      <span className="docs-home-copy">
        <strong>{title}</strong>
        <span>{description}</span>
      </span>
      <ArrowRight size={20} />
    </Link>
  )
}

function McpGuide() {
  const { t } = useI18n()

  return (
    <article className="docs-article">
      <DocsSection id="overview" title={t('docs.mcp.overview')}>
        <p>{t('docs.mcp.overview.desc')}</p>
        <Link to="/admin/" className="btn btn-primary docs-primary-action">
          <KeyRound size={16} />
          {t('docs.mcp.openAdmin')}
        </Link>
      </DocsSection>

      <DocsSection id="transports" title={t('docs.mcp.transports')}>
        <div className="docs-transport-grid">
          <div className="docs-transport">
            <Cable size={20} />
            <h3>{t('docs.mcp.http.title')}</h3>
            <code translate="no">http://127.0.0.1:1976/mcp</code>
            <p>{t('docs.mcp.http.desc')}</p>
          </div>
          <div className="docs-transport">
            <Terminal size={20} />
            <h3>{t('docs.mcp.stdio.title')}</h3>
            <code translate="no">npx -y most-box@latest mcp</code>
            <p>{t('docs.mcp.stdio.desc')}</p>
          </div>
        </div>
      </DocsSection>

      <DocsSection id="clients" title={t('docs.mcp.clients')}>
        <p>{t('docs.mcp.clients.desc')}</p>
        <CodeBlock title={t('docs.mcp.codex')} code={CODEX_CONFIG} />
        <CodeBlock
          title={t('docs.mcp.claude')}
          language="json"
          code={CLAUDE_CONFIG}
        />
        <CodeBlock
          title={t('docs.mcp.vscode')}
          language="json"
          code={VSCODE_CONFIG}
        />
      </DocsSection>

      <DocsSection id="capabilities" title={t('docs.mcp.capabilities')}>
        <p>{t('docs.mcp.capabilities.desc')}</p>
        <DocsTable
          title={t('docs.mcp.scopes')}
          firstHeading={t('docs.mcp.scope')}
          secondHeading={t('docs.mcp.grants')}
          rows={SCOPES.map(([name, labelKey]) => [name, t(labelKey)])}
        />
        <DocsTable
          title={t('docs.mcp.resources')}
          firstHeading={t('docs.mcp.uri')}
          secondHeading={t('docs.mcp.content')}
          rows={RESOURCES.map(([name, labelKey]) => [name, t(labelKey)])}
        />
        <DocsTable
          title={t('docs.mcp.tools')}
          firstHeading={t('docs.mcp.tool')}
          secondHeading={t('docs.mcp.behavior')}
          rows={TOOLS.map(([name, labelKey]) => [name, t(labelKey)])}
        />
      </DocsSection>

      <DocsSection id="security" title={t('docs.mcp.security')}>
        <ul className="docs-security-list">
          {SECURITY_ITEMS.map(messageKey => (
            <li key={messageKey}>
              <ShieldCheck size={18} />
              <span>{t(messageKey)}</span>
            </li>
          ))}
        </ul>
      </DocsSection>

      <DocsSection id="troubleshooting" title={t('docs.mcp.troubleshooting')}>
        <dl className="docs-problems">
          {PROBLEMS.map(([titleKey, descriptionKey]) => (
            <div key={titleKey}>
              <dt>{t(titleKey)}</dt>
              <dd>{t(descriptionKey)}</dd>
            </div>
          ))}
        </dl>
      </DocsSection>
    </article>
  )
}

function OpenApiGuide() {
  const { t } = useI18n()

  return (
    <article className="docs-article docs-openapi-article">
      <DocsSection id="openapi-overview" title={t('docs.openapi.title')}>
        <p>{t('docs.openapi.desc')}</p>
        <div className="docs-api-notes">
          <div>
            <LockKeyhole size={18} />
            <div>
              <strong>{t('docs.openapi.auth.title')}</strong>
              <p>{t('docs.openapi.auth.signature')}</p>
              <p>{t('docs.openapi.auth.bearer')}</p>
              <p>{t('docs.openapi.auth.invite')}</p>
            </div>
          </div>
          <div className="docs-api-warning">
            <TriangleAlert size={18} />
            <p>{t('docs.openapi.warning')}</p>
          </div>
        </div>
      </DocsSection>
      <section id="api-reference" className="docs-api-reference-section">
        <ClientOnly fallback={<ApiLoading />}>
          <Suspense fallback={<ApiLoading />}>
            <OpenApiReference />
          </Suspense>
        </ClientOnly>
      </section>
    </article>
  )
}

function ApiLoading() {
  const { t } = useI18n()
  return <div className="docs-api-loading">{t('docs.openapi.loading')}</div>
}

function DocsSection({
  id,
  title,
  children,
}: Readonly<{
  id: string
  title: string
  children: React.ReactNode
}>) {
  return (
    <section id={id} className="docs-section">
      <h2>{title}</h2>
      {children}
    </section>
  )
}

function CodeBlock({
  title,
  code,
  language = 'shell',
}: Readonly<{ title: string; code: string; language?: string }>) {
  return (
    <div className="docs-code-block">
      <div className="docs-code-header">
        <span>{title}</span>
        <CopyButton text={code} />
      </div>
      <pre translate="no">
        <code className={`language-${language}`}>{code}</code>
      </pre>
    </div>
  )
}

function DocsTable({
  title,
  firstHeading,
  secondHeading,
  rows,
}: Readonly<{
  title: string
  firstHeading: string
  secondHeading: string
  rows: ReadonlyArray<readonly [string, string]>
}>) {
  return (
    <div className="docs-table-section">
      <h3>{title}</h3>
      <div className="docs-table-wrap">
        <table>
          <thead>
            <tr>
              <th>{firstHeading}</th>
              <th>{secondHeading}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, description]) => (
              <tr key={name}>
                <td>
                  <code translate="no">{name}</code>
                </td>
                <td>{description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default DocsPage
