import React, { useState, useEffect, Suspense, useMemo, useRef } from 'react'
import { useLocation } from '@tanstack/react-router'
import {
  KeyRound,
  Check,
  AlertCircle,
  Sun,
  Moon,
  ArrowLeft,
} from 'lucide-react'
import AppShell from '~/components/AppShell'
import { useBack } from '~/hooks/useBack'
import { useAppStore } from '~/stores/useAppStore'
import { useUserStore } from '~/stores/userStore'
import { createLoginIdentity } from '~server/src/utils/userIdentity.js'
import {
  checkBackendConnectionTarget,
  configureBackend,
} from '~server/src/utils/api'
import { channelApi } from '~/lib/channelApi'
import { getUserChannelProfile } from '~/lib/userSync'
import { translateMessage, useI18n } from '~/lib/i18n'
import {
  CHAT_JOIN_INVITE_FIELDS,
  normalizeChatJoinInviteLocale,
  type ChatJoinInvitePayload,
} from '~/lib/chatJoinInvite'
import {
  formatChatJoinTestInvite,
  getChatJoinTestInvite,
} from '~/lib/chatJoinTestData.js'

const EA_TEST_PUBLIC_KEY =
  '0x955fe80bdb8312165471fcacd6a8f83df88a770dda6f38657ca4e62ec28d5b54'
const CHANNEL_REMARK_MAX_LENGTH = 50
const CHAT_JOIN_API_BASE =
  import.meta.env.VITE_CHAT_JOIN_API_BASE || 'https://api.most.box'

