import { useState, useEffect, Suspense, useMemo } from 'react'
import { useLocation } from '@tanstack/react-router'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { AppEmpty } from '~/components/AppEmpty'
import { ChatRestoringIndicator } from '~/features/chat/ChatRestoringIndicator'
import { useAppStore } from '~/stores/useAppStore'
import { useUserStore } from '~/stores/userStore'
import {
  checkBackendConnectionTarget,
  configureBackend,
  getBackendUrlExport,
  getRemoteInviteExport,
  getRemoteUrlExport,
} from '~server/src/utils/api'
import { channelApi } from '~/lib/channelApi'
import { getUserChannelProfile } from '~/lib/userProfile'
import { translateMessage, useI18n, type MessageKey } from '~/lib/i18n'
import { normalizeChatJoinInvitePayload } from '~/lib/chatJoinInvite'
import {
  decryptChatJoinToken,
  getChatJoinTokenFromHash,
} from '~/lib/chatJoinToken'
import { createChatJoinInviteIdentity } from '~/lib/chatJoinIdentity'
import {
  retryChatJoinConnection,
  shouldConnectChatJoinInviteNode,
} from '~/lib/chatJoinRemote'
import { getChatJoinTestInvite } from '~/lib/chatJoinTestData.js'
import { buildChatSharePath } from '~/lib/chatRoom.js'

const CHANNEL_REMARK_MAX_LENGTH = 50

interface ChatJoinError {
  key: MessageKey
  params?: Record<string, string | number>
  request?: boolean
}

function getJoinChannelUrl(channelId: string) {
  return buildChatSharePath(channelId)
}

function normalizeChannelRemark(value?: string) {
  return String(value || '')
    .trim()
    .slice(0, CHANNEL_REMARK_MAX_LENGTH)
}

function ChatJoinContent() {
  const { locale, setLocale } = useI18n()
  const searchStr = useLocation({ select: location => location.searchStr })
  const hash = useLocation({ select: location => location.hash })
  const fixture = useMemo(() => {
    const searchParams = new URLSearchParams(searchStr)
    return searchParams.get('fixture') || ''
  }, [searchStr])
  const token = getChatJoinTokenFromHash(hash)
  const invite = useMemo(
    () =>
      normalizeChatJoinInvitePayload(
        fixture ? getChatJoinTestInvite(fixture) : decryptChatJoinToken(token)
      ),
    [fixture, token]
  )
  const backendReady = useAppStore(s => s.hasBackend !== null)
  const setAppearance = useAppStore(s => s.setAppearance)
  const setUserIdentity = useUserStore(s => s.setUserIdentity)

  const [error, setError] = useState<ChatJoinError | null>(null)
  const [loading, setLoading] = useState(true)
  const [retryAttempt, setRetryAttempt] = useState(0)

  const t = (key: MessageKey, params?: Record<string, string | number>) =>
    translateMessage(key, invite?.locale ?? locale, params)
  const errorMessage = error
    ? error.request
      ? t('chatJoin.error.request', { message: t(error.key, error.params) })
      : t(error.key, error.params)
    : ''

  function retryJoin() {
    setError(null)
    setLoading(true)
    setRetryAttempt(attempt => attempt + 1)
  }

  useEffect(() => {
    setError(null)
    setLoading(true)

    if (fixture && !invite) {
      setError({ key: 'chatJoin.error.unknownFixture', params: { fixture } })
      setLoading(false)
      return
    }

    if (!fixture && !token) {
      setError({ key: 'chatJoin.error.missingToken' })
      setLoading(false)
      return
    }

    if (!invite) {
      setError({ key: 'chatJoin.error.invalidInvite' })
      setLoading(false)
      return
    }

    if (!backendReady) return

    const controller = new AbortController()
    const { signal } = controller
    const activeInvite = invite

    async function runJoinFlow() {
      if (activeInvite.locale) {
        setLocale(activeInvite.locale)
      }

      if (activeInvite.appearance === 'dark') {
        setAppearance('dark')
      }

      if (activeInvite.appearance === 'light') {
        setAppearance('light')
      }

      const remoteUrl = getRemoteUrlExport()
      const remoteInvite = getRemoteInviteExport()
      const activeBackendUrl = getBackendUrlExport()
      const hasBackend = useAppStore.getState().hasBackend

      if (
        shouldConnectChatJoinInviteNode({
          inviteNodeUrl: activeInvite.node_url,
          inviteNodeInvite: activeInvite.node_invite,
          hasBackend,
          activeBackendUrl,
          activeRemoteUrl: remoteUrl,
          activeRemoteInvite: remoteInvite,
        })
      ) {
        const result = await retryChatJoinConnection(
          () =>
            checkBackendConnectionTarget({
              url: activeInvite.node_url || '',
              invite: activeInvite.node_invite || '',
              signal,
            }),
          signal
        )
        signal.throwIfAborted()

        if (!result.ok) {
          setError({ key: 'chatJoin.error.remoteConnectFailed', request: true })
          return
        }

        const connectedUrl = result.url
        configureBackend({
          url: connectedUrl,
          invite: activeInvite.node_invite || '',
        })
        useAppStore.setState({
          hasBackend: true,
          activeBackendUrl: connectedUrl,
        })
      } else if (!hasBackend) {
        setError({ key: 'chatJoin.error.noBackend', request: true })
        return
      }

      signal.throwIfAborted()
      const nextIdentity = createChatJoinInviteIdentity(activeInvite)
      setUserIdentity(nextIdentity)

      let firstJoinedChannelKey = ''
      for (const channel of activeInvite.channels) {
        signal.throwIfAborted()
        const result = await channelApi.createChannel(
          channel.id,
          'public',
          getUserChannelProfile(nextIdentity)
        )
        signal.throwIfAborted()
        const joinedChannelKey = result.channelKey || result.key || channel.id
        if (!firstJoinedChannelKey) firstJoinedChannelKey = joinedChannelKey
        const remark = normalizeChannelRemark(channel.name)
        if (remark) {
          await channelApi.setChannelRemark(joinedChannelKey, remark)
          signal.throwIfAborted()
        }
      }

      signal.throwIfAborted()
      const firstChannel = activeInvite.channels[0]
      window.location.href = getJoinChannelUrl(
        firstJoinedChannelKey || firstChannel.id
      )
    }

    async function join() {
      try {
        // Let effect cleanup cancel before any joining side effects start.
        await Promise.resolve()
        signal.throwIfAborted()
        await runJoinFlow()
      } catch {
        if (!signal.aborted) {
          setError({ key: 'chatJoin.error.unexpected', request: true })
        }
      } finally {
        if (!signal.aborted) setLoading(false)
      }
    }

    void join()
    return () => controller.abort()
  }, [
    fixture,
    invite,
    backendReady,
    retryAttempt,
    setAppearance,
    setLocale,
    setUserIdentity,
    token,
  ])

  return (
    <AppEmpty className="chat-join-loading-page">
      <div className="chat-join-loading-panel">
        {loading ? (
          <ChatRestoringIndicator />
        ) : error ? (
          <div className="chat-join-error">
            <AlertCircle size={32} />
            <p>{errorMessage}</p>
            <div className="chat-join-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={retryJoin}
              >
                <RefreshCw size={16} />
                {t('chatJoin.action.retry')}
              </button>
            </div>
          </div>
        ) : (
          <ChatRestoringIndicator />
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
