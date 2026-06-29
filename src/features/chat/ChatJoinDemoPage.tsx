import { useMemo, useState, type ReactNode } from 'react'
import {
  ExternalLink,
  KeyRound,
  Link as LinkIcon,
  RefreshCw,
} from 'lucide-react'
import AppShell from '~/components/AppShell'
import { CopyButton } from '~/components/CopyButton'
import { AppTop } from '~/components/AppTop'
import { useI18n, type Locale } from '~/lib/i18n'
import {
  CHAT_JOIN_DEFAULT_API_BASE,
  CHAT_JOIN_EA_PUBLIC_KEY,
  normalizeChatJoinInvitePayload,
  type ChatJoinInvitePayload,
} from '~/lib/chatJoinInvite'
import {
  most25519,
  mostBoxEncrypt,
  mostWallet,
} from '~server/src/utils/mostWallet.js'

const DEFAULT_SENDER_USERNAME = 'chat-join-demo'
const DEFAULT_SENDER_PASSWORD = ''
const DEFAULT_CHANNEL_ID = 'chatjoin_support'
const CHANNEL_ID_PATTERN = /^[a-zA-Z0-9_-]{3,30}$/
const PUBLIC_KEY_PATTERN = /^0x[a-fA-F0-9]{64}$/
const CHAT_JOIN_API_BASE =
  import.meta.env.VITE_CHAT_JOIN_API_BASE || CHAT_JOIN_DEFAULT_API_BASE

type SenderKeys = {
  publicKey: string
  privateKey: string
}

type ParsedInviteLink = {
  token: string
  pub: string
  origin?: string
}

function getDefaultLinkOrigin() {
  if (typeof window === 'undefined') return 'https://most.box'
  return window.location.origin
}

function normalizeLinkOrigin(value: string) {
  return (value.trim() || getDefaultLinkOrigin()).replace(/\/+$/, '')
}

function createSenderKeys(username: string, password: string): SenderKeys {
  const wallet = mostWallet(
    username.trim() || DEFAULT_SENDER_USERNAME,
    password
  )
  const keys = most25519(wallet.danger)
  return {
    publicKey: keys.public_key,
    privateKey: keys.private_key,
  }
}

function optionalTrim(value: string) {
  const trimmed = value.trim()
  return trimmed || undefined
}

