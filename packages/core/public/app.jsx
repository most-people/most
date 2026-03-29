import React, { useState, useEffect, useRef } from 'react'
import {
  Upload, Sun, Moon, Image as ImageIcon, Trash2, Folder,
  FolderPlus, Film, Music, ChevronRight, FileText,
  MousePointer2, X, Play, Maximize2, MoreHorizontal,
  Edit2, Info, Share2, Check, Copy, Download, Link, Power,
  ArrowUpDown
} from 'lucide-react'

// === API ===
const API = {
  async fetch(url, options = {}) {
    const res = await fetch(url, options)
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(err.error || 'Request failed')
    }
    return res.json()
  },
  getNodeId: () => API.fetch('/api/node-id'),
  getNetworkStatus: () => API.fetch('/api/network-status'),
  listPublishedFiles: () => API.fetch('/api/files'),
  deletePublishedFile: (cid) => API.fetch(`/api/files/${cid}`, { method: 'DELETE' }),
  async publishFile(file, customName) {
    const formData = new FormData()
    formData.append('file', file, customName || file.name)
    const res = await fetch('/api/publish', { method: 'POST', body: formData })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }))
      throw new Error(err.error || 'Request failed')
    }
    return res.json()
  },
  downloadFile: (link) => API.fetch('/api/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ link })
  }),
  getFileDownloadUrl: (cid) => `/api/files/${cid}/download`
}

// === Transfer helpers ===
function formatSpeed(bytesPerSecond) {
  if (!bytesPerSecond || bytesPerSecond <= 0) return ''
  if (bytesPerSecond < 1024) return `${bytesPerSecond.toFixed(0)} B/s`
  if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`
  return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`
}

function formatSize(bytes) {
  if (!bytes || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

// === Folder Manager (S3-style) ===
function parseName(fullPath) {
  const lastSlash = fullPath.lastIndexOf('/')
  if (lastSlash === -1) return { folder: '', name: fullPath }
  return { folder: fullPath.substring(0, lastSlash), name: fullPath.substring(lastSlash + 1) }
}

function getUniqueFolders(files) {
  const folders = new Set()
  files.forEach(f => {
    const { folder } = parseName(f.fileName)
    let parts = folder.split('/').filter(Boolean)
    let acc = ''
    for (const part of parts) {
      acc += (acc ? '/' : '') + part
      folders.add(acc)
    }
  })
  return [...folders].sort()
}

function getCurrentFolders(allFolders, currentPath) {
  const prefix = currentPath ? currentPath + '/' : ''
  return allFolders.filter(f => {
    const isUnder = f.toLowerCase().startsWith(prefix.toLowerCase())
    const remainder = f.substring(prefix.length)
    return isUnder && !remainder.includes('/')
  }).map(f => ({ name: f.substring(prefix.length), path: f }))
}

function getItemsForPath(files, allFolders, currentPath) {
  const currentFolders = getCurrentFolders(allFolders, currentPath)
  const filesHere = files.filter(f => {
    const { folder } = parseName(f.fileName)
    return folder === currentPath
  })
  return { folders: currentFolders, files: filesHere }
}

// === Toast ===
function Toast({ message, type, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3500)
    return () => clearTimeout(t)
  }, [])
  const colors = { success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6' }
  return (
    <div style={{
      position: 'fixed', top: 20, right: 20, zIndex: 9999,
      background: colors[type] || colors.info, color: '#fff',
      padding: '12px 20px', borderRadius: 10, fontSize: 13, fontWeight: 500,
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      animation: 'toastSlideIn 0.25s ease'
    }}>
      {message}
    </div>
  )
}

// === MediaItem ===
function MediaItem({ item, isSelected, isDarkMode, onSelect, onRemove, onRename, onOpen, onPreview, onDragStart, onDropInto, onShowProperties, onShare }) {
  const [isEditing, setIsEditing] = useState(false)
  const [tempName, setTempName] = useState(item.name)
  const [isDragHover, setIsDragHover] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuRef = useRef(null)

  const { id, name, type, subtype, url } = item

  useEffect(() => {
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setIsMenuOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleBlur = () => {
    onRename(id, tempName)
    setIsEditing(false)
  }

  const getSubtypeIcon = () => {
    if (subtype === 'image') return <ImageIcon size={28} />
    if (subtype === 'video') return <Film size={28} />
    if (subtype === 'audio') return <Music size={28} />
    if (subtype === 'folder') return <Folder size={28} />
    return <FileText size={28} />
  }

  return (
    <div
      draggable={!isEditing}
      onDragStart={(e) => onDragStart(e, id)}
      onDragOver={(e) => { e.preventDefault(); if (type === 'folder') setIsDragHover(true) }}
      onDragLeave={() => setIsDragHover(false)}
      onDrop={(e) => { setIsDragHover(false); onDropInto(e, id) }}
      onDoubleClick={() => type === 'folder' ? onOpen() : onPreview()}
      onClick={(e) => { e.stopPropagation(); onSelect(e) }}
      className={`media-item-group ${isSelected ? 'selected' : ''} ${isDragHover ? 'drag-over' : ''}`}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: 12, borderRadius: 20, cursor: 'pointer', position: 'relative',
        transition: 'all 0.2s',
        background: isSelected
          ? (isDarkMode ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.08)')
          : 'transparent',
      }}
    >
      {!isEditing && (
        <div className="item-menu-wrapper" ref={menuRef} style={{ position: 'absolute', top: 6, right: 6, zIndex: 30 }}>
          <button
            onClick={(e) => { e.stopPropagation(); setIsMenuOpen(!isMenuOpen) }}
            style={{
              width: 24, height: 24, borderRadius: 6, border: 'none',
              background: isMenuOpen ? (isDarkMode ? '#374151' : '#fff') : 'rgba(255,255,255,0.7)',
              backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', opacity: isMenuOpen ? 1 : 0,
              transition: 'opacity 0.15s'
            }}
          >
            <MoreHorizontal size={14} />
          </button>
          {isMenuOpen && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, mt: 6,
              width: 130, borderRadius: 16, boxShadow: '0 12px 32px rgba(0,0,0,0.15)',
              border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
              overflow: 'hidden', padding: '6px 0',
              background: isDarkMode ? '#1f2937' : '#fff',
              zIndex: 60
            }}>
              {[
                { icon: <Edit2 size={15} />, label: '重命名', action: () => { setIsEditing(true); setIsMenuOpen(false) } },
                { icon: <Share2 size={15} />, label: '分享', action: () => { onShare(); setIsMenuOpen(false) } },
                null,
                { icon: <Trash2 size={15} />, label: '删除', action: () => { onRemove(); setIsMenuOpen(false) }, danger: true },
                null,
                { icon: <Info size={15} />, label: '属性', action: () => { onShowProperties(); setIsMenuOpen(false) } },
              ].map((item, i) =>
                item === null
                  ? <div key={i} style={{ height: 1, background: isDarkMode ? '#374151' : '#f3f4f6', margin: '4px 0' }} />
                  : (
                    <button key={i} onClick={(e) => { e.stopPropagation(); item.action() }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                        padding: '8px 12px', border: 'none', background: 'none',
                        textAlign: 'left', fontSize: 13, cursor: 'pointer',
                        color: item.danger ? '#ef4444' : (isDarkMode ? '#e5e7eb' : '#374151'),
                        transition: 'background 0.1s'
                      }}>
                      {item.icon}<span>{item.label}</span>
                    </button>
                  )
              )}
            </div>
          )}
        </div>
      )}

      <div style={{
        width: 72, height: 72, marginBottom: 10, display: 'flex', alignItems: 'center',
        justifyContent: 'center', borderRadius: 14, overflow: 'hidden',
        boxShadow: '0 1px 4px rgba(0,0,0,0.08)', transition: 'transform 0.2s',
        background: type === 'folder'
          ? 'linear-gradient(135deg, #93c5fd 0%, #3b82f6 100%)'
          : (isDarkMode ? '#374151' : '#f3f4f6'),
        transform: isDragHover ? 'scale(1.05)' : undefined
      }}>
        {type === 'folder' ? (
          <Folder size={28} color="#fff" />
        ) : subtype === 'image' && url ? (
          <img src={url} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ color: subtype === 'video' ? '#3b82f6' : subtype === 'audio' ? '#38bdf8' : '#6b7280' }}>
            {getSubtypeIcon()}
          </span>
        )}
      </div>

      <div style={{ textAlign: 'center', width: '100%', padding: '0 4px' }}>
        {isEditing ? (
          <input
            value={tempName}
            onChange={(e) => setTempName(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={(e) => e.key === 'Enter' && handleBlur()}
            autoFocus
            style={{
              width: '100%', textAlign: 'center', fontSize: 12,
              background: isDarkMode ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.08)',
              border: '1.5px solid #3b82f6', borderRadius: 6, padding: '2px 6px',
              color: isDarkMode ? '#f9fafb' : '#111827', outline: 'none', fontWeight: 500
            }}
          />
        ) : (
          <p style={{
            fontSize: 12, fontWeight: 500, color: isDarkMode ? '#e5e7eb' : '#111827',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0
          }}>{name}</p>
        )}
      </div>
    </div>
  )
}

