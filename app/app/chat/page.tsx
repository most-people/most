'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useMediaQuery } from '@mantine/hooks'
import {
  MessageSquare,
  Send,
  Plus,
  ArrowLeft,
  Sun,
  Moon,
  X,
  Menu,
  Eye,
  EyeOff,
  Settings,
} from 'lucide-react'
import { InputModal, ConfirmModal } from '../../../components/ui'
import { api } from '../../../src/utils/api'
import {
  loadIdentity,
  saveIdentity,
  saveGuestIdentity,
  loadGuestIdentity,
  createGuestIdentity,
  createLoginIdentity,
  generateGuestPassword,
} from '../../../src/utils/userIdentity.js'
import { generateAvatar } from '../../../src/utils/avatar.js'
import { useApp } from '../AppProvider'
import { useDisclosure, useToggle } from '../../../hooks'

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

function ChatPage() {
  const { isDarkMode, setIsDarkMode, showBackendWarning, openSettings } =
    useApp()
  const [channels, setChannels] = useState([])
  const [activeChannel, setActiveChannel] = useState(null)
  const [channelMessages, setChannelMessages] = useState([])
  const [channelPeers, setChannelPeers] = useState([])
  const [channelInput, setChannelInput] = useState('')
  const [showJoinChannel, joinChannelModal] = useDisclosure(false)
  const [myPeerId, setMyPeerId] = useState('')
  const [error, setError] = useState('')
  const [isSidebarOpen, sidebar] = useDisclosure(false)
  const [isSidebarCollapsed, toggleSidebarCollapsed] = useToggle()
  const isMobile = useMediaQuery('(max-width: 768px)')
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
  const [isLoggingIn, setIsLoggingIn] = useState(false)

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
      .catch(() => {})
  }, [])

  useEffect(() => {
    let identity = loadIdentity()
    if (!identity) {
      identity = createGuestIdentity(generateGuestPassword())
      saveIdentity(identity)
    }
    setUserIdentity(identity)
  }, [])

  useEffect(() => {
    if (loginUsername.trim() && loginPassword.trim()) {
      const identity = createLoginIdentity(loginUsername.trim(), loginPassword)
      setLoginPreviewAvatar(generateAvatar(identity.address))
    } else {
      setLoginPreviewAvatar(null)
    }
  }, [loginUsername, loginPassword])

  const pendingSubscriptionRef = useRef(null)

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
        } catch {}
      }

      ws.onclose = () => {
        isWsConnectedRef.current = false
        reconnectTimeoutRef.current = setTimeout(connectWs, 3000)
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
    refreshChannels()
  }, [])

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
    } catch {}
  }

  function refreshChannels() {
    API.getChannels()
      .then(setChannels)
      .catch(() => {})
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
            .catch(() => {})
        }
        break

      case 'channel:peer:online':
      case 'channel:peer:offline':
        if (currentChannel) {
          API.getChannelPeers(currentChannel.name)
            .then(setChannelPeers)
            .catch(() => {})
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
    sidebar.close()
    subscribeToChannel(channel.name)
    window.history.pushState(
      {},
      '',
      `?channel=${encodeURIComponent(channel.name)}`
    )
    try {
      const messages = await API.getChannelMessages(channel.name)
      setChannelMessages(messages)
      const peers = await API.getChannelPeers(channel.name)
      setChannelPeers(peers)
    } catch {
      setError('加载频道失败')
      setTimeout(() => setError(''), 3000)
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

  function handleLogin() {
    if (!loginUsername.trim() || !loginPassword.trim()) {
      setError('请输入用户名和密码')
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

  return (
    <div className="app-layout">
      <div
        className={`sidebar-overlay ${isSidebarOpen ? 'visible' : ''}`}
        onClick={() => sidebar.close()}
      />

      <div
        className={`sidebar ${isSidebarOpen ? 'open' : ''} ${isSidebarCollapsed ? 'collapsed' : ''}`}
      >
        <div className="sidebar-header">
          <button
            className="back-btn"
            onClick={() => (window.location.href = '/app/')}
            title="返回首页"
          >
            <ArrowLeft size={18} />
          </button>
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
                onClick={() => handleOpenChannel(channel)}
                role="button"
                tabIndex={0}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleOpenChannel(channel)
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
            <button className="login-btn" onClick={() => loginModal.open()}>
              登录
            </button>
          ) : (
            <button className="logout-btn" onClick={handleLogout}>
              退出
            </button>
          )}
        </div>
      </div>

      <div className="main-content">
        {activeChannel ? (
          <>
            <header className="app-header">
              {showBackendWarning && (
                <div className="backend-warning-bar">
                  <span>未设置后端地址，请设置后端地址后使用</span>
                  <button onClick={() => openSettings()} aria-label="设置">
                    <Settings size={16} />
                  </button>
                </div>
              )}
              <div className="header-left">
                <button
                  onClick={() => {
                    if (isMobile) {
                      sidebar.open()
                    } else {
                      toggleSidebarCollapsed()
                    }
                  }}
                  className="icon-btn sidebar-toggle-btn"
                  aria-label={
                    isMobile
                      ? '打开菜单'
                      : isSidebarCollapsed
                        ? '展开侧边栏'
                        : '收起侧边栏'
                  }
                >
                  <Menu size={18} />
                </button>
                <h2 className="header-title">{activeChannel.name}</h2>
              </div>
              <div className="header-right">
                <button
                  className="icon-btn"
                  onClick={() => setIsDarkMode(!isDarkMode)}
                  title="切换主题"
                >
                  {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
                </button>
              </div>
            </header>

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
            <header className="app-header">
              {showBackendWarning && (
                <div className="backend-warning-bar">
                  <span>未设置后端地址，请设置后端地址后使用</span>
                  <button onClick={() => openSettings()} aria-label="设置">
                    <Settings size={16} />
                  </button>
                </div>
              )}
              <div className="header-left">
                <button
                  onClick={() => {
                    if (isMobile) {
                      sidebar.open()
                    } else {
                      toggleSidebarCollapsed()
                    }
                  }}
                  className="icon-btn sidebar-toggle-btn"
                  aria-label={
                    isMobile
                      ? '打开菜单'
                      : isSidebarCollapsed
                        ? '展开侧边栏'
                        : '收起侧边栏'
                  }
                >
                  <Menu size={16} />
                </button>
                <h2 className="header-title">聊天</h2>
              </div>
              <div className="header-right">
                <button
                  className="icon-btn"
                  onClick={() => setIsDarkMode(!isDarkMode)}
                  title="切换主题"
                >
                  {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
                </button>
              </div>
            </header>
            <div className="chat-welcome">
              <div className="welcome-icon">
                <MessageSquare size={36} />
              </div>
              <h2>选择频道</h2>
              <p>从左侧边栏选择一个频道开始聊天，或创建一个新频道</p>
            </div>
          </>
        )}
      </div>

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
              <h3>登录 / 注册</h3>
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
              <p className="login-tip">Most People</p>
              <input
                type="text"
                className="login-input"
                placeholder="用户名"
                value={loginUsername}
                onChange={e => setLoginUsername(e.target.value)}
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
                  onChange={e => setLoginPassword(e.target.value)}
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
              <button
                className="login-submit"
                onClick={handleLogin}
                disabled={isLoggingIn}
              >
                {isLoggingIn ? '登录中...' : '登录 / 注册'}
              </button>
            </div>
          </div>
        </div>
      )}

      {error && <div className="chat-toast">{error}</div>}
    </div>
  )
}

export default ChatPage
