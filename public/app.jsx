import React, { useState, useEffect, useRef } from 'react'
import {
  Upload, Sun, Moon, Image as ImageIcon, Trash2, Folder,
  FolderPlus, Film, Music, ChevronRight, FileText,
  X, Share2, Check, Copy, Download, ArrowRight, Power,
  ArrowUpDown, Star, Files, HardDrive, Search
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
  listPublishedFiles: () => API.fetch('/api/files'),
  listTrashFiles: () => API.fetch('/api/trash'),
  deletePublishedFile: (cid) => API.fetch(`/api/files/${cid}`, { method: 'DELETE' }),
  restoreTrashFile: (cid) => API.fetch(`/api/trash/${cid}/restore`, { method: 'POST' }),
  permanentDeleteTrashFile: (cid) => API.fetch(`/api/trash/${cid}`, { method: 'DELETE' }),
  emptyTrash: () => API.fetch('/api/trash', { method: 'DELETE' }),
  toggleStar: (cid) => API.fetch(`/api/files/${cid}/star`, { method: 'POST' }),
  getStorageStats: () => API.fetch('/api/storage'),
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
  getFileDownloadUrl: (cid) => `/api/files/${cid}/download`,
  moveFile: (cid, newFileName) => API.fetch('/api/move', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cid, newFileName })
  })
}

// === Helpers ===
function formatSize(bytes) {
  if (!bytes || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatDate(dateString) {
  if (!dateString) return ''
  return new Date(dateString).toLocaleDateString('zh-CN')
}

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
  return {
    folders: getCurrentFolders(allFolders, currentPath),
    files: files.filter(f => parseName(f.fileName).folder === currentPath)
  }
}

function getFileSubtype(fileName) {
  const ext = fileName.split('.').pop().toLowerCase()
  const imgExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff', 'heic', 'heif']
  const vidExts = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'flv', 'wmv', 'm4v', 'mpeg', '3gp']
  const audExts = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus']
  if (imgExts.includes(ext)) return 'image'
  if (vidExts.includes(ext)) return 'video'
  if (audExts.includes(ext)) return 'audio'
  return 'file'
}

// === Toast ===
function Toast({ message, type, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000)
    return () => clearTimeout(t)
  }, [])
  const colors = { success: '#22c55e', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6' }
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      background: colors[type] || colors.info, color: '#fff',
      padding: '12px 20px', borderRadius: 12, fontSize: 13, fontWeight: 500,
      boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
      animation: 'toastSlideIn 0.2s ease'
    }}>
      {message}
    </div>
  )
}

// === File Card ===
function FileCard({ file, isSelected, isDarkMode, onSelect, onPreview }) {
  const bgSecondary = isDarkMode ? '#1e293b' : '#ffffff'
  const accentBlue = isDarkMode ? '#60a5fa' : '#3b82f6'
  const borderColor = isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'

  return (
    <div
      data-id={file.cid}
      onClick={() => onSelect(file.cid)}
      onDoubleClick={() => onPreview(file)}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: 16, borderRadius: 12, cursor: 'pointer',
        background: isSelected ? accentBlue + '15' : bgSecondary,
        border: `1px solid ${isSelected ? accentBlue : borderColor}`,
        transition: 'all 0.15s'
      }}
    >
      <div style={{
        width: 56, height: 56, borderRadius: 12, marginBottom: 10,
        background: file.starred ? 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)' : 'linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        {getFileSubtype(file.fileName) === 'image' && <ImageIcon size={24} color="#fff" />}
        {getFileSubtype(file.fileName) === 'video' && <Film size={24} color="#fff" />}
        {getFileSubtype(file.fileName) === 'audio' && <Music size={24} color="#fff" />}
        {!['image', 'video', 'audio'].includes(getFileSubtype(file.fileName)) && <FileText size={24} color="#fff" />}
      </div>
      <p style={{
        fontSize: 12, fontWeight: 500, textAlign: 'center', maxWidth: '100%',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        color: isDarkMode ? '#e5e7eb' : '#111827'
      }}>
        {parseName(file.fileName).name}
      </p>
    </div>
  )
}

