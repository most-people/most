'use client'

import React, { useState, useEffect, useRef } from 'react'
import {
  MessageSquare,
  Send,
  Plus,
  Sun,
  Moon,
  X,
  ArrowLeft,
  Edit2,
  Calendar,
  Hash,
  Settings,
  Image as ImageIcon,
  Film,
  FileText,
  Download,
  Loader,
  Music,
  Paperclip,
} from 'lucide-react'
import AppShell from '~/components/AppShell'
import FilePreviewOverlay from '~/components/FilePreviewOverlay'
import { InputModal, ConfirmModal } from '~/components/ui'
import OpenSidebarButton from '~/components/OpenSidebarButton'
import {
  api,
  getApiErrorMessage,
  getApiUrl,
  getAuthenticatedWebSocketUrl,
} from '~/server/src/utils/api'
import { generateAvatar } from '~/server/src/utils/avatar.js'
import { useAppStore } from '~/app/app/useAppStore'
import { useUserStore } from '~/app/app/userStore'
import { useDisclosure } from '~/hooks'
import SidebarAccount from '~/components/SidebarAccount'
import { getFileSubtype, type FileSubtype } from '~/lib/filePreview'

interface ChannelAttachment {
  kind: FileSubtype
  cid: string
  fileName: string
  link: string
  mimeType?: string
  size?: number
}

interface ChannelMessage {
  id?: string
  author: string
  authorName?: string
  content: string
  timestamp: number
  pending?: boolean
  attachment?: ChannelAttachment
}

interface Channel {
  name: string
  remark?: string
  createdAt?: string
  coreKey?: string
  type?: string
  peerCount?: number
}

const CHANNEL_NAME_MIN_LENGTH = 3
const CHANNEL_NAME_MAX_LENGTH = 20
const CHANNEL_NAME_REGEX = /^[a-zA-Z0-9_-]+$/

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
    authorName: string,
    attachment?: ChannelAttachment
  ) =>
    api
      .post<SendMessageResult>(
        `/api/channels/${encodeURIComponent(name)}/messages`,
        {
          json: attachment
            ? { content, author, authorName, attachment }
            : { content, author, authorName },
        }
      )
      .json(),
  async publishFile(file: File, customName: string) {
    const formData = new FormData()
    formData.append('file', file, customName)
    const res = await api.post('/api/publish', { body: formData })
    if (!res.ok) {
      const err = await res
        .json<{ error: string }>()
        .catch(() => ({ error: res.statusText }))
      throw new Error(err.error || 'Request failed')
    }
    return res.json<any>()
  },
  listPublishedFiles: () => api.get('/api/files').json<any[]>(),
  downloadFile: (link: string) =>
    api.post('/api/download', { json: { link } }).json<any>(),
  getFileDownloadUrl: (cid: string) => getApiUrl(`/api/files/${cid}/download`),
  getChannelPeers: (name: string) =>
    api.get<string[]>(`/api/channels/${encodeURIComponent(name)}/peers`).json(),
  setChannelRemark: (name: string, remark: string) =>
    api
      .put<{
        success: boolean
        remark: string
      }>(`/api/channels/${encodeURIComponent(name)}/remark`, {
        json: { remark },
      })
      .json(),
}

const CHAT_FILE_ROOT = 'chat-file'

