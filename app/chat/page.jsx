'use client'

import React, { useState, useRef, useEffect } from 'react'
import Peer from 'simple-peer/simplepeer.min.js'
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff, MessageSquare, X, Send, Monitor, MonitorOff, ArrowLeft, Copy, Check, Users, Plus } from 'lucide-react'

const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

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
  const [activeTab, setActiveTab] = useState('call')

  const [peerId, setPeerId] = useState('')
  const [callState, setCallState] = useState('idle')
  const [incomingCall, setIncomingCall] = useState(null)
  const [activeCall, setActiveCall] = useState(null)
  const [callDuration, setCallDuration] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  const [isCameraOff, setIsCameraOff] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [chatMessages, setChatMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [targetPeerId, setTargetPeerId] = useState('')
  const [callType, setCallType] = useState('video')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const [channels, setChannels] = useState([])
  const [activeChannel, setActiveChannel] = useState(null)
  const [channelMessages, setChannelMessages] = useState([])
  const [channelPeers, setChannelPeers] = useState([])
  const [channelInput, setChannelInput] = useState('')
  const [showCreateChannel, setShowCreateChannel] = useState(false)
  const [newChannelName, setNewChannelName] = useState('')
  const [newChannelType, setNewChannelType] = useState('personal')

  const wsRef = useRef(null)
  const peerRef = useRef(null)
  const localStreamRef = useRef(null)
  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const callTimerRef = useRef(null)
  const chatEndRef = useRef(null)
  const screenStreamRef = useRef(null)
  const activeCallRef = useRef(null)
  const channelMessagesEndRef = useRef(null)

  useEffect(() => {
    activeCallRef.current = activeCall
  }, [activeCall])

  useEffect(() => {
    channelMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [channelMessages])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  useEffect(() => {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${location.host}/ws`)

    ws.onopen = () => {
      console.log('[Call] WS connected')
    }

    ws.onmessage = (e) => {
      try {
        const { event, data } = JSON.parse(e.data)
        handleWsEvent(event, data)
      } catch {}
    }

    ws.onclose = () => {
      console.log('[Call] WS disconnected')
    }

    wsRef.current = ws

    return () => {
      ws.close()
    }
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const peerIdFromUrl = params.get('peerId')
    const typeFromUrl = params.get('type')
    if (peerIdFromUrl) {
      setTargetPeerId(peerIdFromUrl)
    }
    if (typeFromUrl === 'audio' || typeFromUrl === 'video') {
      setCallType(typeFromUrl)
    }
  }, [])

  useEffect(() => {
    fetch('/api/peer-id')
      .then(r => r.json())
      .then(d => {
        setPeerId(d.peerId)
        if (wsRef.current && wsRef.current.readyState === 1) {
          wsRef.current.send(JSON.stringify({ event: 'register', data: { peerId: d.peerId } }))
        }
      })
      .catch(() => setError('Failed to get peer ID'))
  }, [])

  useEffect(() => {
    if (callState === 'connected') {
      setCallDuration(0)
      callTimerRef.current = setInterval(() => {
        setCallDuration(d => d + 1)
      }, 1000)
    } else {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current)
        callTimerRef.current = null
      }
    }
    return () => {
      if (callTimerRef.current) clearInterval(callTimerRef.current)
    }
  }, [callState])

  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current
    }
  }, [callState, isCameraOff])

  useEffect(() => {
    refreshChannels()
  }, [])

  function refreshChannels() {
    API.getChannels().then(setChannels).catch(() => { })
  }

  function handleWsEvent(event, data) {
    switch (event) {
      case 'call:incoming':
        setIncomingCall(data)
        setCallState('incoming')
        break

      case 'call:accepted':
        setCallState('connecting')
        break

      case 'call:rejected':
        setCallState('ended')
        setError('对方拒绝了通话')
        setTimeout(() => { setCallState('idle'); setError('') }, 3000)
        break

      case 'call:ended':
        setCallState('ended')
        setError(data.reason === 'remote_hangup' ? '对方已挂断' : '对方已断开')
        cleanupCall()
        setTimeout(() => { setCallState('idle'); setError('') }, 3000)
        break

      case 'call:started':
        if (data.error) {
          setError(getCallError(data.error))
          setCallState('idle')
        } else {
          startOutgoingCall(data.callId)
        }
        break

      case 'signal':
        if (peerRef.current && data.signalData) {
          try { peerRef.current.signal(data.signalData) } catch {}
        }
        break

      case 'call:chat':
        setChatMessages(prev => [...prev, { id: Date.now(), from: data.from, text: data.message, ts: new Date(), self: false }])
        break

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
          API.getChannelPeers(activeChannel.name).then(setChannelPeers).catch(() => { })
        }
        break

      case 'channel:joined':
      case 'channel:left':
        refreshChannels()
        break
    }
  }

  function getCallError(code) {
    const map = {
      not_registered: '未注册，请刷新页面',
      cannot_call_self: '不能呼叫自己',
      peer_not_found: '对方不在线',
    }
    return map[code] || '未知错误'
  }

  async function getLocalStream(video = true) {
    const constraints = {
      audio: true,
      video: video ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false
    }
    try {
      return await navigator.mediaDevices.getUserMedia(constraints)
    } catch {
      if (video) {
        return await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      }
      throw new Error('无法获取媒体权限')
    }
  }

  function createPeer(initiator, stream) {
    const peer = new Peer({
      initiator,
      stream,
      trickle: true,
      config: ICE_CONFIG,
    })

    peer.on('signal', (signalData) => {
      if (wsRef.current && wsRef.current.readyState === 1) {
        const cid = activeCallRef.current?.callId
        if (cid) {
          wsRef.current.send(JSON.stringify({ event: 'signal', data: { callId: cid, signalData } }))
        }
      }
    })

    peer.on('stream', (remoteStream) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream
      }
    })

    peer.on('connect', () => {
      setCallState('connected')
    })

    peer.on('data', (data) => {
      try {
        const msg = JSON.parse(data.toString())
        if (msg.type === 'chat') {
          setChatMessages(prev => [...prev, { id: Date.now(), from: 'peer', text: msg.text, ts: new Date(), self: false }])
        }
      } catch {}
    })

    peer.on('close', () => {
      setCallState('ended')
      setError('连接已断开')
      cleanupCall()
      setTimeout(() => { setCallState('idle'); setError('') }, 3000)
    })

    peer.on('error', (err) => {
      console.error('[Peer Error]', err)
      setCallState('ended')
      setError('连接出错: ' + err.message)
      cleanupCall()
      setTimeout(() => { setCallState('idle'); setError('') }, 3000)
    })

    peerRef.current = peer
    return peer
  }

  async function startOutgoingCall(callId) {
    try {
      setCallState('connecting')
      setActiveCall({ callId, peerId: targetPeerId, type: callType })
      setChatMessages([])

      const stream = await getLocalStream(callType === 'video')
      localStreamRef.current = stream
      setIsCameraOff(callType !== 'video')

      createPeer(true, stream)
    } catch (err) {
      setError(err.message)
      setCallState('idle')
    }
  }

  async function handleStartCall() {
    if (!targetPeerId.trim()) {
      setError('请输入对方 Peer ID')
      return
    }
    if (!peerId) {
      setError('未获取到本机 Peer ID')
      return
    }

    setError('')
    if (wsRef.current && wsRef.current.readyState === 1) {
      wsRef.current.send(JSON.stringify({
        event: 'call:start',
        data: { targetPeerId: targetPeerId.trim(), type: callType }
      }))
    }
  }

  async function handleAcceptCall() {
    if (!incomingCall) return
    try {
      setCallState('connecting')
      setActiveCall({ callId: incomingCall.callId, peerId: incomingCall.callerId, type: incomingCall.type })
      setChatMessages([])

      const stream = await getLocalStream(incomingCall.type === 'video')
      localStreamRef.current = stream
      setIsCameraOff(incomingCall.type !== 'video')

      createPeer(false, stream)

      if (wsRef.current && wsRef.current.readyState === 1) {
        wsRef.current.send(JSON.stringify({ event: 'call:accept', data: { callId: incomingCall.callId } }))
      }

      setIncomingCall(null)
    } catch (err) {
      setError(err.message)
      setCallState('idle')
      setIncomingCall(null)
    }
  }

  function handleRejectCall() {
    if (!incomingCall) return
    if (wsRef.current && wsRef.current.readyState === 1) {
      wsRef.current.send(JSON.stringify({ event: 'call:reject', data: { callId: incomingCall.callId } }))
    }
    setIncomingCall(null)
    setCallState('idle')
  }

  function cleanupCall() {
    if (peerRef.current) {
      try { peerRef.current.destroy() } catch {}
      peerRef.current = null
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop())
      localStreamRef.current = null
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop())
      screenStreamRef.current = null
    }
    setActiveCall(null)
    setIsMuted(false)
    setIsCameraOff(false)
    setIsScreenSharing(false)
  }

  function handleHangup() {
    if (activeCallRef.current && wsRef.current && wsRef.current.readyState === 1) {
      wsRef.current.send(JSON.stringify({ event: 'call:hangup', data: { callId: activeCallRef.current.callId } }))
    }
    cleanupCall()
    setCallState('idle')
  }

  function toggleMute() {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled
        setIsMuted(!audioTrack.enabled)
      }
    }
  }

  function toggleCamera() {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled
        setIsCameraOff(!videoTrack.enabled)
      }
    }
  }

  async function toggleScreenShare() {
    if (!isScreenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true })
        screenStreamRef.current = screenStream

        const videoTrack = screenStream.getVideoTracks()[0]
        const peer = peerRef.current
        const sender = peer._pc.getSenders().find(s => s.track?.kind === 'video')
        if (sender) {
          sender.replaceTrack(videoTrack)
        }

        videoTrack.onended = () => {
          stopScreenShare()
        }

        setIsScreenSharing(true)
      } catch {}
    } else {
      stopScreenShare()
    }
  }

  function stopScreenShare() {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop())
      screenStreamRef.current = null
    }

    const videoTrack = localStreamRef.current?.getVideoTracks()[0]
    if (videoTrack) {
      const peer = peerRef.current
      const sender = peer._pc.getSenders().find(s => s.track?.kind === 'video')
      if (sender) {
        sender.replaceTrack(videoTrack)
      }
    }

    setIsScreenSharing(false)
  }

  function sendChatMessage() {
    if (!newMessage.trim() || !activeCallRef.current) return

    const msg = { id: Date.now(), from: 'self', text: newMessage.trim(), ts: new Date(), self: true }
    setChatMessages(prev => [...prev, msg])

    if (peerRef.current && peerRef.current.connected) {
      try {
        peerRef.current.send(JSON.stringify({ type: 'chat', text: newMessage.trim() }))
      } catch {}
    }

    if (wsRef.current && wsRef.current.readyState === 1) {
      wsRef.current.send(JSON.stringify({ event: 'call:chat', data: { callId: activeCallRef.current.callId, message: newMessage.trim() } }))
    }

    setNewMessage('')
  }

  function goBack() {
    window.location.href = '/'
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

  function renderTabNav() {
    return (
      <div className="chat-tab-nav">
        <button
          className={`chat-tab-btn ${activeTab === 'call' ? 'active' : ''}`}
          onClick={() => setActiveTab('call')}
        >
          <Phone size={16} />
          <span>通话</span>
        </button>
        <button
          className={`chat-tab-btn ${activeTab === 'channels' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('channels')
            refreshChannels()
          }}
        >
          <MessageSquare size={16} />
          <span>频道</span>
        </button>
      </div>
    )
  }

  if (activeTab === 'call') {
    if (callState === 'idle' || callState === 'ended') {
      return (
        <div className="chat-page">
          <header className="chat-header">
            <button className="chat-back-btn" onClick={goBack} aria-label="返回">
              <ArrowLeft size={20} />
            </button>
            <h1>P2P 通话</h1>
            <div className="chat-spacer" />
            <div className="chat-peer-id-badge">
              ID: {peerId || '加载中...'}
            </div>
          </header>

          {renderTabNav()}

          <div className="chat-dial-container">
            <div className="chat-dial-icon">
              <Phone size={48} />
            </div>

            <p className="chat-dial-description">
              输入对方 Peer ID 发起语音或视频通话
            </p>

            <div className="chat-dial-input-group">
              <input
                type="text"
                className="chat-dial-input"
                placeholder="输入对方 Peer ID"
                value={targetPeerId}
                onChange={e => setTargetPeerId(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleStartCall()}
              />

              <div className="chat-type-selector">
                <button
                  className={`chat-type-btn ${callType === 'audio' ? 'active' : ''}`}
                  onClick={() => setCallType('audio')}
                >
                  <Phone size={18} />
                  <span>语音</span>
                </button>
                <button
                  className={`chat-type-btn ${callType === 'video' ? 'active' : ''}`}
                  onClick={() => setCallType('video')}
                >
                  <Video size={18} />
                  <span>视频</span>
                </button>
              </div>

              <button className="chat-start-btn" onClick={handleStartCall}>
                {callType === 'audio' ? <Phone size={20} /> : <Video size={20} />}
                <span>发起通话</span>
              </button>
            </div>

            {error && <div className="chat-error">{error}</div>}

            <div className="chat-copy-id">
              <button
                className="chat-copy-btn"
                onClick={() => {
                  navigator.clipboard.writeText(peerId)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                }}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? '已复制' : '复制我的 ID'}
              </button>
            </div>
          </div>
        </div>
      )
    }

    if (callState === 'incoming' && incomingCall) {
      return (
        <div className="chat-page">
          <header className="chat-header">
            <button className="chat-back-btn" onClick={handleRejectCall} aria-label="返回">
              <ArrowLeft size={20} />
            </button>
            <h1>来电</h1>
            <div className="chat-spacer" />
          </header>

          {renderTabNav()}

          <div className="chat-incoming-container">
            <div className="chat-incoming-avatar">
              <Phone size={48} />
            </div>
            <h2 className="chat-incoming-caller">{incomingCall.callerName || incomingCall.callerId}</h2>
            <p className="chat-incoming-type">
              {incomingCall.type === 'video' ? '视频通话' : '语音通话'}
            </p>

            <div className="chat-incoming-actions">
              <button className="chat-accept-btn" onClick={handleAcceptCall}>
                <Phone size={24} />
                <span>接听</span>
              </button>
              <button className="chat-reject-btn" onClick={handleRejectCall}>
                <PhoneOff size={24} />
                <span>拒绝</span>
              </button>
            </div>
          </div>
        </div>
      )
    }

    if (callState === 'connecting') {
      return (
        <div className="chat-page">
          <header className="chat-header">
            <button className="chat-back-btn" onClick={handleHangup} aria-label="取消">
              <ArrowLeft size={20} />
            </button>
            <h1>连接中...</h1>
            <div className="chat-spacer" />
          </header>

          {renderTabNav()}

          <div className="chat-connecting-container">
            <div className="chat-connecting-spinner" />
            <p>正在建立 P2P 连接...</p>
            <p className="chat-connecting-peer">对方: {activeCall?.peerId}</p>
            <button className="chat-cancel-btn" onClick={handleHangup}>
              取消
            </button>
          </div>
        </div>
      )
    }

    if (callState === 'connected' && activeCall) {
      return (
        <div className={`chat-page ${showChat ? 'with-chat' : ''}`}>
          {renderTabNav()}
          <div className="chat-active-layout">
            <div className="chat-video-area">
              <video
                ref={remoteVideoRef}
                className="chat-remote-video"
                autoPlay
                playsInline
              />

              {activeCall.type === 'video' && (
                <video
                  ref={localVideoRef}
                  className="chat-local-video"
                  autoPlay
                  playsInline
                  muted
                />
              )}

              {activeCall.type === 'audio' && (
                <div className="chat-audio-display">
                  <div className="chat-audio-avatar">
                    <Phone size={64} />
                  </div>
                  <p className="chat-audio-name">{activeCall.peerId}</p>
                </div>
              )}

              <div className="chat-duration-badge">
                {formatDuration(callDuration)}
              </div>
            </div>

            <div className="chat-controls">
              <button
                className={`chat-control-btn ${isMuted ? 'active' : ''}`}
                onClick={toggleMute}
                title={isMuted ? '取消静音' : '静音'}
              >
                {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
              </button>

              {activeCall.type === 'video' && (
                <button
                  className={`chat-control-btn ${isCameraOff ? 'active' : ''}`}
                  onClick={toggleCamera}
                  title={isCameraOff ? '开启摄像头' : '关闭摄像头'}
                >
                  {isCameraOff ? <VideoOff size={20} /> : <Video size={20} />}
                </button>
              )}

              <button
                className={`chat-control-btn ${isScreenSharing ? 'active' : ''}`}
                onClick={toggleScreenShare}
                title={isScreenSharing ? '停止共享' : '共享屏幕'}
              >
                {isScreenSharing ? <MonitorOff size={20} /> : <Monitor size={20} />}
              </button>

              <button
                className={`chat-control-btn ${showChat ? 'active' : ''}`}
                onClick={() => setShowChat(!showChat)}
                title="文字聊天"
              >
                <MessageSquare size={20} />
              </button>

              <button
                className="chat-control-btn hangup"
                onClick={handleHangup}
                title="挂断"
              >
                <PhoneOff size={24} />
              </button>
            </div>

            {showChat && (
              <div className="chat-chat-panel">
                <div className="chat-chat-header">
                  <h3>文字聊天</h3>
                  <button className="chat-chat-close" onClick={() => setShowChat(false)}>
                    <X size={18} />
                  </button>
                </div>

                <div className="chat-chat-messages">
                  {chatMessages.length === 0 && (
                    <p className="chat-chat-empty">暂无消息</p>
                  )}
                  {chatMessages.map(msg => (
                    <div key={msg.id} className={`chat-chat-msg ${msg.self ? 'self' : ''}`}>
                      {!msg.self && <span className="chat-chat-msg-from">{msg.from}</span>}
                      <div className="chat-chat-msg-bubble">
                        {msg.text}
                      </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>

                <div className="chat-chat-input-area">
                  <input
                    type="text"
                    className="chat-chat-input"
                    placeholder="输入消息..."
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && sendChatMessage()}
                  />
                  <button className="chat-chat-send" onClick={sendChatMessage}>
                    <Send size={18} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )
    }
  }

  if (activeTab === 'channels') {
    if (activeChannel) {
      return (
        <div className="chat-page">
          <header className="chat-header">
            <button className="chat-back-btn" onClick={handleBackToChannels} aria-label="返回频道列表">
              <ArrowLeft size={20} />
            </button>
            <h1>{activeChannel.name}</h1>
            <div className="chat-spacer" />
            <div className="chat-peer-id-badge">
              <Users size={12} /> {channelPeers.length} 在线
            </div>
          </header>

          {renderTabNav()}

          <div className="chat-channel-view">
            <div className="chat-channel-messages">
              {channelMessages.length === 0 ? (
                <div className="chat-channel-empty">暂无消息，开始聊天吧！</div>
              ) : (
                channelMessages.map((msg, i) => (
                  <div key={i} className={`chat-channel-msg ${msg.author === peerId ? 'self' : 'other'}`}>
                    {msg.author !== peerId && <span className="chat-channel-msg-author">{msg.authorName}</span>}
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
        </div>
      )
    }

    return (
      <div className="chat-page">
        <header className="chat-header">
          <button className="chat-back-btn" onClick={goBack} aria-label="返回">
            <ArrowLeft size={20} />
          </button>
          <h1>频道</h1>
          <div className="chat-spacer" />
          <button className="chat-create-channel-btn" onClick={() => setShowCreateChannel(true)}>
            <Plus size={18} />
            <span>创建</span>
          </button>
        </header>

        {renderTabNav()}

        <div className="chat-channels-list">
          {channels.length === 0 ? (
            <div className="chat-channels-empty">
              <MessageSquare size={48} />
              <p>暂无频道，创建一个开始聊天吧</p>
            </div>
          ) : (
            channels.map(channel => (
              <div key={channel.name} className="chat-channel-item" onClick={() => handleOpenChannel(channel)}>
                <div className="chat-channel-item-icon">
                  <MessageSquare size={20} />
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

  return null
}

export default ChatPage
