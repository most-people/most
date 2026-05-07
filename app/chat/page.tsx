'use client'

import React, { useState, useEffect, useRef } from 'react'
import {
  MessageSquare,
  Send,
  Plus,
  Sun,
  Moon,
  X,
  Eye,
  EyeOff,
  Download,
  ArrowRight,
} from 'lucide-react'
import AppShell from '~/components/AppShell'
import { InputModal, ConfirmModal } from '~/components/ui'
import { api } from '~/server/src/utils/api'
import {
  getDisplayName,
  loadIdentity,
  saveIdentity,
  saveGuestIdentity,
  loadGuestIdentity,
  createGuestIdentity,
  createLoginIdentity,
  generateGuestPassword,
} from '~/server/src/utils/userIdentity.js'
import { generateAvatar } from '~/server/src/utils/avatar.js'
import { useAppStore } from '~/app/app/useAppStore'
import { useDisclosure, useToggle } from '~/hooks'
import Link from 'next/link'

interface ChannelMessage {
  id?: string
  author: string
  authorName?: string
  content: string
  timestamp: number
  pending?: boolean
}

interface Channel {
  name: string
}

interface SendMessageResult {
  message: ChannelMessage
}

const API = {
  getChannels: () => api.get<Channel[]>('/api/channels').json(),
  createChannel: (name: string, type: string) =>
    api.post(`/api/channels`, { json: { name, type } }).json(),
  leaveChannel: (name: string) =>
    api.delete(`/api/channels/${encodeURIComponent(name)}`).json(),
  getChannelMessages: (name: string, limit = 100, offset = 0) =>
    api
      .get<
        ChannelMessage[]
      >(`/api/channels/${encodeURIComponent(name)}/messages?limit=${limit}&offset=${offset}`)
      .json(),
  sendChannelMessage: (
    name: string,
    content: string,
    author: string,
    authorName: string
  ) =>
    api
      .post<SendMessageResult>(
        `/api/channels/${encodeURIComponent(name)}/messages`,
        { json: { content, author, authorName } }
      )
      .json(),
  getChannelPeers: (name: string) =>
    api.get<string[]>(`/api/channels/${encodeURIComponent(name)}/peers`).json(),
}

const MOCK_CHANNELS: Channel[] = [
  { name: 'general' },
  { name: 'random' },
  { name: 'tech' },
]

const MOCK_MESSAGES: ChannelMessage[] = [
  {
    id: 'm1',
    author: 'user1',
    authorName: 'Alice',
    content: '大家好！欢迎使用 P2P 聊天',
    timestamp: Date.now() - 3600000,
  },
  {
    id: 'm2',
    author: 'user2',
    authorName: 'Bob',
    content: '这个聊天是基于 Hyperswarm 的，完全去中心化',
    timestamp: Date.now() - 3500000,
  },
  {
    id: 'm3',
    author: 'user3',
    authorName: 'Charlie',
    content: '消息通过 P2P 网络同步，无需服务器',
    timestamp: Date.now() - 3400000,
  },
]