function parseJsonText(text: string): unknown | null {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

function parseInviteLinkInput(value: string): ParsedInviteLink | null {
  const input = value.trim()
  if (!input) return null

  let params: URLSearchParams
  let origin: string | undefined

  try {
    const url = new URL(input, getDefaultLinkOrigin())
    params = url.searchParams
    origin = url.origin
  } catch {
    params = new URLSearchParams(input.replace(/^\?/, ''))
  }

  const token = params.get('token')?.trim() || ''
  const pub = params.get('pub')?.trim() || ''
  if (!token || !pub) return null

  return { token, pub, origin }
}

function DemoField({
  label,
  children,
  wide = false,
}: {
  label: string
  children: ReactNode
  wide?: boolean
}) {
  return (
    <label className={`chat-join-demo-field ${wide ? 'wide' : ''}`}>
      <span>{label}</span>
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
  const [channelName, setChannelName] = useState('Chat Join Demo')
  const [locale, setLocale] = useState<Locale>('zh-CN')
  const [useSparkbitTheme, setUseSparkbitTheme] = useState(true)
  const [logo, setLogo] = useState('')
  const [logoDark, setLogoDark] = useState('')
  const [avatar, setAvatar] = useState('')
  const [data, setData] = useState('')
  const [nodeUrl, setNodeUrl] = useState('')
  const [nodeInvite, setNodeInvite] = useState('')
  const [recipientPublicKey, setRecipientPublicKey] = useState(
    CHAT_JOIN_EA_PUBLIC_KEY
  )
  const [senderUsername, setSenderUsername] = useState(DEFAULT_SENDER_USERNAME)
  const [senderPassword, setSenderPassword] = useState(DEFAULT_SENDER_PASSWORD)
  const [senderKeys, setSenderKeys] = useState(() =>
    createSenderKeys(DEFAULT_SENDER_USERNAME, DEFAULT_SENDER_PASSWORD)
  )
  const [existingLink, setExistingLink] = useState('')
  const [parseMessage, setParseMessage] = useState('')
  const [parseError, setParseError] = useState('')
  const [isParsingLink, setIsParsingLink] = useState(false)
  const [generatedToken, setGeneratedToken] = useState('')
  const [generatedPub, setGeneratedPub] = useState('')
  const [generatedLink, setGeneratedLink] = useState('')
  const [error, setError] = useState('')

  const payload = useMemo<ChatJoinInvitePayload>(() => {
    const invite: ChatJoinInvitePayload = {
      uid: uid.trim(),
      locale,
      channels: [
        {
          id: channelId.trim(),
          name: optionalTrim(channelName),
        },
      ],
    }

    if (useSparkbitTheme) invite.theme = 'sparkbit'
    invite.node_url = optionalTrim(nodeUrl)
    invite.node_invite = optionalTrim(nodeInvite)
    invite.logo = optionalTrim(logo)
    invite.logo_dark = optionalTrim(logoDark)
    invite.data = optionalTrim(data)
    invite.avatar = optionalTrim(avatar)
    invite.name = optionalTrim(displayName)
    return invite
  }, [
    avatar,
    channelId,
    channelName,
    data,
    displayName,
    locale,
    logo,
    logoDark,
    nodeInvite,
    nodeUrl,
    uid,
    useSparkbitTheme,
  ])

  const payloadText = useMemo(() => JSON.stringify(payload, null, 2), [payload])

  function handleDeriveSenderKeys() {
    setSenderKeys(createSenderKeys(senderUsername, senderPassword))
    setGeneratedToken('')
    setGeneratedPub('')
    setGeneratedLink('')
    setError('')
  }

  function applyInvitePayload(invite: ChatJoinInvitePayload) {
    const firstChannel = invite.channels[0]
    setUid(invite.uid)
    setLocale(invite.locale || 'zh-CN')
    setUseSparkbitTheme(invite.theme === 'sparkbit')
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

  async function handleParseExistingLink() {
    const parsedLink = parseInviteLinkInput(existingLink)
    if (!parsedLink) {
      setParseMessage('')
      setParseError(t('chatJoin.demo.error.linkInvalid'))
      return
    }

    const nextOrigin = parsedLink.origin || normalizeLinkOrigin(linkOrigin)
    const nextLink = `${nextOrigin}/chat/join?token=${encodeURIComponent(parsedLink.token)}&pub=${encodeURIComponent(parsedLink.pub)}`
    setLinkOrigin(nextOrigin)
    setGeneratedToken(parsedLink.token)
    setGeneratedPub(parsedLink.pub)
    setGeneratedLink(nextLink)
    setParseMessage(t('chatJoin.demo.status.linkParsed'))
    setParseError('')
    setIsParsingLink(true)

    try {
      const response = await fetch(
        `${CHAT_JOIN_API_BASE}/api/chat.join.decrypt`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: parsedLink.token,
            pub: parsedLink.pub,
          }),
        }
      )
      const responseText = await response.text()
      const parsedPayload = parseJsonText(responseText)

      if (!response.ok) {
        const error =
          parsedPayload &&
          typeof parsedPayload === 'object' &&
          'error' in parsedPayload &&
          typeof parsedPayload.error === 'string'
            ? parsedPayload.error
            : responseText
        throw new Error(error || t('chatJoin.error.decrypt'))
      }

      const invite = normalizeChatJoinInvitePayload(parsedPayload)
      if (!invite) {
        setParseError(t('chatJoin.demo.error.parseInvalidPayload'))
        setParseMessage(t('chatJoin.demo.status.linkParsed'))
        return
      }

      applyInvitePayload(invite)
      setParseMessage(t('chatJoin.demo.status.linkDecrypted'))
      setParseError('')
    } catch (err) {
      setParseError(
        t('chatJoin.demo.error.parseDecryptFailed', {
          message: err instanceof Error ? err.message : String(err),
        })
      )
    } finally {
      setIsParsingLink(false)
    }
  }

  function handleGenerateLink() {
    const cleanedUid = uid.trim()
    const cleanedChannelId = channelId.trim()
    const cleanedRecipientPublicKey = recipientPublicKey.trim()

    if (!cleanedUid) {
      setError(t('chatJoin.demo.error.uidRequired'))
      return
    }

    if (!CHANNEL_ID_PATTERN.test(cleanedChannelId)) {
      setError(t('chatJoin.demo.error.channelInvalid'))
      return
    }

    if (!PUBLIC_KEY_PATTERN.test(cleanedRecipientPublicKey)) {
      setError(t('chatJoin.demo.error.recipientPublicInvalid'))
      return
    }

    if (
      !PUBLIC_KEY_PATTERN.test(senderKeys.publicKey) ||
      !PUBLIC_KEY_PATTERN.test(senderKeys.privateKey)
    ) {
      setError(t('chatJoin.demo.error.senderKeysInvalid'))
      return
    }

    try {
      const token = mostBoxEncrypt(payloadText, {
        senderPrivateKey: senderKeys.privateKey,
        recipientPublicKey: cleanedRecipientPublicKey,
      })
      const pub = senderKeys.publicKey
      const link = `${normalizeLinkOrigin(linkOrigin)}/chat/join?token=${encodeURIComponent(token)}&pub=${encodeURIComponent(pub)}`
      setGeneratedToken(token)
      setGeneratedPub(pub)
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

            <DemoField label={t('chatJoin.demo.field.existingLink')} wide>
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
                disabled={isParsingLink}
              >
                <LinkIcon size={16} />
                {isParsingLink
                  ? t('chatJoin.demo.action.parsing')
                  : t('chatJoin.demo.action.parseLink')}
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
              <DemoField label={t('chatJoin.demo.field.origin')}>
                <input
                  className="input input-compact"
                  value={linkOrigin}
                  onChange={event => setLinkOrigin(event.target.value)}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck="false"
                />
              </DemoField>
              <DemoField label={t('chatJoin.demo.field.uid')}>
                <input
                  className="input input-compact"
                  value={uid}
                  onChange={event => setUid(event.target.value)}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck="false"
                />
              </DemoField>
              <DemoField label={t('chatJoin.demo.field.name')}>
                <input
                  className="input input-compact"
                  value={displayName}
                  onChange={event => setDisplayName(event.target.value)}
                />
              </DemoField>
              <DemoField label={t('chatJoin.demo.field.locale')}>
                <select
                  className="input input-compact"
                  value={locale}
                  onChange={event => setLocale(event.target.value as Locale)}
                >
                  <option value="zh-CN">zh-CN</option>
                  <option value="zh-TW">zh-TW</option>
                  <option value="en">en</option>
                </select>
              </DemoField>
              <DemoField label={t('chatJoin.demo.field.channelId')}>
                <input
                  className="input input-compact"
                  value={channelId}
                  onChange={event => setChannelId(event.target.value)}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck="false"
                />
              </DemoField>
              <DemoField label={t('chatJoin.demo.field.channelName')}>
                <input
                  className="input input-compact"
                  value={channelName}
                  onChange={event => setChannelName(event.target.value)}
                />
              </DemoField>
              <DemoField label={t('chatJoin.demo.field.nodeUrl')}>
                <input
                  className="input input-compact"
                  value={nodeUrl}
                  onChange={event => setNodeUrl(event.target.value)}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck="false"
                />
              </DemoField>
              <DemoField label={t('chatJoin.demo.field.nodeInvite')}>
                <input
                  className="input input-compact"
                  value={nodeInvite}
                  onChange={event => setNodeInvite(event.target.value)}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck="false"
                />
              </DemoField>
              <DemoField label={t('chatJoin.demo.field.logo')}>
                <input
                  className="input input-compact"
                  value={logo}
                  onChange={event => setLogo(event.target.value)}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck="false"
                />
              </DemoField>
              <DemoField label={t('chatJoin.demo.field.logoDark')}>
                <input
                  className="input input-compact"
                  value={logoDark}
                  onChange={event => setLogoDark(event.target.value)}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck="false"
                />
              </DemoField>
              <DemoField label={t('chatJoin.demo.field.avatar')}>
                <input
                  className="input input-compact"
                  value={avatar}
                  onChange={event => setAvatar(event.target.value)}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck="false"
                />
              </DemoField>
              <label className="chat-join-demo-toggle">
                <input
                  type="checkbox"
                  checked={useSparkbitTheme}
                  onChange={event => setUseSparkbitTheme(event.target.checked)}
                />
                <span>{t('chatJoin.demo.field.sparkbitTheme')}</span>
              </label>
              <DemoField label={t('chatJoin.demo.field.data')} wide>
                <textarea
                  className="textarea mono"
                  value={data}
                  onChange={event => setData(event.target.value)}
                  rows={3}
                  translate="no"
                />
              </DemoField>
            </div>
          </section>

          <section className="chat-join-demo-section">
            <div className="chat-join-helper-title">
              <KeyRound size={18} />
              <h3>{t('chatJoin.demo.cryptoSection')}</h3>
            </div>

            <div className="chat-join-demo-grid">
              <DemoField
                label={t('chatJoin.demo.field.recipientPublicKey')}
                wide
              >
                <input
                  className="input input-compact"
                  value={recipientPublicKey}
                  onChange={event => setRecipientPublicKey(event.target.value)}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck="false"
                  translate="no"
                />
              </DemoField>
              <DemoField label={t('chatJoin.demo.field.senderUsername')}>
                <input
                  className="input input-compact"
                  value={senderUsername}
                  onChange={event => setSenderUsername(event.target.value)}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck="false"
                />
              </DemoField>
              <DemoField label={t('chatJoin.demo.field.senderPassword')}>
                <input
                  className="input input-compact"
                  value={senderPassword}
                  onChange={event => setSenderPassword(event.target.value)}
                  type="password"
                />
              </DemoField>
              <div className="chat-join-demo-actions">
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={handleDeriveSenderKeys}
                >
                  <RefreshCw size={16} />
                  {t('chatJoin.demo.action.deriveSender')}
                </button>
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={handleGenerateLink}
                >
                  <LinkIcon size={16} />
                  {t('chatJoin.demo.action.generate')}
                </button>
              </div>
              <DemoField label={t('chatJoin.demo.field.senderPublicKey')} wide>
                <input
                  className="input input-compact"
                  value={senderKeys.publicKey}
                  readOnly
                  translate="no"
                />
              </DemoField>
            </div>

            {error && <p className="chat-join-demo-error">{error}</p>}
          </section>

          <section className="chat-join-demo-section">
            <div className="chat-join-helper-title">
              <LinkIcon size={18} />
              <h3>{t('chatJoin.demo.outputSection')}</h3>
            </div>

            <DemoField label={t('chatJoin.demo.field.payload')} wide>
              <textarea
                className="textarea mono"
                value={payloadText}
                readOnly
                rows={9}
                translate="no"
              />
            </DemoField>

            <DemoField label={t('chatJoin.demo.field.token')} wide>
              <textarea
                className="textarea mono"
                value={generatedToken}
                readOnly
                rows={4}
                translate="no"
              />
            </DemoField>

            <DemoField label={t('chatJoin.demo.field.pub')} wide>
              <input
                className="input input-compact"
                value={generatedPub}
                readOnly
                translate="no"
              />
            </DemoField>

            <DemoField label={t('chatJoin.demo.field.link')} wide>
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