function parseJsonText(text: string): unknown | null {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

function parseNestedJsonText(value: unknown): unknown | null {
  if (typeof value !== 'string') return value
  return parseJsonText(value)
}

function formatDecryptedResponse(text: string, parsed: unknown | null) {
  if (parsed === null) {
    return text
  }

  return JSON.stringify(parsed, null, 2)
}

function getDecryptError(
  text: string,
  parsed: unknown | null,
  fallback: string
) {
  if (parsed && typeof parsed === 'object' && 'error' in parsed) {
    const error = parsed.error

    if (typeof error === 'string') {
      return error
    }
  }

  return text || fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeOptionalString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeInviteIdentity(value: unknown) {
  const identity = normalizeOptionalString(value)
  return identity === 'user' ||
    identity === 'service' ||
    identity === 'service_ai'
    ? identity
    : undefined
}

function normalizeInvitePayload(input: unknown): ChatJoinInvitePayload | null {
  const value = parseNestedJsonText(input)
  if (!isRecord(value)) return null

  const uid = normalizeOptionalString(value.uid)
  const rawChannels = Array.isArray(value.channels) ? value.channels : []
  const channels = rawChannels
    .filter(isRecord)
    .map(channel => ({
      id: normalizeOptionalString(channel.id),
      name: normalizeOptionalString(channel.name) || undefined,
    }))
    .filter(channel => channel.id)

  if (!uid || channels.length === 0) return null

  return {
    node_url: normalizeOptionalString(value.node_url) || undefined,
    node_invite: normalizeOptionalString(value.node_invite) || undefined,
    locale: normalizeChatJoinInviteLocale(value.locale),
    uid,
    identity: normalizeInviteIdentity(value.identity),
    logo: normalizeOptionalString(value.logo) || undefined,
    avatar: normalizeOptionalString(value.avatar) || undefined,
    name: normalizeOptionalString(value.name) || undefined,
    channels,
  }
}

function getJoinChannelUrl(channelId: string) {
  return `/chat?channel=${encodeURIComponent(channelId)}`
}

function normalizeChannelRemark(value?: string) {
  return String(value || '')
    .trim()
    .slice(0, CHANNEL_REMARK_MAX_LENGTH)
}

function ChatJoinContent() {
  const { t, setLocale } = useI18n()
  const searchStr = useLocation({ select: location => location.searchStr })
  const { token, pub, fixture } = useMemo(() => {
    const searchParams = new URLSearchParams(searchStr)
    return {
      token: searchParams.get('token') || '',
      pub: searchParams.get('pub') || '',
      fixture: searchParams.get('fixture') || '',
    }
  }, [searchStr])
  const isDarkMode = useAppStore(s => s.isDarkMode)
  const setIsDarkMode = useAppStore(s => s.setIsDarkMode)
  const hasBackend = useAppStore(s => s.hasBackend)
  const setUserIdentity = useUserStore(s => s.setUserIdentity)
  const back = useBack()

  const [decrypted, setDecrypted] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const flowKeyRef = useRef('')

  useEffect(() => {
    const fixtureInvite = getChatJoinTestInvite(fixture)

    if (fixture && !fixtureInvite) {
      setError(t('chatJoin.error.unknownFixture', { fixture }))
      setLoading(false)
      return
    }

    if (!fixtureInvite && !token) {
      setError(t('chatJoin.error.missingToken'))
      setLoading(false)
      return
    }

    if (!fixtureInvite && !pub) {
      setError(t('chatJoin.error.missingPub'))
      setLoading(false)
      return
    }

    if (hasBackend === null) {
      setStatus(t('chatJoin.status.checkingBackend'))
      return
    }

    const flowKey = fixtureInvite ? `fixture:${fixture}` : `${token}:${pub}`
    if (flowKeyRef.current === flowKey) return
    flowKeyRef.current = flowKey

    async function runJoinFlow(invite: ChatJoinInvitePayload) {
      const translateForInvite: typeof t = (key, params) =>
        invite.locale ? translateMessage(key, invite.locale, params) : t(key, params)

      if (invite.locale) {
        setLocale(invite.locale)
      }

      if (invite.node_url) {
        setStatus(translateForInvite('chatJoin.status.connectingRemote'))
        const result = await checkBackendConnectionTarget({
          url: invite.node_url,
          invite: invite.node_invite || '',
        })

        if (!result.ok) {
          throw new Error(translateForInvite('chatJoin.error.remoteConnectFailed'))
        }

        configureBackend({
          url: invite.node_url,
          invite: invite.node_invite || '',
        })
        useAppStore.setState({ hasBackend: true })
      } else if (!hasBackend) {
        throw new Error(translateForInvite('chatJoin.error.noBackend'))
      }

      setStatus(translateForInvite('chatJoin.status.signingIn'))
      const identity = createLoginIdentity(invite.uid, '')
      const nextIdentity = {
        ...identity,
        identity: invite.identity,
        displayName: invite.name || identity.displayName,
        logo: invite.logo,
        avatar: invite.avatar,
      }
      setUserIdentity(nextIdentity)

      setStatus(translateForInvite('chatJoin.status.joiningChannel'))
      let firstJoinedChannelKey = ''
      for (const channel of invite.channels) {
        const result = await channelApi.createChannel(
          channel.id,
          'public',
          getUserChannelProfile(nextIdentity)
        )
        const joinedChannelKey = result.channelKey || result.key || channel.id
        if (!firstJoinedChannelKey) firstJoinedChannelKey = joinedChannelKey
        const remark = normalizeChannelRemark(channel.name)
        if (remark) {
          await channelApi.setChannelRemark(joinedChannelKey, remark)
        }
      }

      const firstChannel = invite.channels[0]
      setStatus(translateForInvite('chatJoin.status.openingChannel'))
      window.location.href = getJoinChannelUrl(
        firstJoinedChannelKey || firstChannel.id
      )
    }

    async function decrypt() {
      try {
        if (fixtureInvite) {
          setStatus(
            t('chatJoin.status.loadingFixture', {
              name: fixtureInvite.name || fixture,
            })
          )
          setDecrypted(formatChatJoinTestInvite(fixtureInvite))
          await runJoinFlow(fixtureInvite)
          return
        }

        setStatus(t('chatJoin.status.decryptingInvite'))
        const response = await fetch(
          `${CHAT_JOIN_API_BASE}/api/chat.join.decrypt`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, pub }),
          }
        )

        const responseText = await response.text()
        const parsed = parseJsonText(responseText)

        if (!response.ok) {
          setError(
            getDecryptError(responseText, parsed, t('chatJoin.error.decrypt'))
          )
        } else {
          setDecrypted(formatDecryptedResponse(responseText, parsed))
          const invite = normalizeInvitePayload(parsed)
          if (!invite) {
            setError(t('chatJoin.error.invalidInvite'))
            return
          }
          await runJoinFlow(invite)
        }
      } catch (err) {
        setError(
          t('chatJoin.error.request', {
            message: err instanceof Error ? err.message : String(err),
          })
        )
      } finally {
        setLoading(false)
      }
    }

    decrypt()
  }, [fixture, hasBackend, pub, setLocale, setUserIdentity, t, token])

  return (
    <AppShell
      sidebar={() => (
        <button
          type="button"
          className="sidebar-header sidebar-header-link"
          onClick={back}
        >
          <ArrowLeft size={18} />
          <h1>MOST PEOPLE</h1>
        </button>
      )}
      headerTitle={<h2 className="header-title">{t('chatJoin.title')}</h2>}
      headerRight={
        <button
          className="btn btn-icon"
          onClick={() => setIsDarkMode(!isDarkMode)}
          title={t('common.theme.toggle')}
        >
          {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      }
    >
      <div className="chat-join-container">
        <div className="chat-join-panel">
          {loading ? (
            <div className="chat-join-loading">
              <KeyRound size={32} />
              <p>{status || t('chatJoin.status.decrypting')}</p>
            </div>
          ) : error ? (
            <div className="chat-join-error">
              <AlertCircle size={32} />
              <p>{error}</p>
              {status && <p className="chat-join-status">{status}</p>}
              {decrypted && (
                <pre className="chat-join-result" translate="no">
                  {decrypted}
                </pre>
              )}
            </div>
          ) : (
            <div className="chat-join-success">
              <Check size={32} />
              <p>{status || t('chatJoin.status.decryptSuccess')}</p>
              <pre className="chat-join-result" translate="no">
                {decrypted}
              </pre>
            </div>
          )}

          <section
            className="chat-join-spec"
            aria-labelledby="chat-join-spec-title"
          >
            <div className="chat-join-helper-title">
              <KeyRound size={18} />
              <h3 id="chat-join-spec-title">{t('chatJoin.specTitle')}</h3>
            </div>
            <div className="chat-join-field-list">
              {CHAT_JOIN_INVITE_FIELDS.map(field => (
                <div className="chat-join-field" key={field.name}>
                  <div className="chat-join-field-meta">
                    <code className="chat-join-field-name">{field.name}</code>
                    <span>
                      {field.required
                        ? t('chatJoin.field.required')
                        : t('chatJoin.field.optional')}
                    </span>
                  </div>
                  <p>{t(field.descriptionKey)}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="chat-join-helper" aria-labelledby="ea-test-title">
            <div className="chat-join-helper-title">
              <KeyRound size={18} />
              <h3 id="ea-test-title">{t('chatJoin.testPublicKey')}</h3>
            </div>
            <code className="ui-code-box chat-join-public-key" translate="no">
              {EA_TEST_PUBLIC_KEY}
            </code>
            <a className="btn" href="/web3/#EA" target="_blank">
              {t('chatJoin.openWeb3')}
            </a>
          </section>

        </div>
      </div>
    </AppShell>
  )
}

function ChatJoinPage() {
  return (
    <Suspense>
      <ChatJoinContent />
    </Suspense>
  )
}

export default ChatJoinPage
