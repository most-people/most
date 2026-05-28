'use client'

import React, { useState, useEffect, useRef } from 'react'
import {
  MessageSquare,
  Send,
  Plus,
  Sun,
  Moon,
  X,
  Download,
  ArrowRight,
} from 'lucide-react'
import AppShell from '~/components/AppShell'
import { InputModal, ConfirmModal } from '~/components/ui'
import {
  api,
  getApiErrorMessage,
  getAuthenticatedWebSocketUrl,
} from '~/server/src/utils/api'
import { generateAvatar } from '~/server/src/utils/avatar.js'
import { useAppStore } from '~/app/app/useAppStore'
import { useUserStore } from '~/app/app/userStore'
import { useDisclosure } from '~/hooks'
import Link from 'next/link'
import SidebarAccount from '~/components/SidebarAccount'

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

// Demo data for no-backend marketing preview. Not compatibility code.
const DEMO_CHANNELS: Channel[] = [
  { name: 'general' },
  { name: 'random' },
  { name: 'tech' },
]

const DEMO_MESSAGES: ChannelMessage[] = [
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
  const addToast = useAppStore(s => s.addToast)
  const userIdentity = useUserStore(s => s.identity)
  const [channels, setChannels] = useState([])
  const [activeChannel, setActiveChannel] = useState(null)
  const [channelMessages, setChannelMessages] = useState([])
  const [channelInput, setChannelInput] = useState('')
  const [showJoinChannel, joinChannelModal] = useDisclosure(false)
  const [myPeerId, setMyPeerId] = useState('')
  const [isJoiningChannel, setIsJoiningChannel] = useState(false)
  const [isLeavingChannel, setIsLeavingChannel] = useState(false)
  const [showLeaveChannelConfirm, leaveChannelModal] = useDisclosure(false)
  const [channelToLeave, setChannelToLeave] = useState(null)

  const wsRef = useRef(null)
  const channelMessagesEndRef = useRef(null)
  const activeChannelRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)
  const isWsConnectedRef = useRef(false)
  const isBackendReady = hasBackend === true

  useEffect(() => {
    activeChannelRef.current = activeChannel
  }, [activeChannel])

  useEffect(() => {
    channelMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [channelMessages])

  useEffect(() => {
    if (!isBackendReady) {
      setMyPeerId('')
      return
    }

    api
      .get('/api/node-id')
      .json<{ id: string }>()
      .then(d => setMyPeerId(d.id))
      .catch(err => {
        console.warn('[Chat] Failed to fetch node ID:', err.message)
        void showApiError(err, '无法读取节点 ID')
      })
  }, [isBackendReady])

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
    if (!isBackendReady) return

    async function connectWs() {
      const ws = new WebSocket(await getAuthenticatedWebSocketUrl('/ws'))

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
  }, [isBackendReady])

  useEffect(() => {
    if (myPeerId && wsRef.current && isWsConnectedRef.current) {
      wsRef.current.send(
        JSON.stringify({ event: 'register', data: { peerId: myPeerId } })
      )
    }
  }, [myPeerId])

  useEffect(() => {
    if (isBackendReady) {
      refreshChannels()
    } else if (hasBackend === false) {
      setChannels(DEMO_CHANNELS)
    }
  }, [hasBackend, isBackendReady])

  useEffect(() => {
    if (activeChannel) {
      if (isBackendReady) {
        API.getChannelMessages(activeChannel.name)
          .then(setChannelMessages)
          .catch(err => {
            setChannelMessages([])
            void showApiError(err, '无法读取频道消息')
          })
      } else if (hasBackend === false) {
        setChannelMessages(DEMO_MESSAGES)
      }
    }
  }, [activeChannel, hasBackend, isBackendReady])

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
    if (!isBackendReady) return
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
      await API.getChannelPeers(channelName)
    } catch {}
  }

  async function showApiError(err, fallback) {
    addToast(await getApiErrorMessage(err, fallback), 'error')
  }

  async function refreshChannels() {
    if (!isBackendReady) return
    try {
      const result = await API.getChannels()
      setChannels(result)
    } catch (err) {
      setChannels([])
      await showApiError(err, '无法读取频道列表')
    }
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
          if (isBackendReady) {
            API.getChannelPeers(currentChannel.name).catch(err => {
              console.warn('[Chat] Failed to fetch peers:', err.message)
            })
          }
        }
        break

      case 'channel:peer:online':
      case 'channel:peer:offline':
        if (currentChannel) {
          if (isBackendReady) {
            API.getChannelPeers(currentChannel.name).catch(err => {
              console.warn('[Chat] Failed to fetch peers on event:', err.message)
            })
          }
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
      if (isBackendReady) {
        const messages = await API.getChannelMessages(channel.name)
        setChannelMessages(messages)
        await API.getChannelPeers(channel.name)
      } else {
        setChannelMessages(DEMO_MESSAGES)
      }
    } catch (err) {
      setChannelMessages([])
      await showApiError(err, '打开频道失败')
    }
  }

  async function handleLeaveChannel(name, e) {
    if (e) e.stopPropagation()
    if (!isBackendReady) return
    if (isLeavingChannel) return
    setIsLeavingChannel(true)
    unsubscribeFromChannel(name)
    try {
      await API.leaveChannel(name)
      if (activeChannel?.name === name) {
        setActiveChannel(null)
        setChannelMessages([])
        const url = new URL(window.location.href)
        url.searchParams.delete('channel')
        window.history.pushState({}, '', url.pathname)
      }
      refreshChannels()
      leaveChannelModal.close()
      setChannelToLeave(null)
    } catch (err) {
      await showApiError(err, '退出频道失败')
    } finally {
      setIsLeavingChannel(false)
    }
  }

  async function handleJoinChannel(channelName) {
    if (!channelName.trim() || isJoiningChannel) return
    if (!isBackendReady) return
    setIsJoiningChannel(true)
    try {
      await API.createChannel(channelName.trim(), 'public')
      joinChannelModal.close()
      refreshChannels()
    } catch (err) {
      await showApiError(err, '加入频道失败')
    } finally {
      setIsJoiningChannel(false)
    }
  }

  async function handleSendChannelMessage() {
    if (!channelInput.trim() || !activeChannel || !userIdentity) return
    if (!isBackendReady) return
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
      await showApiError(err, '发送失败')
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
            className="sidebar-header sidebar-header-link"
            onClick={() => (window.location.href = '/')}
          >
            <h1>MOST PEOPLE</h1>
          </div>

          <nav className="sidebar-nav">
            {channels.length === 0 ? (
              <div className="sidebar-empty-state">
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

          <SidebarAccount />
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
              className="input input-pill"
              placeholder={userIdentity ? '输入消息...' : '请先登录后发言'}
              value={channelInput}
              disabled={!userIdentity}
              onChange={e => setChannelInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && channelInput.trim())
                  handleSendChannelMessage()
              }}
            />
            <button
              className="send-btn"
              onClick={handleSendChannelMessage}
              disabled={!userIdentity || !channelInput.trim()}
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
    </AppShell>
  )
}

export default ChatPage