function ChatPage() {
  const isDarkMode = useAppStore(s => s.isDarkMode)
  const setIsDarkMode = useAppStore(s => s.setIsDarkMode)
  const hasBackend = useAppStore(s => s.hasBackend)
  const [channels, setChannels] = useState([])
  const [activeChannel, setActiveChannel] = useState(null)
  const [channelMessages, setChannelMessages] = useState([])
  const [channelPeers, setChannelPeers] = useState([])
  const [channelInput, setChannelInput] = useState('')
  const [showJoinChannel, joinChannelModal] = useDisclosure(false)
  const [myPeerId, setMyPeerId] = useState('')
  const [error, setError] = useState('')
  const [isJoiningChannel, setIsJoiningChannel] = useState(false)
  const [isLeavingChannel, setIsLeavingChannel] = useState(false)
  const [showLeaveChannelConfirm, leaveChannelModal] = useDisclosure(false)
  const [channelToLeave, setChannelToLeave] = useState(null)
  const [userIdentity, setUserIdentity] = useState(null)
  const [showLogin, loginModal] = useDisclosure(false)
  const [loginUsername, setLoginUsername] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [showPassword, togglePassword] = useToggle()
  const [loginPreviewAvatar, setLoginPreviewAvatar] = useState(null)
  const [loginPreviewAddress, setLoginPreviewAddress] = useState('')
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [hasPreviewedAvatar, setHasPreviewedAvatar] = useState(false)

  const wsRef = useRef(null)
  const channelMessagesEndRef = useRef(null)
  const activeChannelRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)
  const isWsConnectedRef = useRef(false)

  useEffect(() => {
    activeChannelRef.current = activeChannel
  }, [activeChannel])

  useEffect(() => {
    channelMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [channelMessages])

  useEffect(() => {
    api
      .get('/api/node-id')
      .json<{ id: string }>()
      .then(d => setMyPeerId(d.id))
      .catch(err => {
        console.warn('[Chat] Failed to fetch node ID:', err.message)
      })
  }, [])

  useEffect(() => {
    let identity = loadIdentity()
    if (!identity) {
      identity = createGuestIdentity(generateGuestPassword())
      saveIdentity(identity)
    }
    setUserIdentity(identity)
  }, [])

  const pendingSubscriptionRef = useRef(null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (myPeerId && pendingSubscriptionRef.current) {
      const channelName = pendingSubscriptionRef.current
      pendingSubscriptionRef.current = null
      subscribeToChannel(channelName)
    }
  }, [myPeerId])

  useEffect(() => {
    function connectWs() {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
      const ws = new WebSocket(
        `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`
      )

      ws.onopen = () => {
        isWsConnectedRef.current = true
        if (myPeerId && ws.readyState === 1) {
          ws.send(
            JSON.stringify({ event: 'register', data: { peerId: myPeerId } })
          )
        }
        if (activeChannelRef.current) {
          subscribeToChannel(activeChannelRef.current.name)
          syncChannelMessages(activeChannelRef.current.name)
        }
      }

      ws.onmessage = e => {
        try {
          const { event, data } = JSON.parse(e.data)
          handleWsEvent(event, data)
        } catch (err) {
          console.warn('[Chat WS] Failed to parse message:', err.message)
        }
      }

      ws.onclose = () => {
        isWsConnectedRef.current = false
        if (isMountedRef.current) {
          reconnectTimeoutRef.current = setTimeout(connectWs, 3000)
        }
      }

      ws.onerror = () => {
        ws.close()
      }

      wsRef.current = ws
    }

    connectWs()

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [])

  useEffect(() => {
    if (myPeerId && wsRef.current && isWsConnectedRef.current) {
      wsRef.current.send(
        JSON.stringify({ event: 'register', data: { peerId: myPeerId } })
      )
    }
  }, [myPeerId])

  useEffect(() => {
    if (hasBackend === true) {
      refreshChannels()
    } else {
      setChannels(MOCK_CHANNELS)
    }
  }, [hasBackend])

  useEffect(() => {
    if (activeChannel) {
      if (hasBackend === true) {
        API.getChannelMessages(activeChannel.name)
          .then(setChannelMessages)
          .catch(() => setChannelMessages([]))
        API.getChannelPeers(activeChannel.name)
          .then(setChannelPeers)
          .catch(() => setChannelPeers([]))
      } else {
        setChannelMessages(MOCK_MESSAGES)
        setChannelPeers([])
      }
    }
  }, [activeChannel, hasBackend])

  useEffect(() => {
    const channelParam = new URLSearchParams(window.location.search).get(
      'channel'
    )
    if (channelParam && channels.length > 0) {
      const found = channels.find(c => c.name === channelParam)
      if (found && activeChannel?.name !== found.name) {
        handleOpenChannel(found)
      }
    }
  }, [channels])

  useEffect(() => {
    if (!activeChannel && channels.length > 0) {
      const channelParam = new URLSearchParams(window.location.search).get(
        'channel'
      )
      if (channelParam) {
        const found = channels.find(c => c.name === channelParam)
        if (found) {
          handleOpenChannel(found)
        }
      }
    }
  }, [activeChannel, channels])

  async function syncChannelMessages(channelName) {
    if (hasBackend !== true) return
    try {
      const messages = await API.getChannelMessages(channelName)
      setChannelMessages(prev => {
        const newMsgs = messages.filter(m => {
          const id = m.id || `${m.author}-${m.timestamp}`
          return !prev.some(p => (p.id || `${p.author}-${p.timestamp}`) === id)
        })
        if (newMsgs.length === 0) return prev
        return [...prev, ...newMsgs]
      })
      const peers = await API.getChannelPeers(channelName)
      setChannelPeers(peers)
    } catch {
      setChannelPeers([])
    }
  }

  function refreshChannels() {
    API.getChannels()
      .then(setChannels)
      .catch(() => setChannels([]))
  }

  function wsSend(event, data) {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event, data }))
    }
  }

  function subscribeToChannel(channelName) {
    if (!myPeerId) {
      pendingSubscriptionRef.current = channelName
      return
    }
    wsSend('channel:subscribe', { channel: channelName })
  }

  function unsubscribeFromChannel(channelName) {
    wsSend('channel:unsubscribe', { channel: channelName })
  }

  function handleWsEvent(event, data) {
    const currentChannel = activeChannelRef.current
    switch (event) {
      case 'channel:message':
        if (currentChannel && data.channel === currentChannel.name) {
          setChannelMessages(prev => {
            const messageId =
              data.message.id ||
              `${data.message.author}-${data.message.timestamp}`
            const pendingIdx = prev.findIndex(
              m =>
                m.pending &&
                m.content === data.message.content &&
                m.author === data.message.author
            )
            if (pendingIdx !== -1) {
              const updated = [...prev]
              updated[pendingIdx] = { ...data.message, id: messageId }
              return updated
            }
            const exists = prev.some(
              m =>
                m.id === messageId ||
                (m.timestamp === data.message.timestamp &&
                  m.content === data.message.content &&
                  m.author === data.message.author)
            )
            if (exists) return prev
            return [...prev, { ...data.message, id: messageId }]
          })
          API.getChannelPeers(currentChannel.name)
            .then(setChannelPeers)
            .catch(err => {
              console.warn('[Chat] Failed to fetch peers:', err.message)
            })
        }
        break

      case 'channel:peer:online':
      case 'channel:peer:offline':
        if (currentChannel) {
          API.getChannelPeers(currentChannel.name)
            .then(setChannelPeers)
            .catch(err => {
              console.warn(
                '[Chat] Failed to fetch peers on event:',
                err.message
              )
            })
        }
        break

      case 'channel:joined':
      case 'channel:left':
        refreshChannels()
        break
    }
  }

  async function handleOpenChannel(channel) {
    if (activeChannelRef.current) {
      unsubscribeFromChannel(activeChannelRef.current.name)
    }
    setActiveChannel(channel)
    subscribeToChannel(channel.name)
    window.history.pushState(
      {},
      '',
      `?channel=${encodeURIComponent(channel.name)}`
    )
    try {
      if (hasBackend === true) {
        const messages = await API.getChannelMessages(channel.name)
        setChannelMessages(messages)
        const peers = await API.getChannelPeers(channel.name)
        setChannelPeers(peers)
      } else {
        setChannelMessages(MOCK_MESSAGES)
        setChannelPeers([])
      }
    } catch {
      setChannelMessages([])
      setChannelPeers([])
    }
  }

  async function handleLeaveChannel(name, e) {
    if (e) e.stopPropagation()
    if (isLeavingChannel) return
    setIsLeavingChannel(true)
    unsubscribeFromChannel(name)
    try {
      await API.leaveChannel(name)
      if (activeChannel?.name === name) {
        setActiveChannel(null)
        setChannelMessages([])
        setChannelPeers([])
        const url = new URL(window.location.href)
        url.searchParams.delete('channel')
        window.history.pushState({}, '', url.pathname)
      }
      refreshChannels()
      leaveChannelModal.close()
      setChannelToLeave(null)
    } catch (err) {
      setError(err.message)
      setTimeout(() => setError(''), 3000)
    } finally {
      setIsLeavingChannel(false)
    }
  }

  async function handleJoinChannel(channelName) {
    if (!channelName.trim() || isJoiningChannel) return
    setIsJoiningChannel(true)
    try {
      await API.createChannel(channelName.trim(), 'public')
      joinChannelModal.close()
      refreshChannels()
    } catch (err) {
      setError(err.message)
      setTimeout(() => setError(''), 3000)
    } finally {
      setIsJoiningChannel(false)
    }
  }

  function handlePreviewAvatar() {
    if (!loginUsername.trim() || !loginPassword.trim()) {
      setError('请输入用户名和密码')
      setTimeout(() => setError(''), 3000)
      return
    }
    const identity = createLoginIdentity(loginUsername.trim(), loginPassword)
    setLoginPreviewAvatar(generateAvatar(identity.address))
    setLoginPreviewAddress(identity.address)
    setHasPreviewedAvatar(true)
  }

  function handleLoginUsernameChange(e) {
    setLoginUsername(e.target.value)
    setHasPreviewedAvatar(false)
    setLoginPreviewAvatar(null)
    setLoginPreviewAddress('')
  }

  function handleLoginPasswordChange(e) {
    setLoginPassword(e.target.value)
    setHasPreviewedAvatar(false)
    setLoginPreviewAvatar(null)
    setLoginPreviewAddress('')
  }

  function handleLogin() {
    if (!loginUsername.trim() || !loginPassword.trim()) {
      setError('请输入用户名和密码')
      setTimeout(() => setError(''), 3000)
      return
    }
    if (!hasPreviewedAvatar) {
      setError('请先预览并确认头像')
      setTimeout(() => setError(''), 3000)
      return
    }
    const identity = createLoginIdentity(loginUsername.trim(), loginPassword)
    if (userIdentity && userIdentity.username === '匿名') {
      saveGuestIdentity(userIdentity)
    }
    saveIdentity(identity)
    setUserIdentity(identity)
    loginModal.close()
    setLoginUsername('')
    setLoginPassword('')
    setHasPreviewedAvatar(false)
  }

  function handleLogout() {
    let guestIdentity = loadGuestIdentity()
    if (!guestIdentity) {
      guestIdentity = createGuestIdentity(generateGuestPassword())
    }
    saveIdentity(guestIdentity)
    setUserIdentity(guestIdentity)
  }

  async function handleSendChannelMessage() {
    if (!channelInput.trim() || !activeChannel || !userIdentity) return
    const content = channelInput.trim()
    setChannelInput('')

    const optimisticId = `${userIdentity.address}-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const optimisticMsg = {
      id: optimisticId,
      author: userIdentity.address,
      authorName: userIdentity.displayName,
      content,
      timestamp: Date.now(),
      pending: true,
    }
    setChannelMessages(prev => [...prev, optimisticMsg])

    try {
      const result = await API.sendChannelMessage(
        activeChannel.name,
        content,
        userIdentity.address,
        userIdentity.displayName
      )
      setChannelMessages(prev =>
        prev.map(m =>
          m.id === optimisticId
            ? {
                ...result.message,
                id: result.message.id || result.message.timestamp,
              }
            : m
        )
      )
    } catch (err) {
      setChannelMessages(prev => prev.filter(m => m.id !== optimisticId))
      setError(err.message)
      setTimeout(() => setError(''), 3000)
    }
  }

  const chatHeaderTitle = activeChannel ? (
    <h2 className="header-title">{activeChannel.name}</h2>
  ) : (
    <h2 className="header-title">聊天</h2>
  )

  return (
    <AppShell
      sidebar={({ closeSidebar }) => (
        <>
          <div
            className="sidebar-header"
            onClick={() => (window.location.href = '/')}
            style={{ cursor: 'pointer' }}
          >
            <h1>MOST PEOPLE</h1>
          </div>

          <nav className="sidebar-nav">
            {channels.length === 0 ? (
              <div
                style={{
                  padding: '40px 20px',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                }}
              >
                <p>暂无频道</p>
              </div>
            ) : (
              channels.map(channel => (
                <div
                  key={channel.name}
                  className={`sidebar-nav-btn ${activeChannel?.name === channel.name ? 'active' : ''}`}
                  onClick={() => {
                    handleOpenChannel(channel)
                    closeSidebar()
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      handleOpenChannel(channel)
                      closeSidebar()
                    }
                  }}
                >
                  <MessageSquare size={16} />
                  <span>{channel.name}</span>
                  <button
                    className="leave-channel-btn"
                    onClick={e => {
                      e.stopPropagation()
                      setChannelToLeave(channel)
                      leaveChannelModal.open()
                    }}
                    title="退出频道"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))
            )}
          </nav>

          <button
            className="create-channel-btn"
            onClick={() => joinChannelModal.open()}
          >
            <Plus size={16} />
            加入频道
          </button>

          <div className="chat-sidebar-footer">
            <div className="user-info">
              <img
                className="user-avatar-img"
                src={generateAvatar(userIdentity?.address)}
                alt="avatar"
              />
              <span className="user-name" title={userIdentity?.address}>
                {userIdentity?.displayName || '加载中...'}
              </span>
            </div>
            {userIdentity && userIdentity.username === '匿名' ? (
              <button
                className="btn btn-primary login-btn"
                onClick={() => loginModal.open()}
              >
                登录
              </button>
            ) : (
              <button
                className="btn btn-ghost logout-btn"
                onClick={handleLogout}
              >
                退出
              </button>
            )}
          </div>
        </>
      )}
      headerTitle={chatHeaderTitle}
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
      {hasBackend === false && (
        <div className="download-banner">
          <span>Web 端仅用于界面展示，下载桌面客户端获得完整功能</span>
          <Link href="/download" className="download-banner-btn">
            <Download size={14} />
            下载客户端
            <ArrowRight size={12} />
          </Link>
        </div>
      )}

      {activeChannel ? (
        <>
          <div className="chat-messages">
            {channelMessages.length === 0 ? (
              <div className="chat-messages-empty">
                <div className="empty-icon">
                  <MessageSquare size={28} />
                </div>
                <p>暂无消息，开始聊天吧！</p>
              </div>
            ) : (
              channelMessages.map(msg => (
                <div
                  key={msg.id || `${msg.author}-${msg.timestamp}`}
                  className={`chat-message ${msg.author === userIdentity?.address ? 'self' : 'other'} ${msg.pending ? 'pending' : ''}`}
                >
                  <img
                    className="msg-avatar"
                    src={generateAvatar(msg.author)}
                    alt="avatar"
                  />
                  <div className="msg-content">
                    <span className="message-author">
                      {msg.authorName || msg.author?.slice(0, 8) || 'Unknown'}
                    </span>
                    <div className="message-bubble">{msg.content}</div>
                    <span className="message-time">
                      {new Date(msg.timestamp).toLocaleTimeString('zh-CN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              ))
            )}
            <div ref={channelMessagesEndRef} />
          </div>

          <div className="chat-input-area">
            <input
              type="text"
              className="chat-input"
              placeholder="输入消息..."
              value={channelInput}
              onChange={e => setChannelInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && channelInput.trim())
                  handleSendChannelMessage()
              }}
            />
            <button
              className="send-btn"
              onClick={handleSendChannelMessage}
              disabled={!channelInput.trim()}
            >
              <Send size={18} />
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="chat-welcome">
            <div className="welcome-icon">
              <MessageSquare size={36} />
            </div>
            <h2>选择频道</h2>
            <p>从左侧边栏选择一个频道开始聊天，或创建一个新频道</p>
          </div>
        </>
      )}

      {showJoinChannel && (
        <InputModal
          title="加入频道"
          placeholder="频道名"
          confirmText="加入"
          onConfirm={handleJoinChannel}
          onClose={() => joinChannelModal.close()}
          isLoading={isJoiningChannel}
          loadingText="加入中..."
        />
      )}

      {showLeaveChannelConfirm && channelToLeave && (
        <ConfirmModal
          title="退出频道"
          message={`确定要退出频道 "${channelToLeave.name}" 吗？`}
          confirmText={isLeavingChannel ? '退出中...' : '退出'}
          onConfirm={() => handleLeaveChannel(channelToLeave.name, undefined)}
          onClose={() => {
            leaveChannelModal.close()
            setChannelToLeave(null)
          }}
          danger
        />
      )}

      {showLogin && (
        <div className="login-modal-overlay">
          <div className="login-modal">
            <div className="login-modal-header">
              <h3>登录</h3>
              <button
                className="login-modal-close"
                onClick={() => loginModal.close()}
              >
                <X size={18} />
              </button>
            </div>
            <div className="login-modal-body">
              <img
                className="login-avatar-preview"
                src={loginPreviewAvatar || '/pwa-512x512.png'}
                alt="avatar"
              />
              <p className="login-tip">
                {loginPreviewAddress
                  ? `${loginPreviewAddress.slice(0, 6)}...${loginPreviewAddress.slice(-4)}`
                  : 'Most People'}
              </p>
              <input
                type="text"
                className="login-input"
                placeholder="用户名"
                value={loginUsername}
                onChange={handleLoginUsernameChange}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleLogin()
                }}
                autoFocus
              />
              <div className="login-password-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="login-input"
                  placeholder="密码"
                  value={loginPassword}
                  onChange={handleLoginPasswordChange}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleLogin()
                  }}
                />
                <button
                  className="login-password-toggle"
                  type="button"
                  onClick={() => togglePassword()}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <div className="login-buttons-row">
                <button
                  className="btn btn-secondary"
                  onClick={handlePreviewAvatar}
                  disabled={hasPreviewedAvatar}
                >
                  {hasPreviewedAvatar ? '已预览' : '预览头像'}
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleLogin}
                  disabled={isLoggingIn || !hasPreviewedAvatar}
                >
                  {isLoggingIn ? '登录中...' : '登录'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {error && <div className="chat-toast">{error}</div>}
    </AppShell>
  )
}

export default ChatPage