function formatSize(bytes?: number) {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function getBaseFileName(fileName: string) {
  const parts = String(fileName || '').split('/')
  return parts[parts.length - 1] || fileName
}

function getAttachmentKind(file: File, fileName: string): FileSubtype {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  if (file.type.startsWith('audio/')) return 'audio'
  if (file.type.startsWith('text/')) return 'text'
  return getFileSubtype(fileName)
}

function getAttachmentIcon(kind: FileSubtype) {
  if (kind === 'image') return <ImageIcon size={20} />
  if (kind === 'video') return <Film size={20} />
  if (kind === 'audio') return <Music size={20} />
  return <FileText size={20} />
}

function ChatPage() {
  const isDarkMode = useAppStore(s => s.isDarkMode)
  const setIsDarkMode = useAppStore(s => s.setIsDarkMode)
  const hasBackend = useAppStore(s => s.hasBackend)
  const addToast = useAppStore(s => s.addToast)
  const openConnectModal = useAppStore(s => s.openConnectModal)
  const userIdentity = useUserStore(s => s.identity)
  const openLoginModal = useUserStore(s => s.openLoginModal)
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
  const [showChannelDetail, setShowChannelDetail] = useState(false)
  const [remarkInput, setRemarkInput] = useState('')
  const [previewItem, setPreviewItem] = useState(null)
  const [isPublishingAttachment, setIsPublishingAttachment] = useState(false)
  const [attachmentDownloadStatus, setAttachmentDownloadStatus] = useState({})

  const wsRef = useRef(null)
  const channelMessagesEndRef = useRef(null)
  const activeChannelRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)
  const reconnectAttemptRef = useRef(0)
  const isWsConnectedRef = useRef(false)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingAttachmentPreviewsRef = useRef(new Map())
  const isBackendReady = hasBackend === true

  function requireBackendReady() {
    if (isBackendReady) return true
    openConnectModal()
    return false
  }

  function requireLogin() {
    if (userIdentity) return true
    openLoginModal()
    return false
  }

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
    if (!isBackendReady || !userIdentity) return

    reconnectAttemptRef.current = 0

    async function connectWs() {
      const ws = new WebSocket(await getAuthenticatedWebSocketUrl('/ws'))

      ws.onopen = () => {
        isWsConnectedRef.current = true
        reconnectAttemptRef.current = 0
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
        if (!isMountedRef.current) return
        const attempt = reconnectAttemptRef.current
        if (attempt >= 20) return
        const delay = Math.min(3000 * Math.pow(2, attempt), 30000)
        reconnectAttemptRef.current = attempt + 1
        reconnectTimeoutRef.current = setTimeout(connectWs, delay)
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
  }, [isBackendReady, userIdentity?.address])

  useEffect(() => {
    if (myPeerId) {
      wsSend('register', { peerId: myPeerId })
    }
  }, [myPeerId])

  useEffect(() => {
    if (isBackendReady && userIdentity) {
      refreshChannels()
    }
  }, [hasBackend, isBackendReady, userIdentity?.address])

  useEffect(() => {
    if (activeChannel) {
      if (isBackendReady) {
        API.getChannelMessages(activeChannel.name)
          .then(setChannelMessages)
          .catch(err => {
            setChannelMessages([])
            void showApiError(err, '无法读取频道消息')
          })
        API.getChannelPeers(activeChannel.name).catch(() => {})
      }
    }
  }, [activeChannel, hasBackend, isBackendReady])

  useEffect(() => {
    const channelParam = new URLSearchParams(window.location.search).get(
      'channel'
    )
    if (channelParam && channels.length > 0) {
      const found = channels.find(c => c.name === channelParam)
      if (found && (!activeChannel || activeChannel.name !== found.name)) {
        handleOpenChannel(found)
      }
    }
  }, [channels, activeChannel])

  useEffect(() => {
    if (userIdentity) return
    setChannels([])
    setActiveChannel(null)
    setChannelMessages([])
    setChannelInput('')
    setMyPeerId('')
    setShowChannelDetail(false)
    setPreviewItem(null)
    setAttachmentDownloadStatus({})
    pendingAttachmentPreviewsRef.current.clear()
  }, [userIdentity?.address])

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

  function getChannelNameValidationError(name) {
    if (name.length < CHANNEL_NAME_MIN_LENGTH) {
      return `频道名至少 ${CHANNEL_NAME_MIN_LENGTH} 个字符`
    }
    if (name.length > CHANNEL_NAME_MAX_LENGTH) {
      return `频道名最多 ${CHANNEL_NAME_MAX_LENGTH} 个字符`
    }
    if (!CHANNEL_NAME_REGEX.test(name)) {
      return '频道名只能包含字母、数字、下划线和连字符'
    }
    return ''
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

  function openAttachmentPreview(
    attachment: ChannelAttachment,
    fileName = attachment.fileName
  ) {
    const subtype = getFileSubtype(fileName)
    setPreviewItem({
      cid: attachment.cid,
      fileName,
      subtype: subtype === 'file' ? attachment.kind : subtype,
    })
  }

  function clearAttachmentDownload(cid: string) {
    setAttachmentDownloadStatus(prev => {
      const next = { ...prev }
      delete next[cid]
      return next
    })
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
              console.warn(
                '[Chat] Failed to fetch peers on event:',
                err.message
              )
            })
          }
        }
        break

      case 'channel:joined':
      case 'channel:left':
        refreshChannels()
        break

      case 'download:success': {
        const attachment = pendingAttachmentPreviewsRef.current.get(
          data.taskId
        )
        if (attachment) {
          pendingAttachmentPreviewsRef.current.delete(data.taskId)
          clearAttachmentDownload(attachment.cid)
          addToast(`${data.fileName || getBaseFileName(attachment.fileName)} 下载完成`, 'success')
          openAttachmentPreview(attachment, data.fileName || attachment.fileName)
        }
        break
      }

      case 'download:error':
      case 'download:cancelled': {
        const attachment = pendingAttachmentPreviewsRef.current.get(
          data.taskId
        )
        if (attachment) {
          pendingAttachmentPreviewsRef.current.delete(data.taskId)
          clearAttachmentDownload(attachment.cid)
          addToast(
            event === 'download:cancelled'
              ? '附件下载已取消'
              : data.error || '附件下载失败',
            'error'
          )
        }
        break
      }
    }
  }

  async function handleOpenChannel(channel) {
    if (!requireLogin()) return
    if (!requireBackendReady()) return
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
  }

  async function handleLeaveChannel(name, e) {
    if (e) e.stopPropagation()
    if (!requireLogin()) return
    if (!requireBackendReady()) return
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
    const name = channelName.trim()
    if (!name || isJoiningChannel) return
    const validationError = getChannelNameValidationError(name)
    if (validationError) {
      addToast(validationError, 'error')
      return
    }
    if (!requireLogin()) return
    if (!requireBackendReady()) return
    setIsJoiningChannel(true)
    try {
      await API.createChannel(name, 'public')
      const joinedChannel = channels.find(channel => channel.name === name) || {
        name,
        type: 'public',
      }
      setChannels(prev =>
        prev.some(channel => channel.name === name)
          ? prev
          : [...prev, joinedChannel]
      )
      joinChannelModal.close()
      await handleOpenChannel(joinedChannel)
      refreshChannels()
    } catch (err) {
      await showApiError(err, '加入频道失败')
    } finally {
      setIsJoiningChannel(false)
    }
  }

  async function sendChannelMessage(
    content: string,
    attachment?: ChannelAttachment
  ) {
    if (!content.trim() || !activeChannel) return false
    if (!requireLogin()) return false
    if (!requireBackendReady()) return false
    const trimmedContent = content.trim()

    const optimisticId = `${userIdentity.address}-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const optimisticMsg = {
      id: optimisticId,
      author: userIdentity.address,
      authorName: userIdentity.displayName,
      content: trimmedContent,
      timestamp: Date.now(),
      pending: true,
      attachment,
    }
    setChannelMessages(prev => [...prev, optimisticMsg])

    try {
      const result = await API.sendChannelMessage(
        activeChannel.name,
        trimmedContent,
        userIdentity.address,
        userIdentity.displayName,
        attachment
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
      return true
    } catch (err) {
      setChannelMessages(prev => prev.filter(m => m.id !== optimisticId))
      await showApiError(err, '发送失败')
      return false
    }
  }

  async function handleSendChannelMessage() {
    if (!channelInput.trim()) return
    const content = channelInput.trim()
    setChannelInput('')
    await sendChannelMessage(content)
  }

  function getChatAttachmentFileName(channelName: string, fileName: string) {
    return `${CHAT_FILE_ROOT}/${channelName}/${fileName}`
  }

  async function handleSelectAttachmentFiles(files: FileList | null) {
    if (!files || files.length === 0 || !activeChannel) return
    if (!requireLogin()) return
    if (!requireBackendReady()) return
    if (isPublishingAttachment) return

    setIsPublishingAttachment(true)
    try {
      for (const file of Array.from(files)) {
        const targetFileName = getChatAttachmentFileName(
          activeChannel.name,
          file.name
        )
        const result = await API.publishFile(file, targetFileName)
        const fileName = result.fileName || targetFileName
        const link =
          result.link ||
          `most://${result.cid}?filename=${encodeURIComponent(fileName)}`
        const attachment: ChannelAttachment = {
          kind: getAttachmentKind(file, fileName),
          cid: result.cid,
          fileName,
          link,
          mimeType: file.type || undefined,
          size: file.size,
        }
        const sent = await sendChannelMessage(link, attachment)
        if (sent) {
          addToast(`${getBaseFileName(fileName)} 已发布`, 'success')
        }
      }
    } catch (err) {
      await showApiError(err, '附件发送失败')
    } finally {
      setIsPublishingAttachment(false)
    }
  }

  async function handleOpenAttachment(attachment: ChannelAttachment) {
    if (!requireLogin()) return
    if (!requireBackendReady()) return
    if (attachmentDownloadStatus[attachment.cid]) return

    try {
      const files = await API.listPublishedFiles()
      const localFile = files.find(file => file.cid === attachment.cid)
      if (localFile) {
        openAttachmentPreview(
          { ...attachment, fileName: localFile.fileName },
          localFile.fileName
        )
        return
      }

      setAttachmentDownloadStatus(prev => ({
        ...prev,
        [attachment.cid]: 'downloading',
      }))
      const result = await API.downloadFile(attachment.link)
      if (result.alreadyExists || result.fileName) {
        clearAttachmentDownload(attachment.cid)
        openAttachmentPreview(
          { ...attachment, fileName: result.fileName || attachment.fileName },
          result.fileName || attachment.fileName
        )
        return
      }

      if (result.taskId) {
        pendingAttachmentPreviewsRef.current.set(result.taskId, attachment)
        addToast('开始下载附件', 'success')
      }
    } catch (err) {
      clearAttachmentDownload(attachment.cid)
      await showApiError(err, '附件下载失败')
    }
  }

  async function handleSetRemark() {
    if (!activeChannel) return
    if (!requireLogin()) return
    if (!requireBackendReady()) return
    try {
      const result = await API.setChannelRemark(activeChannel.name, remarkInput)
      setChannels(prev =>
        prev.map(c =>
          c.name === activeChannel.name ? { ...c, remark: result.remark } : c
        )
      )
      setActiveChannel(prev =>
        prev ? { ...prev, remark: result.remark } : null
      )
    } catch (err) {
      await showApiError(err, '设置备注失败')
    }
  }

  function renderMessageBubble(msg: ChannelMessage) {
    if (!msg.attachment) {
      return <div className="message-bubble">{msg.content}</div>
    }

    const attachment = msg.attachment
    const isDownloading = attachmentDownloadStatus[attachment.cid]
    const detail = formatSize(attachment.size) || 'MostBox 文件'

    return (
      <div className="message-bubble has-attachment">
        <button
          type="button"
          className="chat-attachment-card"
          onClick={() => handleOpenAttachment(attachment)}
          disabled={Boolean(msg.pending || isDownloading)}
          title={attachment.link}
        >
          <span className={`chat-attachment-icon ${attachment.kind}`}>
            {isDownloading ? (
              <Loader size={20} className="chat-attachment-spinner" />
            ) : (
              getAttachmentIcon(attachment.kind)
            )}
          </span>
          <span className="chat-attachment-info">
            <span className="chat-attachment-name">
              {getBaseFileName(attachment.fileName)}
            </span>
            <span className="chat-attachment-meta">
              {msg.pending ? '发送中...' : detail}
            </span>
          </span>
          <span className="chat-attachment-action">
            {isDownloading ? '下载中' : <Download size={16} />}
          </span>
        </button>
      </div>
    )
  }

  const chatHeaderTitle = activeChannel ? (
    <h2 className="header-title">
      {activeChannel.remark || activeChannel.name}
    </h2>
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
            <ArrowLeft size={18} />
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
                  <span>{channel.remark || channel.name}</span>
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
            onClick={() => {
              if (!requireLogin() || !requireBackendReady()) return
              joinChannelModal.open()
            }}
          >
            <Plus size={16} />
            加入频道
          </button>

          <SidebarAccount />
        </>
      )}
      headerTitle={chatHeaderTitle}
      headerRight={
        <div className="header-right-actions">
          <button
            className="btn btn-icon"
            onClick={() => setIsDarkMode(!isDarkMode)}
            title="切换主题"
          >
            {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          {activeChannel && (
            <button
              className="btn btn-icon"
              onClick={() => setShowChannelDetail(true)}
              title="频道设置"
            >
              <Settings size={16} />
            </button>
          )}
        </div>
      }
    >
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
                    {renderMessageBubble(msg)}
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
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="chat-file-input"
              onChange={e => {
                void handleSelectAttachmentFiles(e.target.files)
                e.currentTarget.value = ''
              }}
            />
            <input
              ref={videoInputRef}
              type="file"
              accept="video/*"
              className="chat-file-input"
              onChange={e => {
                void handleSelectAttachmentFiles(e.target.files)
                e.currentTarget.value = ''
              }}
            />
            <input
              ref={fileInputRef}
              type="file"
              className="chat-file-input"
              onChange={e => {
                void handleSelectAttachmentFiles(e.target.files)
                e.currentTarget.value = ''
              }}
            />
            <button
              type="button"
              className="chat-tool-btn"
              onClick={() => imageInputRef.current?.click()}
              disabled={!userIdentity || isPublishingAttachment}
              title="发送图片"
            >
              <ImageIcon size={18} />
            </button>
            <button
              type="button"
              className="chat-tool-btn"
              onClick={() => videoInputRef.current?.click()}
              disabled={!userIdentity || isPublishingAttachment}
              title="发送视频"
            >
              <Film size={18} />
            </button>
            <button
              type="button"
              className="chat-tool-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={!userIdentity || isPublishingAttachment}
              title="发送文件"
            >
              {isPublishingAttachment ? (
                <Loader size={18} className="chat-attachment-spinner" />
              ) : (
                <Paperclip size={18} />
              )}
            </button>
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
            <OpenSidebarButton label="打开频道列表" />
          </div>
        </>
      )}

      {showJoinChannel && (
        <InputModal
          title="加入频道"
          placeholder="频道ID：3-20 位字母、数字、_ 或 -"
          confirmText="加入"
          validate={getChannelNameValidationError}
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

      {previewItem && (
        <FilePreviewOverlay
          item={previewItem}
          isBackendReady={isBackendReady}
          getFileDownloadUrl={API.getFileDownloadUrl}
          onClose={() => setPreviewItem(null)}
        />
      )}

      {showChannelDetail && activeChannel && (
        <div
          className="channel-detail-overlay"
          onClick={() => setShowChannelDetail(false)}
        >
          <div
            className="channel-detail-drawer"
            onClick={e => e.stopPropagation()}
          >
            <div className="channel-detail-header">
              <h3>频道详情</h3>
              <button
                className="btn btn-icon"
                onClick={() => setShowChannelDetail(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="channel-detail-body">
              <div className="channel-detail-section">
                <div className="channel-detail-label">
                  <Hash size={14} />
                  <span>频道 ID</span>
                </div>
                <div className="channel-detail-value channel-detail-mono">
                  {activeChannel.name}
                </div>
              </div>

              <div className="channel-detail-section">
                <div className="channel-detail-label">
                  <Edit2 size={14} />
                  <span>备注名称</span>
                </div>
                <input
                  type="text"
                  className="input input-compact"
                  placeholder="输入备注名称"
                  value={remarkInput}
                  onChange={e => setRemarkInput(e.target.value)}
                  onFocus={() => setRemarkInput(activeChannel.remark || '')}
                  onBlur={() => handleSetRemark()}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.currentTarget.blur()
                    }
                  }}
                  maxLength={50}
                />
              </div>

              <div className="channel-detail-section">
                <div className="channel-detail-label">
                  <Calendar size={14} />
                  <span>创建时间</span>
                </div>
                <div className="channel-detail-value">
                  {activeChannel.createdAt
                    ? new Date(activeChannel.createdAt).toLocaleDateString(
                        'zh-CN'
                      )
                    : '-'}
                </div>
              </div>
            </div>

            <div className="channel-detail-footer">
              <button
                className="btn btn-danger btn-block"
                onClick={() => {
                  setShowChannelDetail(false)
                  setChannelToLeave(activeChannel)
                  leaveChannelModal.open()
                }}
              >
                退出频道
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}

export default ChatPage
