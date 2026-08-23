import { useMemo, useState, type ReactNode } from 'react'
import {
  BookOpen,
  ExternalLink,
  Link as LinkIcon,
  LogIn,
  MessageCircle,
  Send,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react'
import AppShell from '~/components/AppShell'
import { CopyButton } from '~/components/CopyButton'
import { AppTop } from '~/components/AppTop'
import { SelectControl } from '~/components/ui'
import { useI18n, type Locale } from '~/lib/i18n'
import {
  isChatJoinInviteExpired,
  normalizeChatJoinInvitePayload,
  type ChatJoinInvitePayload,
} from '~/lib/chatJoinInvite'
import {
  buildChatJoinUrl,
  decryptChatJoinToken,
  encryptChatJoinToken,
  parseChatJoinTokenInput,
} from '~/lib/chatJoinToken'

const DEFAULT_CHANNEL_ID = 'chatjoin_support'
const DEFAULT_CHANNEL_NAME = 'Chat Join Demo'
const DEFAULT_INVITE_DURATION_MS = 24 * 60 * 60 * 1000
const CHANNEL_ID_PATTERN = /^[a-zA-Z0-9_-]{3,30}$/

const APPEARANCE_OPTIONS: Array<{
  value: NonNullable<ChatJoinInvitePayload['appearance']>
  label: string
}> = [
  { value: 'dark', label: 'dark' },
  { value: 'light', label: 'light' },
]

const LOCALE_OPTIONS: Array<{ value: Locale; label: string }> = [
  { value: 'zh-CN', label: 'zh-CN' },
  { value: 'zh-TW', label: 'zh-TW' },
  { value: 'en', label: 'en' },
]

function getDefaultLinkOrigin() {
  if (typeof window === 'undefined') return 'https://most.box'
  return window.location.origin
}

function normalizeLinkOrigin(value: string) {
  return (value.trim() || getDefaultLinkOrigin()).replace(/\/+$/, '')
}

function optionalTrim(value: string) {
  const trimmed = value.trim()
  return trimmed || undefined
}

function getLinkOrigin(value: string, fallback: string) {
  try {
    return new URL(value, normalizeLinkOrigin(fallback)).origin
  } catch {
    return normalizeLinkOrigin(fallback)
  }
}

function formatLocalDateTime(timestamp: number) {
  const date = new Date(timestamp)
  if (!Number.isFinite(date.getTime())) return ''
  const localTimestamp = timestamp - date.getTimezoneOffset() * 60 * 1000
  return new Date(localTimestamp).toISOString().slice(0, 16)
}

function parseLocalDateTime(value: string) {
  const timestamp = new Date(value).getTime()
  return Number.isSafeInteger(timestamp) && timestamp > 0 ? timestamp : 0
}

function DemoFieldLabel({
  name,
  description,
}: {
  name: string
  description: string
}) {
  return (
    <span className="chat-join-demo-label">
      <span className="chat-join-demo-label-key">{name}</span>
      <span className="chat-join-demo-label-desc">{description}</span>
    </span>
  )
}

function DemoField({
  name,
  description,
  children,
  wide = false,
}: {
  name: string
  description: string
  children: ReactNode
  wide?: boolean
}) {
  return (
    <label className={`chat-join-demo-field ${wide ? 'wide' : ''}`}>
      <DemoFieldLabel name={name} description={description} />
      {children}
    </label>
  )
}

export default function ChatJoinDemoPage() {
  const { t } = useI18n()
  const [linkOrigin, setLinkOrigin] = useState(getDefaultLinkOrigin)
  const [uid, setUid] = useState('demo-user')
  const [displayName, setDisplayName] = useState('Demo User')
  const [channelId, setChannelId] = useState(DEFAULT_CHANNEL_ID)
  const [channelName, setChannelName] = useState(DEFAULT_CHANNEL_NAME)
  const [expiresAt, setExpiresAt] = useState(() =>
    formatLocalDateTime(Date.now() + DEFAULT_INVITE_DURATION_MS)
  )
  const [locale, setLocale] = useState<Locale>('zh-CN')
  const [theme, setTheme] = useState<ChatJoinInvitePayload['theme']>('st')
  const [appearance, setAppearance] =
    useState<ChatJoinInvitePayload['appearance']>()
  const [logo, setLogo] = useState('')
  const [logoDark, setLogoDark] = useState('')
  const [avatar, setAvatar] = useState('')
  const [data, setData] = useState('')
  const [nodeUrl, setNodeUrl] = useState('')
  const [nodeInvite, setNodeInvite] = useState('')
  const [existingLink, setExistingLink] = useState('')
  const [parseMessage, setParseMessage] = useState('')
  const [parseError, setParseError] = useState('')
  const [generatedToken, setGeneratedToken] = useState('')
  const [generatedLink, setGeneratedLink] = useState('')
  const [error, setError] = useState('')

  const payload = useMemo<ChatJoinInvitePayload>(() => {
    const invite: ChatJoinInvitePayload = {
      expires_at: parseLocalDateTime(expiresAt),
      uid: uid.trim(),
      locale,
      channels: [
        {
          id: channelId.trim(),
          name: optionalTrim(channelName),
        },
      ],
    }

    if (theme) invite.theme = theme
    if (appearance) invite.appearance = appearance
    invite.node_url = optionalTrim(nodeUrl)
    invite.node_invite = optionalTrim(nodeInvite)
    invite.logo = optionalTrim(logo)
    invite.logo_dark = optionalTrim(logoDark)
    invite.data = optionalTrim(data)
    invite.avatar = optionalTrim(avatar)
    invite.name = optionalTrim(displayName)
    return invite
  }, [
    appearance,
    avatar,
    channelId,
    channelName,
    data,
    displayName,
    expiresAt,
    locale,
    logo,
    logoDark,
    nodeInvite,
    nodeUrl,
    theme,
    uid,
  ])

  const payloadText = useMemo(() => JSON.stringify(payload, null, 2), [payload])
  const guideSteps = [
    {
      icon: SlidersHorizontal,
      title: t('chatJoin.demo.guide.step.configure.title'),
      description: t('chatJoin.demo.guide.step.configure.description'),
    },
    {
      icon: Send,
      title: t('chatJoin.demo.guide.step.share.title'),
      description: t('chatJoin.demo.guide.step.share.description'),
    },
    {
      icon: LogIn,
      title: t('chatJoin.demo.guide.step.signIn.title'),
      description: t('chatJoin.demo.guide.step.signIn.description'),
    },
    {
      icon: MessageCircle,
      title: t('chatJoin.demo.guide.step.join.title'),
      description: t('chatJoin.demo.guide.step.join.description'),
    },
  ]

  function applyInvitePayload(invite: ChatJoinInvitePayload) {
    const firstChannel = invite.channels[0]
    setExpiresAt(formatLocalDateTime(invite.expires_at))
    setUid(invite.uid)
    setLocale(invite.locale || 'zh-CN')
    setTheme(invite.theme)
    setAppearance(invite.appearance)
    setNodeUrl(invite.node_url || '')
    setNodeInvite(invite.node_invite || '')
    setLogo(invite.logo || '')
    setLogoDark(invite.logo_dark || '')
    setData(invite.data || '')
    setAvatar(invite.avatar || '')
    setDisplayName(invite.name || '')
    setChannelId(firstChannel?.id || DEFAULT_CHANNEL_ID)
    setChannelName(firstChannel?.name || '')
  }

  function handleParseExistingLink() {
    const token = parseChatJoinTokenInput(
      existingLink,
      normalizeLinkOrigin(linkOrigin)
    )
    if (!token) {
      setParseMessage('')
      setParseError(t('chatJoin.demo.error.linkInvalid'))
      return
    }

    const nextOrigin = getLinkOrigin(existingLink, linkOrigin)
    const nextLink = buildChatJoinUrl(token, nextOrigin)
    setLinkOrigin(nextOrigin)
    setGeneratedToken(token)
    setGeneratedLink(nextLink)
    const invite = normalizeChatJoinInvitePayload(decryptChatJoinToken(token))
    if (!invite) {
      setParseMessage(t('chatJoin.demo.status.linkParsed'))
      setParseError(t('chatJoin.demo.error.parseInvalidPayload'))
      return
    }

    applyInvitePayload(invite)
    setParseMessage(t('chatJoin.demo.status.linkDecrypted'))
    setParseError(
      isChatJoinInviteExpired(invite) ? t('chatJoin.error.expired') : ''
    )
  }

  function handleGenerateLink() {
    const cleanedChannelId = channelId.trim()

    if (!uid.trim()) {
      setError(t('chatJoin.demo.error.uidRequired'))
      return
    }

    if (!CHANNEL_ID_PATTERN.test(cleanedChannelId)) {
      setError(t('chatJoin.demo.error.channelInvalid'))
      return
    }

    if (isChatJoinInviteExpired(payload)) {
      setError(t('chatJoin.demo.error.expiresAtInvalid'))
      return
    }

    try {
      const token = encryptChatJoinToken(payload)
      const link = buildChatJoinUrl(token, normalizeLinkOrigin(linkOrigin))
      setGeneratedToken(token)
      setGeneratedLink(link)
      setError('')
    } catch {
      setError(t('chatJoin.demo.error.encryptFailed'))
    }
  }

  return (
    <AppShell
      sidebar={() => <AppTop />}
      headerTitle={<h2 className="header-title">{t('chatJoin.demo.title')}</h2>}
    >
      <div className="chat-join-container">
        <div className="chat-join-demo-panel">
          <section
            className="chat-join-demo-guide"
            aria-labelledby="chat-join-demo-guide-title"
          >
            <div className="chat-join-demo-guide-heading">
              <BookOpen size={20} aria-hidden="true" />
              <div>
                <h3 id="chat-join-demo-guide-title">
                  {t('chatJoin.demo.guide.title')}
                </h3>
                <p>{t('chatJoin.demo.guide.description')}</p>
              </div>
            </div>

            <ol className="chat-join-demo-guide-steps">
              {guideSteps.map((step, index) => {
                const StepIcon = step.icon
                return (
                  <li key={step.title}>
                    <span className="chat-join-demo-guide-step-icon">
                      <StepIcon size={17} aria-hidden="true" />
                    </span>
                    <div>
                      <span className="chat-join-demo-guide-step-number">
                        {t('chatJoin.demo.guide.stepLabel', {
                          number: index + 1,
                        })}
                      </span>
                      <strong>{step.title}</strong>
                      <p>{step.description}</p>
                    </div>
                  </li>
                )
              })}
            </ol>

            <div className="chat-join-demo-guide-security">
              <div className="chat-join-demo-guide-security-title">
                <ShieldCheck size={18} aria-hidden="true" />
                <strong>{t('chatJoin.demo.guide.security.title')}</strong>
              </div>
              <code>https://most.box/chat/join#&lt;token&gt;</code>
              <ul>
                <li>{t('chatJoin.demo.guide.security.fragment')}</li>
                <li>{t('chatJoin.demo.guide.security.capability')}</li>
                <li>{t('chatJoin.demo.guide.security.identity')}</li>
                <li>{t('chatJoin.demo.guide.security.legacy')}</li>
              </ul>
            </div>
          </section>

          <section className="chat-join-demo-section">
            <div className="chat-join-helper-title">
              <LinkIcon size={18} />
              <h3>{t('chatJoin.demo.parseSection')}</h3>
            </div>

            <DemoField
              name="link"
              description={t('chatJoin.demo.field.existingLink')}
              wide
            >
              <textarea
                className="textarea mono"
                value={existingLink}
                onChange={event => setExistingLink(event.target.value)}
                rows={4}
                translate="no"
              />
            </DemoField>

            <div className="chat-join-demo-actions">
              <button
                className="btn btn-secondary"
                type="button"
                onClick={handleParseExistingLink}
              >
                <LinkIcon size={16} />
                {t('chatJoin.demo.action.parseLink')}
              </button>
            </div>

            {parseMessage && (
              <p className="chat-join-demo-success">{parseMessage}</p>
            )}
            {parseError && <p className="chat-join-demo-error">{parseError}</p>}
          </section>

          <section className="chat-join-demo-section">
            <div className="chat-join-helper-title">
              <LinkIcon size={18} />
              <h3>{t('chatJoin.demo.inviteSection')}</h3>
            </div>

            <div className="chat-join-demo-grid">
              <DemoField
                name="origin"
                description={t('chatJoin.demo.field.origin')}
              >
                <input
                  className="input input-compact"
                  value={linkOrigin}
                  onChange={event => setLinkOrigin(event.target.value)}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck="false"
                />
              </DemoField>
              <DemoField
                name="locale"
                description={t('chatJoin.demo.field.locale')}
              >
                <SelectControl<Locale>
                  ariaLabel={t('chatJoin.demo.field.locale')}
                  value={locale}
                  options={LOCALE_OPTIONS}
                  onChange={setLocale}
                  size="compact"
                />
              </DemoField>
              <DemoField
                name="expires_at"
                description={t('chatJoin.demo.field.expiresAt')}
              >
                <input
                  className="input input-compact"
                  type="datetime-local"
                  value={expiresAt}
                  onChange={event => setExpiresAt(event.target.value)}
                  step="60"
                />
              </DemoField>
              <DemoField name="uid" description={t('chatJoin.demo.field.uid')}>
                <input
                  className="input input-compact"
                  value={uid}
                  onChange={event => setUid(event.target.value)}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck="false"
                />
              </DemoField>
              <DemoField
                name="name"
                description={t('chatJoin.demo.field.displayName')}
              >
                <input
                  className="input input-compact"
                  value={displayName}
                  onChange={event => setDisplayName(event.target.value)}
                />
              </DemoField>
              <DemoField
                name="avatar"
                description={t('chatJoin.demo.field.avatar')}
              >
                <input
                  className="input input-compact"
                  value={avatar}
                  onChange={event => setAvatar(event.target.value)}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck="false"
                />
              </DemoField>
              <DemoField
                name="channels[0].id"
                description={t('chatJoin.demo.field.channelId')}
              >
                <input
                  className="input input-compact"
                  value={channelId}
                  onChange={event => setChannelId(event.target.value)}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck="false"
                />
              </DemoField>
              <DemoField
                name="channels[0].name"
                description={t('chatJoin.demo.field.channelName')}
              >
                <input
                  className="input input-compact"
                  value={channelName}
                  onChange={event => setChannelName(event.target.value)}
                />
              </DemoField>
              <DemoField
                name="node_url"
                description={t('chatJoin.demo.field.nodeUrl')}
              >
                <input
                  className="input input-compact"
                  value={nodeUrl}
                  onChange={event => setNodeUrl(event.target.value)}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck="false"
                />
              </DemoField>
              <DemoField
                name="logo"
                description={t('chatJoin.demo.field.logo')}
              >
                <input
                  className="input input-compact"
                  value={logo}
                  onChange={event => setLogo(event.target.value)}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck="false"
                />
              </DemoField>
              <DemoField
                name="logo_dark"
                description={t('chatJoin.demo.field.logoDark')}
              >
                <input
                  className="input input-compact"
                  value={logoDark}
                  onChange={event => setLogoDark(event.target.value)}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck="false"
                />
              </DemoField>
              <div className="chat-join-demo-field">
                <DemoFieldLabel
                  name="theme"
                  description={t('chatJoin.demo.field.theme')}
                />
                <label className="chat-join-demo-toggle">
                  <input
                    type="radio"
                    name="chat-join-demo-theme"
                    value="st"
                    checked={theme === 'st'}
                    onClick={() => setTheme(theme === 'st' ? undefined : 'st')}
                    readOnly
                  />
                  <span>ST</span>
                </label>
              </div>
              <DemoField
                name="node_invite"
                description={t('chatJoin.demo.field.nodeInvite')}
              >
                <input
                  className="input input-compact"
                  value={nodeInvite}
                  onChange={event => setNodeInvite(event.target.value)}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck="false"
                />
              </DemoField>
              <div className="chat-join-demo-field">
                <DemoFieldLabel
                  name="appearance"
                  description={t('chatJoin.demo.field.appearance')}
                />
                <div className="chat-join-demo-radio-options">
                  {APPEARANCE_OPTIONS.map(option => (
                    <label className="chat-join-demo-toggle" key={option.value}>
                      <input
                        type="radio"
                        name="chat-join-demo-appearance"
                        value={option.value}
                        checked={appearance === option.value}
                        onClick={() =>
                          setAppearance(
                            appearance === option.value
                              ? undefined
                              : option.value
                          )
                        }
                        readOnly
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <DemoField
                name="data"
                description={t('chatJoin.demo.field.data')}
                wide
              >
                <textarea
                  className="textarea mono"
                  value={data}
                  onChange={event => setData(event.target.value)}
                  rows={3}
                  translate="no"
                />
              </DemoField>
            </div>
            <div className="chat-join-demo-actions">
              <button
                className="btn btn-primary"
                type="button"
                onClick={handleGenerateLink}
              >
                <LinkIcon size={16} />
                {t('chatJoin.demo.action.generate')}
              </button>
            </div>

            {error && <p className="chat-join-demo-error">{error}</p>}
          </section>

          <section className="chat-join-demo-section">
            <div className="chat-join-helper-title">
              <LinkIcon size={18} />
              <h3>{t('chatJoin.demo.outputSection')}</h3>
            </div>

            <DemoField
              name="payload"
              description={t('chatJoin.demo.field.payload')}
              wide
            >
              <textarea
                className="textarea mono"
                value={payloadText}
                readOnly
                rows={9}
                translate="no"
              />
            </DemoField>

            <DemoField
              name="token"
              description={t('chatJoin.demo.field.token')}
              wide
            >
              <textarea
                className="textarea mono"
                value={generatedToken}
                readOnly
                rows={4}
                translate="no"
              />
            </DemoField>

            <DemoField
              name="link"
              description={t('chatJoin.demo.field.link')}
              wide
            >
              <textarea
                className="textarea mono"
                value={generatedLink}
                readOnly
                rows={4}
                translate="no"
              />
            </DemoField>

            <div className="chat-join-demo-actions">
              <CopyButton
                className="btn btn-secondary"
                text={generatedLink}
                label={t('common.copy')}
              />
              <a
                className="btn btn-primary"
                href={generatedLink || undefined}
                target="_blank"
                rel="noreferrer"
                aria-disabled={!generatedLink}
              >
                <ExternalLink size={16} />
                {t('chatJoin.demo.action.openLink')}
              </a>
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  )
}
