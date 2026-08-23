import { useState, useEffect, Suspense, useMemo, useRef } from 'react'
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
import { translateMessage, useI18n } from '~/lib/i18n'
import {
  isChatJoinInviteExpired,
  normalizeChatJoinInvitePayload,
  type ChatJoinInvitePayload,
} from '~/lib/chatJoinInvite'
import {
  decryptChatJoinToken,
  getChatJoinTokenFromHash,
} from '~/lib/chatJoinToken'
import { createChatJoinInviteIdentity } from '~/lib/chatJoinIdentity'
import { shouldConnectChatJoinInviteNode } from '~/lib/chatJoinRemote'
import { getChatJoinTestInvite } from '~/lib/chatJoinTestData.js'
import { buildChatSharePath } from '~/lib/chatRoom.js'

const CHANNEL_REMARK_MAX_LENGTH = 50
function getJoinChannelUrl(channelId: string) {
  return buildChatSharePath(channelId)
}

function normalizeChannelRemark(value?: string) {
  return String(value || '')
    .trim()
    .slice(0, CHANNEL_REMARK_MAX_LENGTH)
}

function ChatJoinContent() {
  const { t, setLocale } = useI18n()
  const searchStr = useLocation({ select: location => location.searchStr })
  const fixture = useMemo(() => {
    const searchParams = new URLSearchParams(searchStr)
    return searchParams.get('fixture') || ''
  }, [searchStr])
  const token =
    typeof window === 'undefined'
      ? ''
      : getChatJoinTokenFromHash(window.location.hash)
  const hasBackend = useAppStore(s => s.hasBackend)
  const setAppearance = useAppStore(s => s.setAppearance)
  const setUserIdentity = useUserStore(s => s.setUserIdentity)

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [retryAttempt, setRetryAttempt] = useState(0)
  const flowKeyRef = useRef('')

  function retryJoin() {
    flowKeyRef.current = ''
    setError('')
    setLoading(true)
    setRetryAttempt(attempt => attempt + 1)
  }

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

    if (hasBackend === null) {
      return
    }

    const flowKey = fixtureInvite ? `fixture:${fixture}` : token
    if (flowKeyRef.current === flowKey) return
    flowKeyRef.current = flowKey
    setError('')
    setLoading(true)

    async function runJoinFlow(invite: ChatJoinInvitePayload) {
      const translateForInvite: typeof t = (key, params) =>
        invite.locale
          ? translateMessage(key, invite.locale, params)
          : t(key, params)

      if (invite.locale) {
        setLocale(invite.locale)
      }

      if (invite.appearance === 'dark') {
        setAppearance('dark')
      }

      if (invite.appearance === 'light') {
        setAppearance('light')
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

      const nextIdentity = createChatJoinInviteIdentity(invite)
      setUserIdentity(nextIdentity)

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
      window.location.href = getJoinChannelUrl(
        firstJoinedChannelKey || firstChannel.id
      )
    }

    async function decrypt() {
      try {
        if (fixtureInvite) {
          await runJoinFlow(fixtureInvite)
          return
        }

        const invite = normalizeChatJoinInvitePayload(
          decryptChatJoinToken(token)
        )
        if (!invite) {
          setError(t('chatJoin.error.invalidInvite'))
          return
        }
        if (isChatJoinInviteExpired(invite)) {
          setError(t('chatJoin.error.expired'))
          return
        }
        await runJoinFlow(invite)
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
  }, [
    fixture,
    hasBackend,
    retryAttempt,
    setAppearance,
    setLocale,
    setUserIdentity,
    t,
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
            <p>{error}</p>
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
