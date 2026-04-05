'use client'

import React, { useState, useRef, useEffect } from 'react'
import Peer from 'simple-peer/simplepeer.min.js'
import { PhoneOff, Video, VideoOff, Mic, MicOff, MessageSquare, X, Send, Monitor, MonitorOff, ArrowLeft, Copy, Check, Users, User } from 'lucide-react'

const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]
}

const PRESENTER_THRESHOLD = 4

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

function CallPage() {
  const [myPeerId, setMyPeerId] = useState('')
  const [callState, setCallState] = useState('idle')
  const [channel, setChannel] = useState(null)
  const [callType, setCallType] = useState('video')
  const [callDuration, setCallDuration] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  const [isCameraOff, setIsCameraOff] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [chatMessages, setChatMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [showParticipants, setShowParticipants] = useState(false)
  const [presenterPeerId, setPresenterPeerId] = useState(null)
  const [participants, setParticipants] = useState([])

  const wsRef = useRef(null)
  const peersRef = useRef(new Map())
  const localStreamRef = useRef(null)
  const screenStreamRef = useRef(null)
  const callTimerRef = useRef(null)
  const chatEndRef = useRef(null)
  const presenterPeerIdRef = useRef(null)
  const videoContainerRef = useRef(null)

  useEffect(() => {
    presenterPeerIdRef.current = presenterPeerId
  }, [presenterPeerId])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const channelFromUrl = params.get('channel')
    const typeFromUrl = params.get('type')
    if (channelFromUrl) setChannel(channelFromUrl)
    if (typeFromUrl === 'audio' || typeFromUrl === 'video') setCallType(typeFromUrl)
  }, [])

  useEffect(() => {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${location.host}/ws`)

    ws.onopen = () => {
      fetch('/api/peer-id')
        .then(r => r.json())
        .then(d => {
          setMyPeerId(d.peerId)
          if (ws.readyState === 1) {
            ws.send(JSON.stringify({ event: 'register', data: { peerId: d.peerId } }))
          }
        })
        .catch(() => setError('Failed to get peer ID'))
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
  }, [])

  useEffect(() => {
    if (callState === 'connected') {
      setCallDuration(0)
      callTimerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000)
    } else {
      if (callTimerRef.current) { clearInterval(callTimerRef.current); callTimerRef.current = null }
    }
    return () => { if (callTimerRef.current) clearInterval(callTimerRef.current) }
  }, [callState])

  useEffect(() => {
    if (channel && callState === 'idle') {
      joinChannelCall(channel)
    }
  }, [channel])

  useEffect(() => {
    assignStreamsToVideos()
  }, [participants, presenterPeerId, callState])

  function handleWsEvent(event, data) {
    switch (event) {
      case 'signal':
        if (data.channel) {
          handleChannelSignal(data)
        } else {
          const peer = peersRef.current.get(data.fromPeerId)
          if (peer && data.signalData) {
            try { peer.signal(data.signalData) } catch {}
          }
        }
        break

      case 'call:peer-joined':
        if (data.channel === channel) {
          setParticipants(prev => {
            if (prev.some(p => p.peerId === data.peerId)) return prev
            return [...prev, { peerId: data.peerId }]
          })
          if (callState === 'connected') {
            createPeerForChannel(data.peerId, true)
          }
        }
        break

      case 'call:peer-left':
        if (data.channel === channel) {
          removePeer(data.peerId)
          setParticipants(prev => prev.filter(p => p.peerId !== data.peerId))
        }
        break

      case 'call:joined':
        if (data.channel === channel) {
          setCallState('connected')
          const peerList = data.peers || []
          setParticipants(peerList)
          for (const peer of peerList) {
            createPeerForChannel(peer.peerId, true)
          }
        }
        break

      case 'call:chat':
        if (data.channel === channel) {
          setChatMessages(prev => [...prev, {
            id: Date.now() + Math.random(),
            from: data.from,
            text: data.message,
            ts: new Date(),
            self: false
          }])
        }
        break

      case 'call:presenter-change':
        if (data.channel === channel) {
          setPresenterPeerId(data.presenterPeerId)
        }
        break
    }
  }

  function handleChannelSignal(data) {
    const { fromPeerId, signalData } = data
    let peer = peersRef.current.get(fromPeerId)
    if (!peer) {
      peer = createPeerForChannel(fromPeerId, false)
    }
    try { peer.signal(signalData) } catch {}
  }

  function createPeerForChannel(remotePeerId, initiator) {
    if (peersRef.current.has(remotePeerId)) return peersRef.current.get(remotePeerId)

    const peer = new Peer({
      initiator,
      stream: localStreamRef.current,
      trickle: true,
      config: ICE_CONFIG,
    })

    peer.on('signal', (signalData) => {
      if (wsRef.current && wsRef.current.readyState === 1) {
        wsRef.current.send(JSON.stringify({
          event: 'signal',
          data: { channel, signalData, targetPeerId: remotePeerId }
        }))
      }
    })

    peer.on('stream', () => {
      assignStreamsToVideos()
    })

    peer.on('data', (data) => {
      try {
        const msg = JSON.parse(data.toString())
        if (msg.type === 'chat') {
          setChatMessages(prev => [...prev, {
            id: Date.now() + Math.random(),
            from: remotePeerId,
            text: msg.text,
            ts: new Date(),
            self: false
          }])
        }
      } catch {}
    })

    peer.on('close', () => removePeer(remotePeerId))
    peer.on('error', (err) => {
      console.error('[Peer Error]', remotePeerId, err)
      removePeer(remotePeerId)
    })

    peersRef.current.set(remotePeerId, peer)
    return peer
  }

  function removePeer(peerId) {
    const peer = peersRef.current.get(peerId)
    if (peer) { try { peer.destroy() } catch {} }
    peersRef.current.delete(peerId)
    const videoEl = document.getElementById(`video-${peerId}`)
    if (videoEl) videoEl.srcObject = null
  }

  function assignStreamsToVideos() {
    for (const [peerId, peer] of peersRef.current) {
      const stream = peer.streams?.[0]
      if (!stream) continue

      const mainVideo = document.getElementById(`video-${peerId}`)
      if (mainVideo && mainVideo.srcObject !== stream) {
        mainVideo.srcObject = stream
      }

      const thumbVideo = document.getElementById(`thumb-${peerId}`)
      if (thumbVideo && thumbVideo.srcObject !== stream) {
        thumbVideo.srcObject = stream.clone()
      }
    }

    const localVideo = document.getElementById('video-local')
    if (localVideo && localStreamRef.current && localVideo.srcObject !== localStreamRef.current) {
      localVideo.srcObject = localStreamRef.current
    }

    const localThumb = document.getElementById('thumb-local')
    if (localThumb && localStreamRef.current && localThumb.srcObject !== localStreamRef.current) {
      localThumb.srcObject = localStreamRef.current
    }
  }

  async function joinChannelCall(channelName) {
    try {
      setCallState('connecting')
      const stream = await getLocalStream(callType === 'video')
      localStreamRef.current = stream
      setIsCameraOff(callType !== 'video')

      if (wsRef.current && wsRef.current.readyState === 1) {
        wsRef.current.send(JSON.stringify({
          event: 'call:join',
          data: { channel: channelName }
        }))
      }
    } catch (err) {
      setError(err.message)
      setCallState('idle')
    }
  }

  async function getLocalStream(video = true) {
    const constraints = {
      audio: true,
      video: video ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false
    }
    try {
      return await navigator.mediaDevices.getUserMedia(constraints)
    } catch {
      if (video) return await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      throw new Error('无法获取媒体权限')
    }
  }

  function cleanupCall() {
    for (const [, peer] of peersRef.current) { try { peer.destroy() } catch {} }
    peersRef.current.clear()

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop())
      localStreamRef.current = null
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop())
      screenStreamRef.current = null
    }

    if (channel && wsRef.current && wsRef.current.readyState === 1) {
      wsRef.current.send(JSON.stringify({ event: 'call:leave', data: { channel } }))
    }

    setIsMuted(false)
    setIsCameraOff(false)
    setIsScreenSharing(false)
    setPresenterPeerId(null)
    setParticipants([])
    setChatMessages([])
    setShowChat(false)
    setShowParticipants(false)
  }

  function handleHangup() {
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
        for (const [, peer] of peersRef.current) {
          const sender = peer._pc.getSenders().find(s => s.track?.kind === 'video')
          if (sender) sender.replaceTrack(videoTrack)
        }

        videoTrack.onended = () => stopScreenShare()
        setIsScreenSharing(true)
        if (!presenterPeerIdRef.current) setPresenterPeerId(myPeerId)
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
      for (const [, peer] of peersRef.current) {
        const sender = peer._pc.getSenders().find(s => s.track?.kind === 'video')
        if (sender) sender.replaceTrack(videoTrack)
      }
    }
    setIsScreenSharing(false)
  }

  function setAsPresenter(peerId) {
    setPresenterPeerId(peerId)
    if (wsRef.current && wsRef.current.readyState === 1) {
      wsRef.current.send(JSON.stringify({
        event: 'call:presenter-change',
        data: { channel, presenterPeerId: peerId }
      }))
    }
    setTimeout(assignStreamsToVideos, 100)
  }

  function sendChatMessage() {
    if (!newMessage.trim()) return

    setChatMessages(prev => [...prev, {
      id: Date.now() + Math.random(),
      from: 'self',
      text: newMessage.trim(),
      ts: new Date(),
      self: true
    }])

    for (const [, peer] of peersRef.current) {
      if (peer.connected) {
        try { peer.send(JSON.stringify({ type: 'chat', text: newMessage.trim() })) } catch {}
      }
    }

    if (wsRef.current && wsRef.current.readyState === 1 && channel) {
      wsRef.current.send(JSON.stringify({
        event: 'call:chat',
        data: { channel, message: newMessage.trim() }
      }))
    }

    setNewMessage('')
  }

  const participantCount = participants.length + 1
  const isPresenterMode = participantCount > PRESENTER_THRESHOLD
  const remotePeers = participants.filter(p => p.peerId !== myPeerId)

  if (callState === 'idle') {
    return (
      <div className="call-page">
        <header className="call-header">
          <button className="call-back-btn" onClick={() => window.location.href = '/'} aria-label="返回">
            <ArrowLeft size={20} />
          </button>
          <h1>P2P 通话</h1>
          <div className="call-spacer" />
          <div className="call-peer-id-badge">
            ID: {myPeerId || '加载中...'}
          </div>
        </header>

        <div className="call-dial-container">
          <div className="call-dial-icon">
            <Users size={48} />
          </div>

          <p className="call-dial-description">
            从频道发起通话，或直接输入 Peer ID 呼叫
          </p>

          {channel && (
            <div className="call-channel-info">
              <span>频道: {channel}</span>
              <button className="call-join-btn" onClick={joinChannelCall}>
                加入通话
              </button>
            </div>
          )}

          {error && <div className="call-error">{error}</div>}

          <div className="call-copy-id">
            <button
              className="call-copy-btn"
              onClick={() => {
                navigator.clipboard.writeText(myPeerId)
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

  if (callState === 'connecting') {
    return (
      <div className="call-page">
        <header className="call-header">
          <button className="call-back-btn" onClick={handleHangup} aria-label="取消">
            <ArrowLeft size={20} />
          </button>
          <h1>连接中...</h1>
          <div className="call-spacer" />
        </header>

        <div className="call-connecting-container">
          <div className="call-connecting-spinner" />
          <p>正在建立 P2P 连接...</p>
          {channel && <p className="call-connecting-channel">频道: {channel}</p>}
          <button className="call-cancel-btn" onClick={handleHangup}>取消</button>
        </div>
      </div>
    )
  }

  if (callState === 'connected') {
    return (
      <div className={`call-page ${showChat ? 'with-chat' : ''} ${showParticipants ? 'with-participants' : ''}`}>
        <div className="call-active-layout">
          <div className="call-video-area">
            {isPresenterMode ? renderPresenterView(remotePeers) : renderGridView(remotePeers)}

            <div className="call-duration-badge">{formatDuration(callDuration)}</div>

            {channel && <div className="call-channel-badge">{channel}</div>}
          </div>

          <div className="call-controls">
            <button className={`call-control-btn ${isMuted ? 'active' : ''}`} onClick={toggleMute} title={isMuted ? '取消静音' : '静音'}>
              {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
            </button>

            {callType === 'video' && (
              <button className={`call-control-btn ${isCameraOff ? 'active' : ''}`} onClick={toggleCamera} title={isCameraOff ? '开启摄像头' : '关闭摄像头'}>
                {isCameraOff ? <VideoOff size={20} /> : <Video size={20} />}
              </button>
            )}

            <button className={`call-control-btn ${isScreenSharing ? 'active' : ''}`} onClick={toggleScreenShare} title={isScreenSharing ? '停止共享' : '共享屏幕'}>
              {isScreenSharing ? <MonitorOff size={20} /> : <Monitor size={20} />}
            </button>

            {isPresenterMode && (
              <button className={`call-control-btn ${showParticipants ? 'active' : ''}`} onClick={() => setShowParticipants(!showParticipants)} title="参与者">
                <Users size={20} />
              </button>
            )}

            <button className={`call-control-btn ${showChat ? 'active' : ''}`} onClick={() => setShowChat(!showChat)} title="文字聊天">
              <MessageSquare size={20} />
            </button>

            <button className="call-control-btn hangup" onClick={handleHangup} title="挂断">
              <PhoneOff size={24} />
            </button>
          </div>

          {showChat && (
            <div className="call-chat-panel">
              <div className="call-chat-header">
                <h3>文字聊天</h3>
                <button className="call-chat-close" onClick={() => setShowChat(false)}><X size={18} /></button>
              </div>

              <div className="call-chat-messages">
                {chatMessages.length === 0 && <p className="call-chat-empty">暂无消息</p>}
                {chatMessages.map(msg => (
                  <div key={msg.id} className={`call-chat-msg ${msg.self ? 'self' : ''}`}>
                    {!msg.self && <span className="call-chat-msg-from">{msg.from}</span>}
                    <div className="call-chat-msg-bubble">{msg.text}</div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              <div className="call-chat-input-area">
                <input type="text" className="call-chat-input" placeholder="输入消息..." value={newMessage} onChange={e => setNewMessage(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendChatMessage()} />
                <button className="call-chat-send" onClick={sendChatMessage}><Send size={18} /></button>
              </div>
            </div>
          )}

          {showParticipants && isPresenterMode && (
            <div className="call-participants-panel">
              <div className="call-participants-header">
                <h3>参与者 ({participantCount})</h3>
                <button className="call-participants-close" onClick={() => setShowParticipants(false)}><X size={18} /></button>
              </div>

              <div className="call-participants-list">
                <div className={`call-participant-item ${presenterPeerId === myPeerId ? 'presenter' : ''}`}>
                  <div className="call-participant-avatar"><User size={16} /></div>
                  <span className="call-participant-name">你</span>
                  {presenterPeerId === myPeerId && <span className="call-participant-status">主讲人</span>}
                  {presenterPeerId !== myPeerId && (
                    <button className="call-participant-set-presenter" onClick={() => setAsPresenter(myPeerId)}>设为主讲</button>
                  )}
                </div>

                {remotePeers.map(p => (
                  <div key={p.peerId} className={`call-participant-item ${presenterPeerId === p.peerId ? 'presenter' : ''}`}>
                    <div className="call-participant-avatar"><User size={16} /></div>
                    <span className="call-participant-name" title={p.peerId}>{p.peerId.slice(0, 8)}...</span>
                    {presenterPeerId === p.peerId && <span className="call-participant-status">主讲人</span>}
                    {presenterPeerId !== p.peerId && (
                      <button className="call-participant-set-presenter" onClick={() => setAsPresenter(p.peerId)}>设为主讲</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  function renderGridView(remotePeers) {
    const allVideos = [
      { peerId: myPeerId, isLocal: true },
      ...remotePeers.map(p => ({ peerId: p.peerId, isLocal: false }))
    ]

    return (
      <div className={`call-grid call-grid-${Math.min(allVideos.length, 4)}`}>
        {allVideos.map(({ peerId, isLocal }) => (
          <div key={peerId} className={`call-grid-item ${isLocal ? 'local' : ''}`}>
            <video id={`video-${isLocal ? 'local' : peerId}`} autoPlay playsInline muted={isLocal} className="call-grid-video" />
            <div className="call-grid-label">{isLocal ? '你' : peerId.slice(0, 8)}</div>
            {isLocal && isCameraOff && (
              <div className="call-grid-placeholder"><User size={48} /></div>
            )}
          </div>
        ))}
      </div>
    )
  }

  function renderPresenterView(remotePeers) {
    const presenterPeer = remotePeers.find(p => p.peerId === presenterPeerId)
    const isLocalPresenter = presenterPeerId === myPeerId
    const nonPresenterPeers = remotePeers.filter(p => p.peerId !== presenterPeerId)

    return (
      <div className="call-presenter-view">
        <div className="call-presenter-main">
          {isLocalPresenter ? (
            <>
              <video id="video-local" autoPlay playsInline muted className="call-presenter-video" />
              {isCameraOff && !isScreenSharing && (
                <div className="call-presenter-placeholder"><User size={64} /><p>摄像头已关闭</p></div>
              )}
            </>
          ) : presenterPeer ? (
            <video id={`video-${presenterPeerId}`} autoPlay playsInline className="call-presenter-video" />
          ) : (
            <div className="call-presenter-placeholder"><User size={64} /><p>等待主讲人...</p></div>
          )}
        </div>

        <div className="call-presenter-thumbnails">
          {nonPresenterPeers.map(p => (
            <div key={p.peerId} className="call-thumbnail" onClick={() => setAsPresenter(p.peerId)}>
              <video id={`thumb-${p.peerId}`} autoPlay playsInline muted className="call-thumbnail-video" />
              <div className="call-thumbnail-label">{p.peerId.slice(0, 6)}</div>
            </div>
          ))}

          {!isLocalPresenter && (
            <div className="call-thumbnail" onClick={() => setAsPresenter(myPeerId)}>
              <video id="thumb-local" autoPlay playsInline muted className="call-thumbnail-video" />
              <div className="call-thumbnail-label">你</div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return null
}

export default CallPage
