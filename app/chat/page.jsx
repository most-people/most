'use client'

import React, { useState, useEffect, useRef } from 'react'
import { MessageSquare, X, Send, Plus, Users, ArrowLeft } from 'lucide-react'

const API = {
  async fetch(url, options = {}) {
    const res = await fetch(url, options)
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(err.error || 'Request failed')
    }
    return res.json()
  },
  getChannels: () => API.fetch('/api/channels'),
  createChannel: (name, type) => API.fetch('/api/channels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, type })
  }),
  leaveChannel: (name) => API.fetch(`/api/channels/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  getChannelMessages: (name, limit = 100, offset = 0) => API.fetch(`/api/channels/${encodeURIComponent(name)}/messages?limit=${limit}&offset=${offset}`),
  sendChannelMessage: (name, content) => API.fetch(`/api/channels/${encodeURIComponent(name)}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  }),
  getChannelPeers: (name) => API.fetch(`/api/channels/${encodeURIComponent(name)}/peers`)
}

function ChatPage() {
  const [channels, setChannels] = useState([])
  const [activeChannel, setActiveChannel] = useState(null)
  const [channelMessages, setChannelMessages] = useState([])
  const [channelPeers, setChannelPeers] = useState([])
  const [channelInput, setChannelInput] = useState('')
  const [showCreateChannel, setShowCreateChannel] = useState(false)
  const [newChannelName, setNewChannelName] = useState('')
  const [myPeerId, setMyPeerId] = useState('')
  const [error, setError] = useState('')
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

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
    fetch('/api/peer-id').then(r => r.json()).then(d => setMyPeerId(d.peerId)).catch(() => {})
  }, [])

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
      const ws = new WebSocket(`${protocol}//${location.host}/ws`)

      ws.onopen = () => {
        isWsConnectedRef.current = true
        if (myPeerId && ws.readyState === 1) {
          ws.send(JSON.stringify({ event: 'register', data: { peerId: myPeerId } }))
        }
        if (activeChannelRef.current) {
          subscribeToChannel(activeChannelRef.current.name)
          syncChannelMessages(activeChannelRef.current.name)
        }
      }

      ws.onmessage = (e) => {
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
      wsRef.current.send(JSON.stringify({ event: 'register', data: { peerId: myPeerId } }))
    }
  }, [myPeerId])

  useEffect(() => {
    refreshChannels()
  }, [])

  useEffect(() => {
    const channelParam = new URLSearchParams(window.location.search).get('channel')
    if (channelParam && channels.length > 0) {
      const found = channels.find(c => c.name === channelParam)
      if (found && activeChannel?.name !== found.name) {
        handleOpenChannel(found)
      }
    }
  }, [channels])

  useEffect(() => {
    if (!activeChannel && channels.length > 0) {
      const channelParam = new URLSearchParams(window.location.search).get('channel')
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
    API.getChannels().then(setChannels).catch(() => {})
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
            const messageId = data.message.id || `${data.message.author}-${data.message.timestamp}`
            const pendingIdx = prev.findIndex(m => m.pending && m.content === data.message.content && m.author === data.message.author)
            if (pendingIdx !== -1) {
              const updated = [...prev]
              updated[pendingIdx] = { ...data.message, id: messageId }
              return updated
            }
            const exists = prev.some(m => m.id === messageId || (m.timestamp === data.message.timestamp && m.content === data.message.content && m.author === data.message.author))
            if (exists) return prev
            return [...prev, { ...data.message, id: messageId }]
          })
        }
        break

      case 'channel:peer:online':
      case 'channel:peer:offline':
        if (currentChannel) {
          API.getChannelPeers(currentChannel.name).then(setChannelPeers).catch(() => {})
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
    setIsSidebarOpen(false)
    subscribeToChannel(channel.name)
    window.history.pushState({}, '', `?channel=${encodeURIComponent(channel.name)}`)
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
    } catch (err) {
      setError(err.message)
      setTimeout(() => setError(''), 3000)
    }
  }

  async function handleCreateChannel() {
    if (!newChannelName.trim()) return
    try {
      await API.createChannel(newChannelName.trim())
      setNewChannelName('')
      setShowCreateChannel(false)
      refreshChannels()
    } catch (err) {
      setError(err.message)
      setTimeout(() => setError(''), 3000)
    }
  }

  async function handleSendChannelMessage() {
    if (!channelInput.trim() || !activeChannel) return
    const content = channelInput.trim()
    setChannelInput('')

    const optimisticId = `${myPeerId}-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const optimisticMsg = {
      id: optimisticId,
      author: myPeerId,
      authorName: 'Me',
      content,
      timestamp: Date.now(),
      pending: true
    }
    setChannelMessages(prev => [...prev, optimisticMsg])

    try {
      const result = await API.sendChannelMessage(activeChannel.name, content)
      setChannelMessages(prev => prev.map(m => m.id === optimisticId ? { ...result.message, id: result.message.id || result.message.timestamp } : m))
    } catch (err) {
      setChannelMessages(prev => prev.filter(m => m.id !== optimisticId))
      setError(err.message)
      setTimeout(() => setError(''), 3000)
    }
  }

  return (
    <div className="chat-layout">
      <div className={`chat-sidebar-overlay ${isSidebarOpen ? 'visible' : ''}`} onClick={() => setIsSidebarOpen(false)} />

      <aside className={`chat-sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="chat-sidebar-header">
          <button className="back-btn" onClick={() => window.location.href = '/'} title="返回首页">
            <ArrowLeft size={18} />
          </button>
          <h1>频道</h1>
        </div>

        <nav className="chat-sidebar-nav">
          {channels.length === 0 ? (
            <div className="chat-messages-empty" style={{ padding: '40px 20px' }}>
              <p>暂无频道</p>
            </div>
          ) : (
            channels.map(channel => (
              <div
                key={channel.name}
                className={`chat-channel-btn ${activeChannel?.name === channel.name ? 'active' : ''}`}
                onClick={() => handleOpenChannel(channel)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') handleOpenChannel(channel) }}
              >
                <div className="channel-icon">
                  <MessageSquare size={16} />
                </div>
                <div className="channel-info">
                  <div className="channel-name">{channel.name}</div>
                  <div className="channel-meta">
                    {channel.type === 'personal' ? '个人' : '群组'} · {channel.peerCount} 在线
                  </div>
                </div>
                <button
                  className="leave-btn"
                  onClick={(e) => handleLeaveChannel(channel.name, e)}
                  title="离开频道"
                >
                  <X size={14} />
                </button>
              </div>
            ))
          )}
        </nav>

        <button className="create-channel-btn" onClick={() => setShowCreateChannel(true)}>
          <Plus size={16} />
          创建频道
        </button>

        <div className="chat-sidebar-footer">
          <div className="peer-info">
            <div className="peer-dot" />
            <span className="peer-id" title={myPeerId}>{myPeerId ? `${myPeerId.slice(0, 12)}...` : '连接中...'}</span>
          </div>
        </div>
      </aside>

      <main className="chat-main">
        {activeChannel ? (
          <>
            <header className="chat-header">
              <div className="chat-header-icon">
                <MessageSquare size={20} />
              </div>
              <div className="chat-header-info">
                <h2>{activeChannel.name}</h2>
                <div className="chat-header-meta">
                  {channelPeers.length > 0 ? (
                    <span className="online-users">
                      在线: {channelPeers.map(p => p.authorName || p.peerId?.slice(0, 8) || '?').join(', ')}
                    </span>
                  ) : (
                    <span>暂无其他用户</span>
                  )}
                </div>
              </div>
              <div className="header-actions">
                <button className="header-btn" onClick={() => setIsSidebarOpen(true)}>
                  <Users size={18} />
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
                channelMessages.map((msg) => (
                  <div
                    key={msg.id || `${msg.author}-${msg.timestamp}`}
                    className={`chat-message ${msg.author === myPeerId ? 'self' : 'other'} ${msg.pending ? 'pending' : ''}`}
                  >
                    {msg.author !== myPeerId && (
                      <span className="message-author">{msg.authorName || msg.author?.slice(0, 8) || 'Unknown'}</span>
                    )}
                    <div className="message-bubble">{msg.content}</div>
                    <span className="message-time">
                      {new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
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
                onKeyDown={e => { if (e.key === 'Enter' && channelInput.trim()) handleSendChannelMessage() }}
              />
              <button className="send-btn" onClick={handleSendChannelMessage} disabled={!channelInput.trim()}>
                <Send size={18} />
              </button>
            </div>
          </>
        ) : (
          <div className="chat-welcome">
            <div className="welcome-icon">
              <MessageSquare size={36} />
            </div>
            <h2>选择频道</h2>
            <p>从左侧边栏选择一个频道开始聊天，或创建一个新频道</p>
          </div>
        )}
      </main>

      {showCreateChannel && (
        <div className="chat-modal-overlay" onClick={() => setShowCreateChannel(false)}>
          <div className="chat-modal" onClick={e => e.stopPropagation()}>
            <h3>创建频道</h3>
            <p>创建一个频道，朋友加入后可以聊天</p>
            <input
              type="text"
              className="modal-input"
              placeholder="频道名，如 alice 或 team-project"
              value={newChannelName}
              onChange={e => setNewChannelName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && newChannelName.trim()) handleCreateChannel() }}
              autoFocus
            />
            <div className="modal-hint">3-20位，字母、数字、下划线、连字符</div>
            <div className="modal-actions">
              <button className="btn secondary" onClick={() => setShowCreateChannel(false)}>取消</button>
              <button className="btn primary" onClick={handleCreateChannel} disabled={!newChannelName.trim()}>创建</button>
            </div>
          </div>
        </div>
      )}

      {error && <div className="chat-toast">{error}</div>}
    </div>
  )
}

export default ChatPage
