import { useMemo, useState, type ReactNode } from 'react'
import { ExternalLink, Link as LinkIcon } from 'lucide-react'
import AppShell from '~/components/AppShell'
import { CopyButton } from '~/components/CopyButton'
import { AppTop } from '~/components/AppTop'
import { SelectControl } from '~/components/ui'
import { useI18n, type Locale } from '~/lib/i18n'
import {
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
  const [channelId, setChannelId] = useState(DEFAULT_CHANNEL_ID)
  const [channelName, setChannelName] = useState('Chat Join Demo')
  const [locale, setLocale] = useState<Locale>('zh-CN')
  const [theme, setTheme] = useState<ChatJoinInvitePayload['theme']>('sparkbit')
  const [appearance, setAppearance] =
    useState<ChatJoinInvitePayload['appearance']>()
  const [logo, setLogo] = useState('')
  const [logoDark, setLogoDark] = useState('')
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
    return invite
  }, [
    appearance,
    channelId,
    channelName,
    data,
    locale,
    logo,
    logoDark,
    nodeInvite,
    nodeUrl,
    theme,
  ])

  const payloadText = useMemo(() => JSON.stringify(payload, null, 2), [payload])

  function applyInvitePayload(invite: ChatJoinInvitePayload) {
    const firstChannel = invite.channels[0]
    setLocale(invite.locale || 'zh-CN')
    setTheme(invite.theme)
    setAppearance(invite.appearance)
    setNodeUrl(invite.node_url || '')
    setNodeInvite(invite.node_invite || '')
    setLogo(invite.logo || '')
    setLogoDark(invite.logo_dark || '')
    setData(invite.data || '')
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
    setParseError('')
  }

  function handleGenerateLink() {
    const cleanedChannelId = channelId.trim()

    if (!CHANNEL_ID_PATTERN.test(cleanedChannelId)) {
      setError(t('chatJoin.demo.error.channelInvalid'))
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
                    value="sparkbit"
                    checked={theme === 'sparkbit'}
                    onClick={() =>
                      setTheme(theme === 'sparkbit' ? undefined : 'sparkbit')
                    }
                    readOnly
                  />
                  <span>sparkbit</span>
                </label>
              </div>
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
