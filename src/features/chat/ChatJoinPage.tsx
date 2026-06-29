import React, { useState, useEffect, Suspense, useMemo, useRef } from 'react'
import { useLocation } from '@tanstack/react-router'
import { KeyRound, Check, AlertCircle } from 'lucide-react'
import { AppEmpty } from '~/components/AppEmpty'
import { useAppStore } from '~/stores/useAppStore'
import { useUserStore } from '~/stores/userStore'
import { createLoginIdentity } from '~server/src/utils/userIdentity.js'
import {
  checkBackendConnectionTarget,
  configureBackend,
  getBackendUrlExport,
  getRemoteInviteExport,
  getRemoteUrlExport,
} from '~server/src/utils/api'
import { channelApi } from '~/lib/channelApi'
import { getUserChannelProfile } from '~/lib/userProfile'
import { translateMessage, useI18n } from '~/lib/i18n'
import {
  CHAT_JOIN_DEFAULT_API_BASE,
  normalizeChatJoinInvitePayload,
  type ChatJoinInvitePayload,
} from '~/lib/chatJoinInvite'
import { shouldConnectChatJoinInviteNode } from '~/lib/chatJoinRemote'
import { getChatJoinTestInvite } from '~/lib/chatJoinTestData.js'

const CHANNEL_REMARK_MAX_LENGTH = 50
const CHAT_JOIN_API_BASE =
  import.meta.env.VITE_CHAT_JOIN_API_BASE || CHAT_JOIN_DEFAULT_API_BASE

function parseJsonText(text: string): unknown | null {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
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
  const hasBackend = useAppStore(s => s.hasBackend)
  const setUserIdentity = useUserStore(s => s.setUserIdentity)

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
        invite.locale
          ? translateMessage(key, invite.locale, params)
          : t(key, params)

      if (invite.locale) {
        setLocale(invite.locale)
      }

      const remoteUrl = getRemoteUrlExport()
      const remoteInvite = getRemoteInviteExport()
      const activeBackendUrl = getBackendUrlExport()

      if (
        shouldConnectChatJoinInviteNode({
          inviteNodeUrl: invite.node_url,
          inviteNodeInvite: invite.node_invite,
          hasBackend,
          activeBackendUrl,
          activeRemoteUrl: remoteUrl,
          activeRemoteInvite: remoteInvite,
        })
      ) {
        setStatus(translateForInvite('chatJoin.status.connectingRemote'))
        const result = await checkBackendConnectionTarget({
          url: invite.node_url,
          invite: invite.node_invite || '',
        })

        if (!result.ok) {
          throw new Error(
            translateForInvite('chatJoin.error.remoteConnectFailed')
          )
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
        theme: invite.theme,
        displayName: invite.name || identity.displayName,
        logo: invite.logo,
        logo_dark: invite.logo_dark,
        data: invite.data,
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
          const invite = normalizeChatJoinInvitePayload(parsed)
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
    <AppEmpty className="chat-join-loading-page">
      <div className="chat-join-loading-panel">
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
          </div>
        ) : (
          <div className="chat-join-success">
            <Check size={32} />
            <p>{status || t('chatJoin.status.decryptSuccess')}</p>
          </div>
        )}
      </div>
    </AppEmpty>
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