// === Main App ===
export default function App() {
  const [items, setItems] = useState([])
  const [currentFolderId, setCurrentFolderId] = useState(null)
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [isDraggingOverUpload, setIsDraggingOverUpload] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [previewItem, setPreviewItem] = useState(null)
  const [propertiesItem, setPropertiesItem] = useState(null)
  const [shareItem, setShareItem] = useState(null)
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false)
  const [downloadLink, setDownloadLink] = useState('')
  const [toasts, setToasts] = useState([])
  const [transfers, setTransfers] = useState([])
  const [isTransferPanelOpen, setIsTransferPanelOpen] = useState(false)
  const containerRef = useRef(null)
  const [draggedItemId, setDraggedItemId] = useState(null)
  const [copied, setCopied] = useState(false)
  const [nodeId, setNodeId] = useState('正在初始化 P2P 节点...')
  const [peerCount, setPeerCount] = useState(0)

  // S3-style path system
  const currentPath = currentFolderId || ''
  const allFolders = getUniqueFolders(items)
  const { folders, files } = getItemsForPath(items, allFolders, currentPath)

  const addToast = (message, type = 'info') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
  }

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  const addTransfer = (transfer) => {
    setTransfers(prev => [...prev, transfer])
  }

  const updateTransfer = (id, updates) => {
    setTransfers(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t))
  }

  const removeTransfer = (id) => {
    setTransfers(prev => prev.filter(t => t.id !== id))
  }

  const cancelTransfer = async (transfer) => {
    if (transfer.type === 'upload') {
      if (transfer.xhr) transfer.xhr.abort()
      removeTransfer(transfer.id)
    } else if (transfer.type === 'download') {
      removeTransfer(transfer.id)
      try {
        await fetch('/api/download/cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId: transfer.taskId })
        })
      } catch {}
      addToast('已取消下载', 'info')
    }
  }

  const getBreadcrumbs = () => {
    if (!currentPath) return []
    const parts = currentPath.split('/').filter(Boolean)
    const crumbs = []
    let acc = ''
    for (const part of parts) {
      acc += (acc ? '/' : '') + part
      crumbs.push({ name: part, path: acc })
    }
    return crumbs
  }

  const toggleDarkMode = () => setIsDarkMode(!isDarkMode)

  const handleShutdown = async () => {
    if (!confirm('确定要关闭服务吗？')) return
    try {
      await fetch('/api/shutdown', { method: 'POST' })
    } catch {}
    window.close()
  }

  const processFiles = async (files) => {
    const prefix = currentPath ? currentPath + '/' : ''

    for (const file of Array.from(files)) {
      const fileName = prefix + file.name
      const transferId = `up_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

      const transfer = {
        id: transferId,
        type: 'upload',
        fileName: file.name,
        status: 'uploading',
        progress: 0,
        loaded: 0,
        total: file.size,
        speed: 0,
        startTime: Date.now(),
        lastLoaded: 0,
        lastTime: Date.now(),
        xhr: null,
        taskId: null,
        error: null
      }
      addTransfer(transfer)
      if (file.size > 100 * 1024 * 1024) setIsTransferPanelOpen(true)

      try {
        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest()
          const formData = new FormData()
          formData.append('file', file, fileName)

          updateTransfer(transferId, { xhr })

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const now = Date.now()
              const percent = Math.round((e.loaded / e.total) * 100)
              setTransfers(prev => {
                const t = prev.find(x => x.id === transferId)
                if (!t) return prev
                const timeDiff = (now - t.lastTime) / 1000
                const bytesDiff = e.loaded - t.lastLoaded
                const speed = timeDiff > 0.3 ? bytesDiff / timeDiff : t.speed
                return prev.map(x => x.id === transferId ? {
                  ...x,
                  progress: percent,
                  loaded: e.loaded,
                  total: e.total,
                  speed: percent >= 100 ? 0 : speed,
                  lastLoaded: timeDiff > 0.3 ? e.loaded : x.lastLoaded,
                  lastTime: timeDiff > 0.3 ? now : x.lastTime,
                  status: percent >= 100 ? 'processing' : 'uploading'
                } : x)
              })
            }
          }

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve()
            } else {
              try {
                const err = JSON.parse(xhr.responseText)
                reject(new Error(err.error || 'Upload failed'))
              } catch {
                reject(new Error('Upload failed'))
              }
            }
          }

          xhr.onerror = () => reject(new Error('Network error'))
          xhr.onabort = () => reject(new Error('Upload cancelled'))

          xhr.open('POST', '/api/publish')
          xhr.send(formData)
        })

        // Transfer removed by WebSocket publish:success event
        // If WS event arrived before XHR onload, transfer is already gone
      } catch (err) {
        removeTransfer(transferId)
        if (err.message === 'Upload cancelled') {
          addToast(`已取消上传: ${file.name}`, 'info')
        } else {
          addToast(`上传失败: ${file.name} - ${err.message}`, 'error')
        }
      }
    }
  }

  const refreshFiles = async () => {
    try {
      const result = await API.listPublishedFiles()
      setItems(result || [])
    } catch (err) {
      console.error('获取文件列表失败:', err)
    }
  }

  const createNewFolder = () => {
    const name = prompt('请输入文件夹名称：')
    if (!name || !name.trim()) return
    const folderName = name.trim()
    const testFileName = currentPath ? `${currentPath}/${folderName}/.keep` : `${folderName}/.keep`
    const newItem = {
      id: '__virtual_' + Date.now(),
      parentId: currentFolderId,
      type: 'file',
      subtype: 'file',
      url: null,
      name: testFileName,
      size: '-',
      isVirtualFolder: true,
      folderName
    }
    setItems(prev => [newItem, ...prev])
    addToast('文件夹已创建，上传文件到此处即可保存', 'info')
  }

  const handleRename = async (id, newName) => {
    if (id.startsWith('__virtual_')) {
      setItems(prev => prev.map(item =>
        item.id === id ? { ...item, name: currentPath ? `${currentPath}/${newName}/.keep` : `${newName}/.keep`, isVirtualFolder: true } : item
      ))
      return
    }
    const file = items.find(i => i.cid === id)
    if (!file) return
    const { folder } = parseName(file.fileName)
    const newFileName = folder ? `${folder}/${newName}` : newName
    try {
      await API.deletePublishedFile(id)
      const blob = await fetch(API.getFileDownloadUrl(id)).then(r => r.blob())
      await API.publishFile(new File([blob], newFileName), newFileName)
      addToast('重命名成功', 'success')
      refreshFiles()
    } catch (err) {
      addToast('重命名失败: ' + err.message, 'error')
    }
  }

  const deleteSelected = async () => {
    const idsToRemove = [...selectedIds]
    for (const id of idsToRemove) {
      if (!id.startsWith('__')) {
        try { await API.deletePublishedFile(id) } catch {}
      }
    }
    setItems(prev => prev.filter(i => !idsToRemove.includes(i.cid || i.id)))
    setSelectedIds([])
    addToast('已删除', 'success')
  }

  const handleDownloadSharedFile = async () => {
    if (!downloadLink.trim()) return
    if (!downloadLink.startsWith('most://')) {
      addToast('链接格式应为 most://<cid>', 'warning')
      return
    }
    try {
      const result = await API.downloadFile(downloadLink)

      if (result.alreadyExists) {
        addToast('文件已存在', 'success')
        setDownloadLink('')
        setIsDownloadModalOpen(false)
        return
      }

      // Create download transfer record
      const transfer = {
        id: result.taskId,
        type: 'download',
        fileName: '等待连接...',
        status: 'connecting',
        progress: 0,
        loaded: 0,
        total: 0,
        speed: 0,
        startTime: Date.now(),
        lastLoaded: 0,
        lastTime: Date.now(),
        xhr: null,
        taskId: result.taskId,
        error: null
      }
      addTransfer(transfer)

      setDownloadLink('')
      setIsDownloadModalOpen(false)
      addToast('下载任务已开始', 'info')
    } catch (err) {
      addToast('下载失败: ' + err.message, 'error')
    }
  }

  const handleMouseDown = (e) => {
    if (e.target.closest('.media-item-group') || e.target.closest('button') || e.target.closest('input')) return
    const rect = containerRef.current.getBoundingClientRect()
    setSelectedIds([])
  }

  const onDragStart = (e, id) => {
    setDraggedItemId(id)
    if (!selectedIds.includes(id)) setSelectedIds([id])
    e.dataTransfer.effectAllowed = 'move'
  }

  const onDropIntoFolder = (e, targetId) => {
    e.preventDefault()
    e.stopPropagation()
    const movingIds = selectedIds.length > 0 ? selectedIds : [draggedItemId]
    if (movingIds.includes(targetId)) return

    const targetPath = targetId.replace('__folder_', '')
    const movingItems = items.filter(i => movingIds.includes(i.cid || i.id))

    const renamePromises = movingItems.map(async (item) => {
      const cid = item.cid
      if (!cid || cid.startsWith('__')) return
      const { name } = parseName(item.fileName)
      const newFileName = `${targetPath}/${name}`
      try {
        await API.deletePublishedFile(cid)
        const blob = await fetch(API.getFileDownloadUrl(cid)).then(r => r.blob())
        await API.publishFile(new File([blob], newFileName), newFileName)
      } catch {}
    })

    Promise.all(renamePromises).then(() => {
      setDraggedItemId(null)
      setSelectedIds([])
      setTimeout(refreshFiles, 500)
    })
  }

  const getShareLink = (item) => {
    if (!item) return ''
    return `most://${item.cid}`
  }

  const handleCopy = () => {
    if (!shareItem) return
    const linkToCopy = getShareLink(shareItem)
    navigator.clipboard.writeText(linkToCopy).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => addToast('复制失败', 'error'))
  }

  // WebSocket
  useEffect(() => {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${location.host}/ws`)
    ws.onmessage = (e) => {
      try {
        const { event, data } = JSON.parse(e.data)

        if (event === 'publish:success') {
          // Remove any upload transfer (matched by fileName prefix since publish doesn't carry taskId)
          setTransfers(prev => prev.filter(t => {
            if (t.type === 'upload') {
              // Remove the first upload transfer that's processing or uploading
              return t.status !== 'processing' && t.status !== 'uploading' ? true : false
            }
            return true
          }))
          addToast('文件发布成功!', 'success')
          refreshFiles()
        }

        if (event === 'download:progress') {
          const { taskId, loaded, total, percent } = data
          setTransfers(prev => {
            const t = prev.find(x => x.id === taskId)
            if (!t) return prev
            const now = Date.now()
            const timeDiff = (now - t.lastTime) / 1000
            const bytesDiff = loaded - t.lastLoaded
            const speed = timeDiff > 0.3 ? bytesDiff / timeDiff : t.speed
            return prev.map(x => x.id === taskId ? {
              ...x,
              progress: percent || 0,
              loaded: loaded || 0,
              total: total || 0,
              speed: timeDiff > 0.3 ? speed : x.speed,
              lastLoaded: timeDiff > 0.3 ? loaded : x.lastLoaded,
              lastTime: timeDiff > 0.3 ? now : x.lastTime
            } : x)
          })
        }

        if (event === 'download:status') {
          const { taskId, status, file } = data
          setTransfers(prev => prev.map(x => x.id === taskId ? {
            ...x,
            status: status || x.status,
            fileName: file || x.fileName
          } : x))
        }

        if (event === 'download:success') {
          const { taskId } = data
          removeTransfer(taskId)
          addToast('文件下载完成!', 'success')
          refreshFiles()
        }

        if (event === 'download:error') {
          const { taskId, error } = data
          removeTransfer(taskId)
          addToast('下载失败: ' + (error || '未知错误'), 'error')
        }

        if (event === 'download:cancelled') {
          const { taskId } = data
          removeTransfer(taskId)
        }

        if (event === 'network:status') {
          setPeerCount(data.peers || 0)
        }
      } catch {}
    }
    return () => ws.close()
  }, [])

  // Init
  useEffect(() => {
    const saved = localStorage.getItem('theme')
    if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      setIsDarkMode(true)
      document.documentElement.setAttribute('data-theme', 'dark')
    }

    // Fetch node ID
    API.getNodeId().then(result => {
      if (result.id) setNodeId(`P2P 节点 ID: ${result.id}`)
      else setNodeId('P2P 节点初始化失败')
    }).catch(() => setNodeId('P2P 节点初始化失败'))

    // Check network status on startup
    setPeerCount(-1) // indicate loading
    API.getNetworkStatus().then(status => {
      setPeerCount(status.peers || 0)
    }).catch(() => setPeerCount(0))

    refreshFiles()
  }, [])

  // Lucide icons
  useEffect(() => {
    if (window.lucide) window.lucide.createIcons()
  })

  const bgPrimary = isDarkMode ? '#030712' : '#f9fafb'
  const bgSecondary = isDarkMode ? '#111827' : '#ffffff'
  const bgTertiary = isDarkMode ? '#1f2937' : '#f3f4f6'
  const textPrimary = isDarkMode ? '#f9fafb' : '#111827'
  const textSecondary = isDarkMode ? '#9ca3af' : '#6b7280'
  const textMuted = isDarkMode ? '#6b7280' : '#d1d5db'
  const borderColor = isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'
  const accentBlue = isDarkMode ? '#60a5fa' : '#3b82f6'

  return (
    <div
      style={{ minHeight: '100vh', background: bgPrimary, color: textPrimary, transition: 'all 0.3s' }}
      onMouseDown={handleMouseDown}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-thumb { background: ${textMuted}; border-radius: 4px; }
        .media-item-group:hover .item-menu-wrapper button { opacity: 1 !important; }
        @keyframes toastSlideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 32px 16px; }
      `}</style>

      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px' }}>
        {/* Header */}
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em' }}>文件</h1>
          <div style={{ display: 'flex', gap: 8 }}>
            {transfers.length > 0 && (
              <button onClick={() => setIsTransferPanelOpen(true)} style={{
                width: 40, height: 40, borderRadius: '50%', border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', background: bgSecondary, position: 'relative',
                color: '#f59e0b', boxShadow: '0 1px 2px rgba(0,0,0,0.06)', transition: 'all 0.2s'
              }}>
                <ArrowUpDown size={20} style={{ animation: 'pulse 2s infinite' }} />
                <span style={{
                  position: 'absolute', top: -2, right: -2,
                  width: 18, height: 18, borderRadius: '50%',
                  background: '#ef4444', color: '#fff',
                  fontSize: 10, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  {transfers.length}
                </span>
              </button>
            )}
            <button onClick={createNewFolder} style={{
              width: 40, height: 40, borderRadius: '50%', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', background: bgSecondary,
              color: accentBlue, boxShadow: '0 1px 2px rgba(0,0,0,0.06)', transition: 'all 0.2s'
            }}>
              <FolderPlus size={20} />
            </button>
            <button onClick={toggleDarkMode} style={{
              width: 40, height: 40, borderRadius: '50%', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', background: bgSecondary,
              color: '#6366f1', boxShadow: '0 1px 2px rgba(0,0,0,0.06)', transition: 'all 0.2s'
            }}>
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button onClick={handleShutdown} title="关闭服务" style={{
              width: 40, height: 40, borderRadius: '50%', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', background: bgSecondary,
              color: '#ef4444', boxShadow: '0 1px 2px rgba(0,0,0,0.06)', transition: 'all 0.2s'
            }}>
              <Power size={20} />
            </button>
          </div>
        </header>

        {/* Peer info */}
        <div style={{ textAlign: 'center', fontSize: 12, color: textMuted, marginBottom: 8 }}>{nodeId}</div>
        <div style={{ textAlign: 'center', fontSize: 12, color: textMuted, marginBottom: 16 }}>
          {peerCount === -1 ? '网络状态: 检测中...' : peerCount > 0 ? `已连接 ${peerCount} 个节点` : '等待连接中...'}
        </div>

        {/* Upload / Download Zones */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 32 }}>
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDraggingOverUpload(true) }}
            onDragLeave={() => setIsDraggingOverUpload(false)}
            onDrop={(e) => { e.preventDefault(); setIsDraggingOverUpload(false); processFiles(e.dataTransfer.files) }}
            style={{
              border: `2px dashed ${isDraggingOverUpload ? '#3b82f6' : 'rgba(59,130,246,0.2)'}`,
              borderRadius: 20, padding: 20, textAlign: 'center', cursor: 'pointer',
              background: isDraggingOverUpload
                ? 'rgba(59,130,246,0.05)'
                : `linear-gradient(135deg, rgba(59,130,246,0.03) 0%, transparent 100%)`,
              transition: 'all 0.2s', position: 'relative', overflow: 'hidden'
            }}
          >
            <input
              type="file" multiple accept="image/*,video/*,audio/*"
              onChange={(e) => processFiles(e.target.files)}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', zIndex: 10 }}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, pointerEvents: 'none' }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(59,130,246,0.25)' }}>
                <Upload size={16} color="#fff" />
              </div>
              <span style={{ fontSize: 13, fontWeight: 500, color: accentBlue }}>点击或拖拽上传</span>
            </div>
          </div>

          <div
            onClick={() => setIsDownloadModalOpen(true)}
            style={{
              border: '2px dashed rgba(99,102,241,0.2)', borderRadius: 20, padding: 20,
              textAlign: 'center', cursor: 'pointer',
              background: 'linear-gradient(135deg, rgba(99,102,241,0.03) 0%, transparent 100%)',
              transition: 'all 0.2s'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, pointerEvents: 'none' }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(99,102,241,0.25)' }}>
                <Download size={16} color="#fff" />
              </div>
              <span style={{ fontSize: 13, fontWeight: 500, color: '#6366f1' }}>下载提取分享</span>
            </div>
          </div>
        </div>

        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: textMuted, marginBottom: 20, flexWrap: 'wrap' }}>
          <button onClick={() => setCurrentFolderId(null)} style={{ background: 'none', border: 'none', color: textMuted, cursor: 'pointer', padding: '2px 4px', borderRadius: 4 }}>全部内容</button>
          {getBreadcrumbs().map((crumb, i, arr) => (
            <React.Fragment key={crumb.path}>
              <ChevronRight size={12} style={{ opacity: 0.4 }} />
              {i === arr.length - 1
                ? <span style={{ color: textSecondary, fontWeight: 500 }}>{crumb.name}</span>
                : <button onClick={() => setCurrentFolderId(crumb.path)} style={{ background: 'none', border: 'none', color: textMuted, cursor: 'pointer', padding: '2px 4px', borderRadius: 4 }}>{crumb.name}</button>
              }
            </React.Fragment>
          ))}
        </div>

        {/* Content Grid */}
        <div ref={containerRef} style={{ position: 'relative', minHeight: 400 }}>
          {folders.length === 0 && files.length === 0 ? (
            <div style={{ textAlign: 'center', color: textMuted, padding: '64px 0', fontSize: 14 }}>暂无文件，点击上方区域上传</div>
          ) : (
            <div className="grid">
              {folders.map(folder => {
                const folderId = '__folder_' + folder.path
                return (
                  <MediaItem
                    key={folderId}
                    item={{ id: folderId, name: folder.name, type: 'folder', subtype: 'folder', path: folder.path }}
                    isSelected={selectedIds.includes(folderId)}
                    isDarkMode={isDarkMode}
                    onSelect={(e) => {
                      if (e.ctrlKey || e.metaKey) {
                        setSelectedIds(prev => prev.includes(folderId) ? prev.filter(i => i !== folderId) : [...prev, folderId])
                      } else {
                        setSelectedIds([folderId])
                      }
                    }}
                    onRemove={() => {
                      const toDelete = items.filter(i => parseName(i.fileName).folder.toLowerCase() === folder.path.toLowerCase())
                      if (toDelete.length > 0 && !confirm(`确定要删除文件夹中的 ${toDelete.length} 个文件吗？`)) return
                      toDelete.forEach(async (f) => { if (f.cid) try { await API.deletePublishedFile(f.cid) } catch {} })
                      setItems(prev => prev.filter(i => !toDelete.includes(i)))
                      addToast('已删除', 'success')
                    }}
                    onRename={handleRename}
                    onOpen={() => setCurrentFolderId(folder.path)}
                    onPreview={() => setCurrentFolderId(folder.path)}
                    onDragStart={(e, id) => onDragStart(e, id)}
                    onDropInto={(e, id) => onDropIntoFolder(e, id)}
                    onShowProperties={() => {
                      const filesIn = items.filter(i => parseName(i.fileName).folder.toLowerCase() === folder.path.toLowerCase())
                      setPropertiesItem({ name: folder.name, type: 'folder', subtype: 'folder', fileCount: filesIn.length })
                    }}
                    onShare={() => addToast('文件夹无法分享', 'info')}
                  />
                )
              })}
              {files.map(f => (
                <MediaItem
                  key={f.cid}
                  item={{
                    id: f.cid, name: parseName(f.fileName).name, type: 'file',
                    subtype: getFileSubtype(f.fileName), url: f.originalPath?.startsWith('http') ? f.originalPath : null,
                    cid: f.cid, link: f.link, size: null, publishedAt: f.publishedAt
                  }}
                  isSelected={selectedIds.includes(f.cid)}
                  isDarkMode={isDarkMode}
                  onSelect={(e) => {
                    if (e.ctrlKey || e.metaKey) {
                      setSelectedIds(prev => prev.includes(f.cid) ? prev.filter(i => i !== f.cid) : [...prev, f.cid])
                    } else {
                      setSelectedIds([f.cid])
                    }
                  }}
                  onRemove={() => {
                    if (!confirm('确定要删除该文件吗？')) return
                    API.deletePublishedFile(f.cid).then(() => {
                      setItems(prev => prev.filter(i => i.cid !== f.cid))
                      setSelectedIds(prev => prev.filter(i => i !== f.cid))
                      addToast('已删除', 'success')
                    }).catch(err => addToast('删除失败', 'error'))
                  }}
                  onRename={handleRename}
                  onOpen={() => {}}
                  onPreview={() => setPreviewItem({ ...f, subtype: getFileSubtype(f.fileName) })}
                  onDragStart={(e, id) => onDragStart(e, id)}
                  onDropInto={(e, id) => onDropIntoFolder(e, id)}
                  onShowProperties={() => setPropertiesItem({ ...f, name: parseName(f.fileName).name, subtype: getFileSubtype(f.fileName) })}
                  onShare={() => setShareItem(f)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Share Modal */}
      {shareItem && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          animation: 'fadeIn 0.2s ease'
        }} onClick={() => setShareItem(null)}>
          <div style={{
            width: 640, maxWidth: '100%', padding: 36, borderRadius: 24,
            background: isDarkMode ? '#111827' : '#fff',
            border: `1px solid ${borderColor}`, position: 'relative', animation: 'slideUp 0.25s ease'
          }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setShareItem(null)} style={{
              position: 'absolute', top: 16, right: 16, width: 32, height: 32, borderRadius: '50%',
              border: 'none', background: bgTertiary, display: 'flex', alignItems: 'center',
              justifyContent: 'center', cursor: 'pointer', color: textMuted
            }}><X size={18} /></button>

            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: accentBlue, boxShadow: '0 0 12px rgba(59,130,246,0.6)', animation: 'pulse 2s infinite' }} />
                <h3 style={{ fontSize: 18, fontWeight: 600 }}>分享链接已生成</h3>
              </div>
              <p style={{ fontSize: 13, color: textSecondary, lineHeight: 1.6 }}>复制下方链接，发送给好友。对方在网盘中使用"提取分享"功能即可一键转存。</p>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{
                flex: 1, padding: '14px 18px', borderRadius: 14, overflow: 'auto',
                background: bgTertiary, border: `1.5px solid ${borderColor}`, fontSize: 13, fontFamily: 'monospace',
                color: textPrimary, maxHeight: 60
              }}>
                {getShareLink(shareItem)}
              </div>
              <button onClick={handleCopy} style={{
                width: 48, borderRadius: 14, border: `1.5px solid ${borderColor}`,
                background: copied ? 'rgba(59,130,246,0.1)' : bgTertiary,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: copied ? accentBlue : textSecondary, transition: 'all 0.15s', flexShrink: 0
              }}>
                {copied ? <Check size={22} /> : <Copy size={22} />}
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: textMuted, marginTop: 16, fontWeight: 500 }}>
              <Info size={14} /><span>链接包含端对端元数据加密，仅限站内提取。</span>
            </div>
          </div>
        </div>
      )}

      {/* Download Modal */}
      {isDownloadModalOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 130, background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24
        }} onClick={() => setIsDownloadModalOpen(false)}>
          <div style={{
            width: 560, maxWidth: '100%', padding: 36, borderRadius: 24,
            background: isDarkMode ? '#111827' : '#fff',
            border: `1px solid ${borderColor}`, position: 'relative'
          }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setIsDownloadModalOpen(false)} style={{
              position: 'absolute', top: 16, right: 16, width: 32, height: 32, borderRadius: '50%',
              border: 'none', background: bgTertiary, display: 'flex', alignItems: 'center',
              justifyContent: 'center', cursor: 'pointer', color: textMuted
            }}><X size={18} /></button>

            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%', margin: '0 auto 16px',
                background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <Link size={28} color="#6366f1" />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>下载提取分享</h3>
              <p style={{ fontSize: 13, color: textSecondary }}>粘贴收到的分享链接，一键转存至当前目录</p>
            </div>

            <input
              type="text" value={downloadLink}
              onChange={(e) => setDownloadLink(e.target.value)}
              placeholder="在此粘贴分享链接，例如 most://..."
              onKeyDown={(e) => e.key === 'Enter' && handleDownloadSharedFile()}
              style={{
                width: '100%', padding: '16px 20px', borderRadius: 20, border: `1.5px solid ${borderColor}`,
                fontSize: 13, fontFamily: 'monospace', outline: 'none', marginBottom: 12,
                background: bgTertiary, color: textPrimary, transition: 'border-color 0.2s'
              }}
            />
            <button
              onClick={handleDownloadSharedFile}
              disabled={!downloadLink.trim()}
              style={{
                width: '100%', padding: 14, borderRadius: 20, border: 'none',
                background: downloadLink.trim() ? '#6366f1' : bgTertiary,
                color: downloadLink.trim() ? '#fff' : textMuted,
                fontSize: 14, fontWeight: 600, cursor: downloadLink.trim() ? 'pointer' : 'not-allowed',
                boxShadow: downloadLink.trim() ? '0 4px 16px rgba(99,102,241,0.3)' : 'none',
                transition: 'all 0.2s'
              }}
            >
              下载到此
            </button>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewItem && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.9)',
          backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24
        }} onClick={() => setPreviewItem(null)}>
          <button onClick={() => setPreviewItem(null)} style={{
            position: 'absolute', top: 24, right: 24, width: 40, height: 40, borderRadius: '50%',
            border: 'none', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', cursor: 'pointer', color: 'rgba(255,255,255,0.6)'
          }}><X size={24} /></button>
          <div onClick={e => e.stopPropagation()} style={{ maxWidth: '100%', maxHeight: '85vh' }}>
            {previewItem.subtype === 'image' && (
              <img src={previewItem.originalPath || API.getFileDownloadUrl(previewItem.cid)}
                alt={previewItem.name} style={{ maxWidth: '100%', maxHeight: '85vh', objectFit: 'contain', borderRadius: 20, boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }} />
            )}
            {previewItem.subtype === 'video' && (
              <video src={API.getFileDownloadUrl(previewItem.cid)} controls autoPlay
                style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: 20, boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }} />
            )}
            {previewItem.subtype === 'audio' && (
              <div style={{
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 24, padding: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24,
                backdropFilter: 'blur(16px)'
              }}>
                <div style={{
                  width: 80, height: 80, borderRadius: 20,
                  background: 'linear-gradient(135deg, #38bdf8 0%, #3b82f6 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 8px 32px rgba(59,130,246,0.4)'
                }}>
                  <Music size={40} color="#fff" />
                </div>
                <h3 style={{ color: '#fff', fontSize: 18, fontWeight: 600 }}>{previewItem.name}</h3>
                <audio src={API.getFileDownloadUrl(previewItem.cid)} controls autoPlay style={{ width: 320, borderRadius: 999 }} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Properties Modal */}
      {propertiesItem && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 110, background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24
        }} onClick={() => setPropertiesItem(null)}>
          <div style={{
            width: 340, padding: 28, borderRadius: 24, background: isDarkMode ? '#111827' : '#fff',
            border: `1px solid ${borderColor}`, position: 'relative'
          }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setPropertiesItem(null)} style={{
              position: 'absolute', top: 12, right: 12, width: 28, height: 28, borderRadius: '50%',
              border: 'none', background: bgTertiary, display: 'flex', alignItems: 'center',
              justifyContent: 'center', cursor: 'pointer', color: textMuted
            }}><X size={16} /></button>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>属性</h3>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {[
                { label: '名称', value: propertiesItem.name },
                { label: '类型', value: propertiesItem.type === 'folder' ? '文件夹' : propertiesItem.subtype },
                ...(propertiesItem.type === 'folder' && propertiesItem.fileCount !== undefined
                  ? [{ label: '文件数', value: propertiesItem.fileCount }]
                  : []),
                { label: '大小', value: propertiesItem.size || '-' },
                ...(propertiesItem.publishedAt
                  ? [{ label: '发布时间', value: new Date(propertiesItem.publishedAt).toLocaleString('zh-CN') }]
                  : []),
              ].map(row => (
                <div key={row.label} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '12px 0', borderBottom: `1px solid ${borderColor}`, fontSize: 13
                }}>
                  <span style={{ color: textMuted }}>{row.label}</span>
                  <span style={{ color: textPrimary, fontWeight: 500 }}>{row.value}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setPropertiesItem(null)} style={{
                padding: '8px 24px', borderRadius: 10, border: 'none',
                background: accentBlue, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer'
              }}>确定</button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Panel Modal */}
      {isTransferPanelOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 150, background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          animation: 'fadeIn 0.2s ease'
        }} onClick={() => setIsTransferPanelOpen(false)}>
          <div style={{
            width: 520, maxWidth: '100%', maxHeight: '70vh', padding: 28, borderRadius: 24,
            background: isDarkMode ? '#111827' : '#fff',
            border: `1px solid ${borderColor}`, position: 'relative',
            animation: 'slideUp 0.25s ease', display: 'flex', flexDirection: 'column'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 18, fontWeight: 600 }}>传输列表</h3>
              <button onClick={() => setIsTransferPanelOpen(false)} style={{
                width: 32, height: 32, borderRadius: '50%', border: 'none',
                background: bgTertiary, display: 'flex', alignItems: 'center',
                justifyContent: 'center', cursor: 'pointer', color: textMuted
              }}><X size={18} /></button>
            </div>

            <div style={{ flex: 1, overflow: 'auto' }}>
              {transfers.length === 0 ? (
                <div style={{ textAlign: 'center', color: textMuted, padding: '40px 0', fontSize: 14 }}>
                  当前没有传输任务
                </div>
              ) : (
                transfers.map(t => {
                  const speedStr = formatSpeed(t.speed)
                  const sizeStr = t.total > 0 ? `${formatSize(t.loaded)} / ${formatSize(t.total)}` : ''
                  const statusText =
                    t.status === 'uploading' ? '上传中' :
                    t.status === 'processing' ? '服务器处理中...' :
                    t.status === 'connecting' ? '连接中...' :
                    t.status === 'finding-peers' ? '正在搜索节点...' :
                    t.status === 'syncing' ? '正在同步...' :
                    t.status === 'downloading' ? '下载中' :
                    t.status === 'verifying' ? '验证完整性...' : ''
                  return (
                    <div key={t.id} style={{
                      padding: '14px 0', borderBottom: `1px solid ${borderColor}`,
                      display: 'flex', flexDirection: 'column', gap: 8
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                          {t.type === 'upload'
                            ? <Upload size={16} color={accentBlue} />
                            : <Download size={16} color="#6366f1" />}
                          <span style={{
                            fontSize: 13, fontWeight: 500, flex: 1, minWidth: 0,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                          }}>
                            {t.fileName}
                          </span>
                        </div>
                        <button onClick={() => cancelTransfer(t)} title="取消" style={{
                          width: 28, height: 28, borderRadius: '50%', border: 'none',
                          background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center',
                          justifyContent: 'center', cursor: 'pointer', color: '#ef4444',
                          flexShrink: 0, marginLeft: 8, transition: 'all 0.15s'
                        }}>
                          <X size={14} />
                        </button>
                      </div>
                      <div style={{
                        width: '100%', height: 6, borderRadius: 3,
                        background: isDarkMode ? '#374151' : '#e5e7eb', overflow: 'hidden'
                      }}>
                        <div style={{
                          width: `${t.progress}%`, height: '100%', borderRadius: 3,
                          background: t.type === 'upload'
                            ? 'linear-gradient(90deg, #3b82f6, #60a5fa)'
                            : 'linear-gradient(90deg, #6366f1, #818cf8)',
                          transition: 'width 0.3s ease'
                        }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: textMuted }}>
                        <span>
                          {statusText}
                          {t.progress > 0 && ` ${t.progress}%`}
                        </span>
                        <span>
                          {[speedStr, sizeStr].filter(Boolean).join(' · ')}
                        </span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toasts */}
      {toasts.map(t => <Toast key={t.id} message={t.message} type={t.type} onDone={() => removeToast(t.id)} />)}

      {/* Animations */}
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(12px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.5 } }
      `}</style>
    </div>
  )
}

function getFileSubtype(fileName) {
  const ext = fileName.split('.').pop().toLowerCase()
  const imgExts = ['jpg','jpeg','png','gif','webp','svg','bmp','ico','tiff','heic','heif']
  const vidExts = ['mp4','webm','mov','avi','mkv','flv','wmv','m4v','mpeg','3gp']
  const audExts = ['mp3','wav','ogg','flac','aac','m4a','wma','opus']
  if (imgExts.includes(ext)) return 'image'
  if (vidExts.includes(ext)) return 'video'
  if (audExts.includes(ext)) return 'audio'
  return 'file'
}
