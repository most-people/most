'use client'

import React, { useState, useEffect, useRef } from 'react'
import { MessageSquare, X, Send, Plus, Users, Phone } from 'lucide-react'

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
  const [newChannelType, setNewChannelType] = useState('personal')
  const [myPeerId, setMyPeerId] = useState('')
  const [error, setError] = useState('')

  const wsRef = useRef(null)
  const channelMessagesEndRef = useRef(null)

  useEffect(() => {
    channelMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [channelMessages])

  useEffect(() => {
    fetch('/api/peer-id').then(r => r.json()).then(d => setMyPeerId(d.peerId)).catch(() => {})
  }, [])

  useEffect(() => {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${location.host}/ws`)

    ws.onopen = () => {
      if (myPeerId && ws.readyState === 1) {
        ws.send(JSON.stringify({ event: 'register', data: { peerId: myPeerId } }))
      }
    }

    ws.onmessage = (e) => {
      try {
        const { event, data } = JSON.parse(e.data)
        handleWsEvent(event, data)
      } catch {}
    }

    ws.onclose = () => {}
    wsRef.current = ws

    return () => { ws.close() }
  }, [myPeerId])

  useEffect(() => {
    refreshChannels()
  }, [])

  function refreshChannels() {
    API.getChannels().then(setChannels).catch(() => {})
  }

  function handleWsEvent(event, data) {
    switch (event) {
      case 'channel:message':
        if (activeChannel && data.channel === activeChannel.name) {
          setChannelMessages(prev => {
            const exists = prev.some(m => m.timestamp === data.message.timestamp && m.content === data.message.content && m.author === data.message.author)
            if (exists) return prev
            return [...prev, data.message]
          })
        }
        break

      case 'channel:peer:online':
      case 'channel:peer:offline':
        if (activeChannel) {
          API.getChannelPeers(activeChannel.name).then(setChannelPeers).catch(() => {})
        }
        break

      case 'channel:joined':
      case 'channel:left':
        refreshChannels()
        break
    }
  }

  async function handleOpenChannel(channel) {
    setActiveChannel(channel)
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

  async function handleLeaveChannel(name) {
    try {
      await API.leaveChannel(name)
      if (activeChannel?.name === name) {
        setActiveChannel(null)
        setChannelMessages([])
        setChannelPeers([])
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
      await API.createChannel(newChannelName.trim(), newChannelType)
      setNewChannelName('')
      setNewChannelType('personal')
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
    try {
      await API.sendChannelMessage(activeChannel.name, content)
    } catch (err) {
      setError(err.message)
      setTimeout(() => setError(''), 3000)
    }
  }

  function handleBackToChannels() {
    setActiveChannel(null)
    setChannelMessages([])
    setChannelPeers([])
  }

  function handleStartCall() {
    if (!activeChannel) return
    window.location.href = `/call?channel=${encodeURIComponent(activeChannel.name)}`
  }

  if (activeChannel) {
    return (
      <div className="chat-page">
        <header className="chat-header">
          <button className="chat-back-btn" onClick={handleBackToChannels} aria-label="返回频道列表">
            <MessageSquare size={18} />
          </button>
          <h1>{activeChannel.name}</h1>
          <div className="chat-spacer" />
          <div className="chat-peer-count">
            <Users size={12} /> {channelPeers.length}
          </div>
          <button className="chat-call-btn" onClick={handleStartCall} title="发起通话">
            <Phone size={16} />
          </button>
        </header>

        <div className="chat-channel-view">
          <div className="chat-channel-messages">
            {channelMessages.length === 0 ? (
              <div className="chat-channel-empty">暂无消息，开始聊天吧！</div>
            ) : (
              channelMessages.map((msg, i) => (
                <div key={i} className={`chat-channel-msg ${msg.author === myPeerId ? 'self' : 'other'}`}>
                  {msg.author !== myPeerId && <span className="chat-channel-msg-author">{msg.authorName || msg.author.slice(0, 8)}</span>}
                  <div className="chat-channel-msg-bubble">{msg.content}</div>
                  <span className="chat-channel-msg-time">{new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))
            )}
            <div ref={channelMessagesEndRef} />
          </div>

          <div className="chat-channel-input-area">
            <input
              type="text"
              className="chat-channel-input"
              placeholder="输入消息..."
              value={channelInput}
              onChange={e => setChannelInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && channelInput.trim()) handleSendChannelMessage() }}
            />
            <button className="chat-channel-send-btn" onClick={handleSendChannelMessage} disabled={!channelInput.trim()}>
              <Send size={18} />
            </button>
          </div>
        </div>

        {error && <div className="chat-error toast">{error}</div>}
      </div>
    )
  }

  return (
    <div className="chat-page">
      <header className="chat-header">
        <button className="chat-back-btn" onClick={() => window.location.href = '/'} aria-label="返回">
          <MessageSquare size={18} />
        </button>
        <h1>频道</h1>
        <div className="chat-spacer" />
        <button className="chat-create-channel-btn" onClick={() => setShowCreateChannel(true)}>
          <Plus size={16} />
        </button>
      </header>

      <div className="chat-channels-list">
        {channels.length === 0 ? (
          <div className="chat-channels-empty">
            <MessageSquare size={32} />
            <p>暂无频道</p>
          </div>
        ) : (
          channels.map(channel => (
            <div key={channel.name} className="chat-channel-item" onClick={() => handleOpenChannel(channel)}>
              <div className="chat-channel-item-icon">
                <MessageSquare size={18} />
              </div>
              <div className="chat-channel-item-info">
                <div className="chat-channel-item-name">{channel.name}</div>
                <div className="chat-channel-item-meta">
                  <span>{channel.type === 'personal' ? '个人' : '群组'}</span>
                  <span>·</span>
                  <span>{channel.peerCount} 在线</span>
                </div>
              </div>
              <button
                className="chat-channel-item-leave"
                onClick={e => { e.stopPropagation(); handleLeaveChannel(channel.name) }}
                title="离开频道"
              >
                <X size={14} />
              </button>
            </div>
          ))
        )}
      </div>

      {showCreateChannel && (
        <div className="chat-create-channel-overlay" onClick={() => setShowCreateChannel(false)}>
          <div className="chat-create-channel-modal" onClick={e => e.stopPropagation()}>
            <h3>创建频道</h3>
            <p>创建一个频道，朋友加入后可以聊天</p>
            <input
              type="text"
              className="chat-create-channel-input"
              placeholder="频道名，如 alice 或 team-project"
              value={newChannelName}
              onChange={e => setNewChannelName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && newChannelName.trim()) handleCreateChannel() }}
              autoFocus
            />
            <div className="chat-channel-type-selector">
              <button
                className={`chat-channel-type-btn ${newChannelType === 'personal' ? 'active' : ''}`}
                onClick={() => setNewChannelType('personal')}
              >
                个人
              </button>
              <button
                className={`chat-channel-type-btn ${newChannelType === 'group' ? 'active' : ''}`}
                onClick={() => setNewChannelType('group')}
              >
                群组
              </button>
            </div>
            <div className="chat-create-channel-hint">3-20位，字母、数字、下划线、连字符</div>
            <div className="chat-create-channel-actions">
              <button className="chat-create-channel-cancel" onClick={() => setShowCreateChannel(false)}>取消</button>
              <button className="chat-create-channel-submit" onClick={handleCreateChannel} disabled={!newChannelName.trim()}>创建</button>
            </div>
          </div>
        </div>
      )}

      {error && <div className="chat-error toast">{error}</div>}
    </div>
  )
}

export default ChatPage
