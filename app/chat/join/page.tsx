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
import { useAppStore } from '~/app/app/useAppStore'
import { useUserStore } from '~/app/app/userStore'
import { createLoginIdentity } from '~/server/src/utils/userIdentity.js'
import {
  checkBackendConnectionTarget,
  configureBackend,
} from '~/server/src/utils/api'
import { channelApi } from '~/lib/channelApi'
import {
  CHAT_JOIN_INVITE_FIELDS,
  type ChatJoinInvitePayload,
} from '~/lib/chatJoinInvite'

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

function getDecryptError(text: string, parsed: unknown | null) {
  if (parsed && typeof parsed === 'object' && 'error' in parsed) {
    const error = parsed.error

    if (typeof error === 'string') {
      return error
    }
  }

  return text || '解密失败'
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
    locale: normalizeOptionalString(value.locale) || undefined,
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
  const searchStr = useLocation({ select: location => location.searchStr })
  const { token, pub } = useMemo(() => {
    const searchParams = new URLSearchParams(searchStr)
    return {
      token: searchParams.get('token') || '',
      pub: searchParams.get('pub') || '',
    }
  }, [searchStr])
  const isDarkMode = useAppStore(s => s.isDarkMode)
  const setIsDarkMode = useAppStore(s => s.setIsDarkMode)
  const hasBackend = useAppStore(s => s.hasBackend)
  const setUserIdentity = useUserStore(s => s.setUserIdentity)

  const [decrypted, setDecrypted] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const flowKeyRef = useRef('')

  useEffect(() => {
    if (!token) {
      setError('缺少 token 参数')
      setLoading(false)
      return
    }

    if (!pub) {
      setError('缺少 pub 参数')
      setLoading(false)
      return
    }

    if (hasBackend === null) {
      setStatus('正在检测后端连接...')
      return
    }

    const flowKey = `${token}:${pub}`
    if (flowKeyRef.current === flowKey) return
    flowKeyRef.current = flowKey

    async function runJoinFlow(invite: ChatJoinInvitePayload) {
      if (invite.node_url) {
        setStatus('正在连接远程节点...')
        const result = await checkBackendConnectionTarget({
          url: invite.node_url,
          invite: invite.node_invite || '',
        })

        if (!result.ok) {
          throw new Error('远程节点连接失败')
        }

        configureBackend({
          url: invite.node_url,
          invite: invite.node_invite || '',
        })
        useAppStore.setState({ hasBackend: true })
      } else if (!hasBackend) {
        throw new Error('未连接后端，邀请中也没有 node_url')
      }

      setStatus('正在登录邀请账号...')
      const identity = createLoginIdentity(invite.uid, '')
      setUserIdentity({
        ...identity,
        identity: invite.identity,
        displayName: invite.name || identity.displayName,
        logo: invite.logo,
        avatar: invite.avatar,
      })

      setStatus('正在加入频道...')
      let firstJoinedChannelKey = ''
      for (const channel of invite.channels) {
        const result = await channelApi.createChannel(channel.id, 'public', {
          displayName: invite.name || identity.displayName,
          avatar: invite.avatar,
        })
        if (result.conflict) {
          throw new Error(`频道 ${channel.id} 存在多个候选，请在聊天页选择`)
        }
        const joinedChannelKey = result.channelKey || result.key || channel.id
        if (!firstJoinedChannelKey) firstJoinedChannelKey = joinedChannelKey
        const remark = normalizeChannelRemark(channel.name)
        if (remark) {
          await channelApi.setChannelRemark(joinedChannelKey, remark)
        }
      }

      const firstChannel = invite.channels[0]
      setStatus('加入成功，正在打开频道...')
      window.location.href = getJoinChannelUrl(
        firstJoinedChannelKey || firstChannel.id
      )
    }

    async function decrypt() {
      try {
        setStatus('正在解密邀请...')
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
          setError(getDecryptError(responseText, parsed))
        } else {
          setDecrypted(formatDecryptedResponse(responseText, parsed))
          const invite = normalizeInvitePayload(parsed)
          if (!invite) {
            setError('邀请内容缺少 uid 或 channels[].id')
            return
          }
          await runJoinFlow(invite)
        }
      } catch (err) {
        setError(
          `请求出错: ${err instanceof Error ? err.message : String(err)}`
        )
      } finally {
        setLoading(false)
      }
    }

    decrypt()
  }, [hasBackend, pub, setUserIdentity, token])

  return (
    <AppShell
      sidebar={() => (
        <div
          className="sidebar-header sidebar-header-link"
          onClick={() => (window.location.href = '/chat')}
        >
          <ArrowLeft size={18} />
          <h1>MOST PEOPLE</h1>
        </div>
      )}
      headerTitle={<h2 className="header-title">加入频道</h2>}
      headerRight={
        <button
          className="btn btn-icon"
          onClick={() => setIsDarkMode(!isDarkMode)}
          title="切换主题"
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
              <p>{status || '正在解密...'}</p>
            </div>
          ) : error ? (
            <div className="chat-join-error">
              <AlertCircle size={32} />
              <p>{error}</p>
              {status && <p className="chat-join-status">{status}</p>}
              {decrypted && <pre className="chat-join-result">{decrypted}</pre>}
            </div>
          ) : (
            <div className="chat-join-success">
              <Check size={32} />
              <p>{status || '解密成功'}</p>
              <pre className="chat-join-result">{decrypted}</pre>
            </div>
          )}

          <section
            className="chat-join-spec"
            aria-labelledby="chat-join-spec-title"
          >
            <div className="chat-join-helper-title">
              <KeyRound size={18} />
              <h3 id="chat-join-spec-title">支持字段</h3>
            </div>
            <div className="chat-join-field-list">
              {CHAT_JOIN_INVITE_FIELDS.map(field => (
                <div className="chat-join-field" key={field.name}>
                  <div className="chat-join-field-meta">
                    <code className="chat-join-field-name">{field.name}</code>
                    <span>{field.required ? '必填' : '可选'}</span>
                  </div>
                  <p>{field.description}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="chat-join-helper" aria-labelledby="ea-test-title">
            <div className="chat-join-helper-title">
              <KeyRound size={18} />
              <h3 id="ea-test-title">测试公钥</h3>
            </div>
            <code className="ui-code-box chat-join-public-key">
              {EA_TEST_PUBLIC_KEY}
            </code>
            <a className="btn" href="/web3/#EA" target="_blank">
              前往 Web3 工具箱
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