// === Folder Card ===
function FolderCard({ folder, isDarkMode, onClick }) {
  const bgSecondary = isDarkMode ? '#1e293b' : '#ffffff'
  const borderColor = isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: 16, borderRadius: 12, cursor: 'pointer',
        background: bgSecondary,
        border: `1px solid ${borderColor}`,
        transition: 'all 0.15s'
      }}
    >
      <div style={{
        width: 56, height: 56, borderRadius: 12, marginBottom: 10,
        background: 'linear-gradient(135deg, #818cf8 0%, #6366f1 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        <Folder size={28} color="#fff" />
      </div>
      <p style={{
        fontSize: 12, fontWeight: 500, textAlign: 'center', maxWidth: '100%',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        color: isDarkMode ? '#e5e7eb' : '#111827'
      }}>
        {folder.name}
      </p>
    </div>
  )
}

// === Move Modal ===
function MoveModal({ items, allFolders, currentPath, isDarkMode, onMove, onClose }) {
  const [targetPath, setTargetPath] = useState('')
  const bgSecondary = isDarkMode ? '#1e293b' : '#ffffff'
  const bgTertiary = isDarkMode ? '#334155' : '#f1f5f9'
  const textPrimary = isDarkMode ? '#f8fafc' : '#0f172a'
  const textSecondary = isDarkMode ? '#94a3b8' : '#64748b'
  const borderColor = isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'
  const accentBlue = isDarkMode ? '#60a5fa' : '#3b82f6'

  const breadcrumbParts = targetPath ? [
    { path: '', name: '全部内容' },
    ...targetPath.split('/').filter(Boolean).map((part, i, arr) => ({
      path: arr.slice(0, i + 1).join('/'),
      name: part
    }))
  ] : [{ path: '', name: '全部内容' }]

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ width: 400, padding: 24, borderRadius: 16, background: bgSecondary, border: `1px solid ${borderColor}` }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600 }}>移动到</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: textSecondary }}><X size={18} /></button>
        </div>
        <p style={{ fontSize: 12, color: textSecondary, marginBottom: 12 }}>已选 {items.length} 个项目</p>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          {breadcrumbParts.map((part, i) => (
            <React.Fragment key={part.path}>
              {i > 0 && <span style={{ color: textSecondary }}>/</span>}
              <button
                key={part.path}
                onClick={() => setTargetPath(part.path)}
                style={{
                  padding: '4px 8px', borderRadius: 6, border: 'none',
                  background: targetPath === part.path ? accentBlue + '20' : bgTertiary,
                  color: targetPath === part.path ? accentBlue : textSecondary,
                  cursor: 'pointer', fontSize: 12
                }}
              >
                {part.name}
              </button>
            </React.Fragment>
          ))}
        </div>
        <div style={{ maxHeight: 200, overflow: 'auto', marginBottom: 16 }}>
          {allFolders.filter(f => f.path.startsWith(targetPath + (targetPath ? '/' : ''))).length === 0 && targetPath !== '' && (
            <p style={{ fontSize: 12, color: textSecondary, textAlign: 'center', padding: 16 }}>该目录下没有子文件夹</p>
          )}
          {allFolders.filter(f => f.path.startsWith(targetPath + (targetPath ? '/' : ''))).map(folder => (
            <button
              key={folder.path}
              onClick={() => setTargetPath(folder.path)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px',
                borderRadius: 8, border: 'none', background: 'transparent',
                cursor: 'pointer', color: textPrimary, fontSize: 13
              }}
            >
              <Folder size={16} color="#6366f1" />
              <span>{folder.name}</span>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 10, borderRadius: 8, border: `1px solid ${borderColor}`, background: 'transparent', cursor: 'pointer', fontSize: 13 }}>取消</button>
          <button
            onClick={() => onMove(targetPath)}
            disabled={targetPath === currentPath}
            style={{
              flex: 1, padding: 10, borderRadius: 8, border: 'none',
              background: targetPath === currentPath ? bgTertiary : accentBlue,
              color: targetPath === currentPath ? textSecondary : '#fff',
              cursor: targetPath === currentPath ? 'not-allowed' : 'pointer',
              fontSize: 13, fontWeight: 500
            }}
          >
            移动
          </button>
        </div>
      </div>
    </div>
  )
}

// === Main App ===
export default function App() {
  const [items, setItems] = useState([])
  const [trashItems, setTrashItems] = useState([])
  const [currentFolderId, setCurrentFolderId] = useState(null)
  const [currentView, setCurrentView] = useState('all')
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [isDraggingOverUpload, setIsDraggingOverUpload] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [previewItem, setPreviewItem] = useState(null)
  const [shareItem, setShareItem] = useState(null)
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false)
  const [downloadLink, setDownloadLink] = useState('')
  const [toasts, setToasts] = useState([])
  const [transfers, setTransfers] = useState([])
  const [isTransferPanelOpen, setIsTransferPanelOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [copied, setCopied] = useState(false)
  const [peerCount, setPeerCount] = useState(0)
  const [storageStats, setStorageStats] = useState({ total: 0, used: 0, free: 0 })
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false)

  const currentPath = currentFolderId || ''
  const allFolders = getUniqueFolders(items)
  const { folders, files } = getItemsForPath(items, allFolders, currentPath)

  const filteredFiles = searchQuery
    ? items.filter(f => parseName(f.fileName).name.toLowerCase().includes(searchQuery.toLowerCase()))
    : files

  const addToast = (message, type = 'info') => setToasts(prev => [...prev, { id: Date.now(), message, type }])
  const removeToast = (id) => setToasts(prev => prev.filter(t => t.id !== id))

  const refreshFiles = async () => {
    try { setItems(await API.listPublishedFiles() || []) }
    catch (err) { console.error(err) }
  }
  const refreshTrash = async () => {
    try { setTrashItems(await API.listTrashFiles() || []) }
    catch (err) { console.error(err) }
  }
  const refreshStorageStats = async () => {
    try { setStorageStats(await API.getStorageStats()) }
    catch (err) { console.error(err) }
  }

  const handleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  }

  const handleDelete = async (id) => {
    if (!confirm('确定要删除吗？')) return
    try {
      await API.deletePublishedFile(id)
      setSelectedIds(prev => prev.filter(i => i !== id))
      addToast('已删除', 'success')
      refreshFiles()
      refreshTrash()
      refreshStorageStats()
    } catch { addToast('删除失败', 'error') }
  }

  const handleFolderDelete = async (folder) => {
    const toDelete = items.filter(i => parseName(i.fileName).folder.toLowerCase() === folder.path.toLowerCase())
    if (toDelete.length > 0 && !confirm(`确定要删除文件夹中的 ${toDelete.length} 个文件吗？`)) return
    try {
      for (const f of toDelete) { if (f.cid) await API.deletePublishedFile(f.cid) }
      addToast('已删除', 'success')
      refreshFiles()
      refreshTrash()
      refreshStorageStats()
    } catch { addToast('删除失败', 'error') }
  }

  const handlePermanentDelete = async (cid) => {
    if (!confirm('确定要永久删除吗？此操作不可恢复！')) return
    try {
      await API.permanentDeleteTrashFile(cid)
      addToast('已永久删除', 'success')
      refreshTrash()
      refreshStorageStats()
    } catch { addToast('删除失败', 'error') }
  }

  const handleRestore = async (cid) => {
    try {
      await API.restoreTrashFile(cid)
      addToast('已恢复', 'success')
      refreshFiles()
      refreshTrash()
      refreshStorageStats()
    } catch { addToast('恢复失败', 'error') }
  }

  const handleEmptyTrash = async () => {
    if (!confirm('确定要清空回收站吗？此操作不可恢复！')) return
    try {
      await API.emptyTrash()
      addToast('回收站已清空', 'success')
      refreshTrash()
      refreshStorageStats()
    } catch { addToast('清空失败', 'error') }
  }

  const handleToggleStar = async (cid) => {
    try {
      const result = await API.toggleStar(cid)
      setItems(prev => prev.map(i => i.cid === cid ? { ...i, starred: result.starred } : i))
      addToast(result.starred ? '已收藏' : '已取消收藏', 'success')
    } catch { addToast('操作失败', 'error') }
  }

  const handleBatchDelete = async () => {
    if (!confirm(`确定要删除选中的 ${selectedIds.length} 个项目吗？`)) return
    try {
      for (const id of selectedIds) { if (!id.startsWith('__')) await API.deletePublishedFile(id) }
      setSelectedIds([])
      addToast('已删除', 'success')
      refreshFiles()
      refreshTrash()
      refreshStorageStats()
    } catch { addToast('删除失败', 'error') }
  }

  const handleMove = async (targetPath) => {
    try {
      for (const id of selectedIds) {
        const file = items.find(i => i.cid === id)
        if (!file) continue
        const { name } = parseName(file.fileName)
        const newFileName = targetPath ? `${targetPath}/${name}` : name
        if (file.fileName !== newFileName) {
          await API.moveFile(id, newFileName)
        }
      }
      setSelectedIds([])
      setIsMoveModalOpen(false)
      addToast('已移动', 'success')
      refreshFiles()
    } catch { addToast('移动失败', 'error') }
  }

  const processFiles = async (files) => {
    const prefix = currentPath ? currentPath + '/' : ''
    for (const file of Array.from(files)) {
      const fileName = prefix + file.name
      if (items.some(i => i.fileName === fileName)) {
        addToast(`${file.name} 已存在`, 'warning')
        continue
      }
      try {
        await API.publishFile(file, fileName)
        addToast(`${file.name} 上传成功`, 'success')
      } catch { addToast(`上传失败: ${file.name}`, 'error') }
    }
    refreshFiles()
    refreshStorageStats()
  }

  const createNewFolder = async () => {
    const name = prompt('请输入文件夹名称：')
    if (!name?.trim()) return

    const folderPath = name.trim()
    const exists = items.some(f =>
      f.fileName === folderPath ||
      f.fileName.startsWith(folderPath + '/')
    )
    if (exists) {
      addToast('文件夹已存在', 'warning')
      return
    }

    try {
      const randomContent = Math.random().toString(36).substring(2, 10)
      const content = new File([randomContent], 'hello.txt', { type: 'text/plain' })
      await API.publishFile(content, `${folderPath}/hello.txt`)
      addToast('文件夹已创建', 'success')
      refreshFiles()
    } catch { addToast('创建失败', 'error') }
  }

  const handleCopyLink = () => {
    navigator.clipboard.writeText(`most://${shareItem.cid}`).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const handleDownloadSharedFile = async () => {
    if (!downloadLink.trim() || !downloadLink.startsWith('most://')) {
      addToast('链接格式应为 most://<cid>', 'warning')
      return
    }
    try {
      await API.downloadFile(downloadLink)
      setDownloadLink('')
      setIsDownloadModalOpen(false)
      addToast('下载已开始', 'info')
    } catch { addToast('下载失败', 'error') }
  }

  const handleNavigate = (path) => {
    setCurrentFolderId(path || null)
    setSelectedIds([])
  }

  // WebSocket
  useEffect(() => {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${location.host}/ws`)
    ws.onmessage = (e) => {
      try {
        const { event } = JSON.parse(e.data)
        if (event === 'publish:success' || event === 'download:success') {
          refreshFiles()
          refreshStorageStats()
          if (event === 'download:success') addToast('下载完成', 'success')
        }
      } catch { }
    }
    return () => ws.close()
  }, [])

  // Init
  useEffect(() => {
    const saved = localStorage.getItem('theme')
    if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      setIsDarkMode(true)
    }
    refreshFiles()
    refreshTrash()
    refreshStorageStats()
    API.getStorageStats().then(s => setStorageStats(s)).catch(() => { })
  }, [])

  // Theme colors
  const bgPrimary = isDarkMode ? '#0f172a' : '#f8fafc'
  const bgSecondary = isDarkMode ? '#1e293b' : '#ffffff'
  const bgTertiary = isDarkMode ? '#334155' : '#f1f5f9'
  const textPrimary = isDarkMode ? '#f8fafc' : '#0f172a'
  const textSecondary = isDarkMode ? '#94a3b8' : '#64748b'
  const textMuted = isDarkMode ? '#64748b' : '#94a3b8'
  const borderColor = isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'
  const accentBlue = isDarkMode ? '#60a5fa' : '#3b82f6'

  const viewTitle = currentView === 'all' ? '全部内容' : currentView === 'starred' ? '收藏' : '回收站'
  const displayFiles = currentView === 'all' ? filteredFiles : currentView === 'starred' ? items.filter(i => i.starred) : []

  // Breadcrumb parts
  const breadcrumbParts = currentPath ? [
    { path: '', name: '全部内容' },
    ...currentPath.split('/').filter(Boolean).map((part, i, arr) => ({
      path: arr.slice(0, i + 1).join('/'),
      name: part
    }))
  ] : []

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: bgPrimary, color: textPrimary }}>
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-thumb { background: ${textMuted}; border-radius: 4px; }
        @keyframes toastSlideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      `}</style>

      {/* Sidebar */}
      <div style={{ width: 200, background: bgTertiary, display: 'flex', flexDirection: 'column', borderRight: `1px solid ${borderColor}`, flexShrink: 0 }}>
        <div style={{ padding: '20px 16px', borderBottom: `1px solid ${borderColor}` }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: accentBlue }}>Most.Box</h1>
        </div>
        <nav style={{ padding: '12px 8px', flex: 1 }}>
          {[{ id: 'all', icon: <Files size={18} />, label: '全部内容' }, { id: 'starred', icon: <Star size={18} />, label: '收藏' }, { id: 'trash', icon: <Trash2 size={18} />, label: '回收站' }].map(item => (
            <button
              key={item.id}
              onClick={() => { setCurrentView(item.id); setCurrentFolderId(null); setSelectedIds([]); setSearchQuery('') }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                marginBottom: 4, background: currentView === item.id ? accentBlue + '20' : 'transparent',
                color: currentView === item.id ? accentBlue : textSecondary,
                fontWeight: currentView === item.id ? 600 : 500, fontSize: 13
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div style={{ padding: '12px 16px', borderTop: `1px solid ${borderColor}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <HardDrive size={14} color={textSecondary} />
            <span style={{ fontSize: 11, color: textSecondary }}>存储空间</span>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: bgSecondary, overflow: 'hidden' }}>
            <div style={{ width: `${storageStats.total > 0 ? (storageStats.used / storageStats.total) * 100 : 0}%`, height: '100%', background: accentBlue, transition: 'width 0.3s' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: textSecondary, marginTop: 4 }}>
            <span>{formatSize(storageStats.used)}</span>
            <span>{storageStats.total > 0 ? formatSize(storageStats.total) : '-'}</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Header */}
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: `1px solid ${borderColor}`, background: bgSecondary, gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600 }}>{viewTitle}</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 12, background: bgTertiary, fontSize: 11, color: textSecondary }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: peerCount > 0 ? '#22c55e' : '#f59e0b' }} />
              {peerCount > 0 ? `${peerCount} 节点` : '等待连接'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {currentView !== 'trash' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 8, background: bgTertiary, border: `1px solid ${borderColor}` }}>
                <Search size={14} color={textSecondary} />
                <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="搜索..." style={{ background: 'none', border: 'none', outline: 'none', fontSize: 12, color: textPrimary, width: 120 }} />
                {searchQuery && <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: textSecondary, padding: 0 }}><X size={12} /></button>}
              </div>
            )}
            {currentView === 'trash' && trashItems.length > 0 && (
              <button onClick={handleEmptyTrash} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                清空回收站
              </button>
            )}
            <button onClick={() => setIsTransferPanelOpen(true)} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: bgTertiary, cursor: 'pointer', color: textSecondary, position: 'relative' }}>
              <ArrowUpDown size={16} />
              {transfers.length > 0 && <span style={{ position: 'absolute', top: -4, right: -4, width: 14, height: 14, borderRadius: '50%', background: '#ef4444', color: '#fff', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{transfers.length}</span>}
            </button>
            <button onClick={createNewFolder} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: bgTertiary, cursor: 'pointer', color: accentBlue }}>
              <FolderPlus size={16} />
            </button>
            <button onClick={() => setIsDarkMode(!isDarkMode)} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: bgTertiary, cursor: 'pointer', color: '#6366f1' }}>
              {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </header>

        {/* Upload/Download */}
        {currentView === 'all' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '16px 24px', position: 'relative' }}>
            <div onDragOver={(e) => { e.preventDefault(); setIsDraggingOverUpload(true) }} onDragLeave={() => setIsDraggingOverUpload(false)} onDrop={(e) => { e.preventDefault(); setIsDraggingOverUpload(false); processFiles(e.dataTransfer.files) }} style={{ border: `2px dashed ${isDraggingOverUpload ? '#3b82f6' : 'rgba(59,130,246,0.2)'}`, borderRadius: 12, padding: 20, textAlign: 'center', cursor: 'pointer', background: isDraggingOverUpload ? 'rgba(59,130,246,0.05)' : 'transparent', position: 'relative' }}>
              <input type="file" multiple onChange={(e) => processFiles(e.target.files)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', zIndex: 1 }} />
              <Upload size={20} color={accentBlue} style={{ marginBottom: 8 }} />
              <p style={{ fontSize: 12, color: accentBlue, fontWeight: 500 }}>拖拽文件到此处上传</p>
            </div>
            <div onClick={() => setIsDownloadModalOpen(true)} style={{ border: '2px dashed rgba(99,102,241,0.2)', borderRadius: 12, padding: 20, textAlign: 'center', cursor: 'pointer' }}>
              <Download size={20} color="#6366f1" style={{ marginBottom: 8 }} />
              <p style={{ fontSize: 12, color: '#6366f1', fontWeight: 500 }}>提取分享链接</p>
            </div>
          </div>
        )}

        {/* Breadcrumb */}
        {currentView === 'all' && currentPath && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 24px 12px', fontSize: 12 }}>
            <button onClick={() => handleNavigate('')} style={{ background: 'none', border: 'none', color: textMuted, cursor: 'pointer' }}>全部内容</button>
            {breadcrumbParts.slice(1).map((part, i) => (
              <React.Fragment key={part.path}>
                <ChevronRight size={12} color={textMuted} />
                <button onClick={() => handleNavigate(part.path)} style={{ background: 'none', border: 'none', color: i === breadcrumbParts.length - 2 ? textSecondary : textMuted, cursor: 'pointer' }}>{part.name}</button>
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Content Grid */}
        <div style={{ flex: 1, padding: '0 24px 24px', overflow: 'auto' }}>
          {/* Trash View */}
          {currentView === 'trash' && (
            trashItems.length === 0 ? (
              <div style={{ textAlign: 'center', color: textMuted, padding: 48, fontSize: 13 }}>回收站是空的</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 16 }}>
                {trashItems.map(f => (
                  <div key={f.cid} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 16, borderRadius: 12, background: bgSecondary, border: `1px solid ${borderColor}`, position: 'relative' }}>
                    <div style={{ width: 56, height: 56, borderRadius: 12, marginBottom: 10, background: 'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <FileText size={24} color="#fff" />
                    </div>
                    <p style={{ fontSize: 12, fontWeight: 500, textAlign: 'center', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{parseName(f.fileName).name}</p>
                    <p style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>删除于 {formatDate(f.deletedAt)}</p>
                    <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                      <button onClick={() => handleRestore(f.cid)} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#22c55e', color: '#fff', fontSize: 11, cursor: 'pointer' }}>恢复</button>
                      <button onClick={() => handlePermanentDelete(f.cid)} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#ef4444', color: '#fff', fontSize: 11, cursor: 'pointer' }}>删除</button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {/* All/Starred View */}
          {currentView !== 'trash' && (
            displayFiles.length === 0 && folders.length === 0 ? (
              <div style={{ textAlign: 'center', color: textMuted, padding: 48, fontSize: 13 }}>
                {searchQuery ? '未找到相关文件' : (currentView === 'starred' ? '暂无收藏' : '暂无文件')}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 16 }}>
                {folders.map(folder => (
                  <FolderCard key={folder.path} folder={folder} isDarkMode={isDarkMode} onClick={() => handleNavigate(folder.path)} />
                ))}
                {displayFiles.map(f => (
                  <FileCard key={f.cid} file={f} isSelected={selectedIds.includes(f.cid)} isDarkMode={isDarkMode} onSelect={handleSelect} onPreview={(file) => setPreviewItem({ ...file, subtype: getFileSubtype(file.fileName) })} />
                ))}
              </div>
            )
          )}
        </div>
      </div>



      {/* Move Modal */}
      {isMoveModalOpen && (
        <MoveModal
          items={selectedIds.map(id => items.find(i => i.cid === id)).filter(Boolean)}
          allFolders={allFolders.map(path => ({ path, name: path.split('/').pop() }))}
          currentPath={currentPath}
          isDarkMode={isDarkMode}
          onMove={handleMove}
          onClose={() => setIsMoveModalOpen(false)}
        />
      )}

      {/* Share Modal */}
      {shareItem && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShareItem(null)}>
          <div style={{ width: 440, padding: 28, borderRadius: 16, background: bgSecondary, border: `1px solid ${borderColor}` }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600 }}>分享链接</h3>
              <button onClick={() => setShareItem(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: textMuted }}><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1, padding: '12px 14px', borderRadius: 10, background: bgTertiary, fontSize: 13, fontFamily: 'monospace', color: textPrimary }}>most://{shareItem.cid}</div>
              <button onClick={handleCopyLink} style={{ width: 44, borderRadius: 10, border: 'none', background: copied ? '#22c55e' : accentBlue, color: '#fff', cursor: 'pointer' }}>
                {copied ? <Check size={18} /> : <Copy size={18} />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Download Modal */}
      {isDownloadModalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setIsDownloadModalOpen(false)}>
          <div style={{ width: 400, padding: 28, borderRadius: 16, background: bgSecondary, border: `1px solid ${borderColor}` }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600 }}>提取分享</h3>
              <button onClick={() => setIsDownloadModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: textMuted }}><X size={18} /></button>
            </div>
            <input type="text" value={downloadLink} onChange={(e) => setDownloadLink(e.target.value)} placeholder="most://..." onKeyDown={(e) => e.key === 'Enter' && handleDownloadSharedFile()} style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: `1.5px solid ${borderColor}`, fontSize: 13, fontFamily: 'monospace', outline: 'none', background: bgTertiary, color: textPrimary, marginBottom: 12 }} />
            <button onClick={handleDownloadSharedFile} disabled={!downloadLink.trim()} style={{ width: '100%', padding: 12, borderRadius: 10, border: 'none', background: downloadLink.trim() ? '#6366f1' : bgTertiary, color: downloadLink.trim() ? '#fff' : textMuted, fontSize: 13, fontWeight: 600, cursor: downloadLink.trim() ? 'pointer' : 'not-allowed' }}>
              转存
            </button>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewItem && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={() => setPreviewItem(null)}>
          <button onClick={() => setPreviewItem(null)} style={{ position: 'absolute', top: 20, right: 20, width: 36, height: 36, borderRadius: 10, border: 'none', background: 'rgba(255,255,255,0.1)', cursor: 'pointer', color: '#fff' }}><X size={20} /></button>
          <div onClick={e => e.stopPropagation()}>
            {previewItem.subtype === 'image' && <img src={API.getFileDownloadUrl(previewItem.cid)} alt="" style={{ maxWidth: '100%', maxHeight: '80vh', borderRadius: 12 }} />}
            {previewItem.subtype === 'video' && <video src={API.getFileDownloadUrl(previewItem.cid)} controls style={{ maxWidth: '100%', maxHeight: '80vh', borderRadius: 12 }} />}
            {previewItem.subtype === 'audio' && <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 32 }}><Music size={48} color="#fff" style={{ marginBottom: 12 }} /><audio src={API.getFileDownloadUrl(previewItem.cid)} controls /></div>}
          </div>
        </div>
      )}

      {/* Batch Actions Bar */}
      {selectedIds.length > 0 && currentView !== 'trash' && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 12, background: bgSecondary, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', border: `1px solid ${borderColor}`, zIndex: 100 }}>
          <span style={{ fontSize: 12, color: textSecondary }}>已选 {selectedIds.length} 项</span>
          <button onClick={() => setSelectedIds([])} style={{ background: 'none', border: 'none', cursor: 'pointer', color: textMuted, padding: 4 }}><X size={16} /></button>
          <div style={{ width: 1, height: 20, background: borderColor }} />
          <button onClick={() => {
            const hasUnstarred = selectedIds.some(id => {
              const item = items.find(i => i.cid === id)
              return item && !item.starred
            })
            selectedIds.forEach(id => {
              const item = items.find(i => i.cid === id)
              if (item && (hasUnstarred ? !item.starred : item.starred)) {
                handleToggleStar(id)
              }
            })
          }} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8, border: 'none', background: '#f59e0b', color: '#fff', fontSize: 12, cursor: 'pointer' }}>
            收藏
          </button>
          <button onClick={() => setIsMoveModalOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8, border: 'none', background: accentBlue, color: '#fff', fontSize: 12, cursor: 'pointer' }}>
            移动
          </button>
          <button onClick={handleBatchDelete} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff', fontSize: 12, cursor: 'pointer' }}>删除</button>
          <button onClick={() => setShareItem(items.find(i => i.cid === selectedIds[0]))} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: bgTertiary, color: textPrimary, fontSize: 12, cursor: 'pointer' }}>分享</button>
        </div>
      )}

      {/* Transfer Panel */}
      {isTransferPanelOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setIsTransferPanelOpen(false)}>
          <div style={{ width: 400, maxHeight: '70vh', padding: 24, borderRadius: 16, background: bgSecondary, border: `1px solid ${borderColor}`, overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600 }}>传输</h3>
              <button onClick={() => setIsTransferPanelOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: textMuted }}><X size={18} /></button>
            </div>
            {transfers.length === 0 ? (
              <div style={{ textAlign: 'center', color: textMuted, padding: 24 }}>暂无传输</div>
            ) : (
              transfers.map(t => (
                <div key={t.id} style={{ padding: '10px 0', borderBottom: `1px solid ${borderColor}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    {t.type === 'upload' ? <Upload size={14} color={accentBlue} /> : <Download size={14} color="#6366f1" />}
                    <span style={{ fontSize: 12, fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.fileName}</span>
                    <span style={{ fontSize: 11, color: textMuted }}>{t.progress}%</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: bgTertiary }}>
                    <div style={{ width: `${t.progress}%`, height: '100%', borderRadius: 2, background: t.type === 'upload' ? accentBlue : '#6366f1' }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Toasts */}
      {toasts.map(t => <Toast key={t.id} message={t.message} type={t.type} onDone={() => removeToast(t.id)} />)}
    </div>
  )
}
