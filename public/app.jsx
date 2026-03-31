import React, { useState, useEffect, useRef } from 'react'
import {
  Upload, Sun, Moon, Image as ImageIcon, Trash2, Folder,
  FolderPlus, Film, Music, ChevronRight, FileText,
  X, Check, Copy, Download, ArrowUpDown, Star, Files, HardDrive, Search, Info,
  FolderOpen, Power
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
  getConfig: () => API.fetch('/api/config'),
  getDataPath: () => API.fetch('/api/config/data-path'),
  saveConfig: (config) => API.fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  }),
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
  cancelDownload: (taskId) => API.fetch('/api/download/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId })
  }),
  getFileDownloadUrl: (cid) => `/api/files/${cid}/download`,
  moveFile: (cid, newFileName) => API.fetch('/api/move', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cid, newFileName })
  }),
  renameFolder: (oldPath, newPath) => API.fetch('/api/folder/rename', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oldPath, newPath })
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

// === Welcome Guide ===
function WelcomeGuide({ onClose }) {
  const [step, setStep] = useState(0)
  const steps = [
    { title: '欢迎使用', content: '拖拽文件到上传区，或点击选择文件。上传后复制链接发给朋友即可。' },
    { title: '下载文件', content: '点击「下载文件」，粘贴分享链接即可从 P2P 网络下载文件。' }
  ]
  const current = steps[step]

  return (
    <ModalOverlay onClose={onClose}>
      <div style={{ width: 360, padding: 28, borderRadius: 16, background: '#fff', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>{current.title}</h2>
        <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6, marginBottom: 20 }}>{current.content}</p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 20 }}>
          {steps.map((_, i) => (
            <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: i === step ? '#3b82f6' : '#e2e8f0' }} />
          ))}
        </div>
        <button onClick={step === steps.length - 1 ? onClose : () => setStep(step + 1)} style={{ padding: '10px 32px', borderRadius: 10, border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer', fontSize: 14 }}>
          {step === steps.length - 1 ? '开始使用' : '下一步'}
        </button>
      </div>
    </ModalOverlay>
  )
}

// === About Modal ===
function SettingsModal({ onClose, addToast }) {
  const [dataPath, setStoragePath] = useState('')
  const [originalPath, setOriginalPath] = useState('')
  const [isDefault, setIsDefault] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    API.getDataPath().then(config => {
      const path = config.dataPath || ''
      setStoragePath(path)
      setOriginalPath(path)
      setIsDefault(config.isDefault || false)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const handleSavePath = async () => {
    if (!dataPath.trim()) return
    if (dataPath.trim() === originalPath) return
    setSaving(true)
    try {
      await API.saveConfig({ dataPath: dataPath.trim() })
      await fetch('/api/shutdown', { method: 'POST' })
      window.close()
    } catch (err) {
      addToast(err.message || '保存失败', 'error')
      setSaving(false)
    }
  }

  const handleResetPath = async () => {
    if (originalPath === '') return
    setSaving(true)
    try {
      await API.saveConfig({ resetStorage: true })
      await fetch('/api/shutdown', { method: 'POST' })
      window.close()
    } catch (err) {
      addToast(err.message || '操作失败', 'error')
      setSaving(false)
    }
  }

  const isPathChanged = dataPath.trim() !== originalPath

  return (
    <ModalOverlay onClose={onClose}>
      <div style={{ width: 420, padding: 28, borderRadius: 16, background: '#fff' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>设置</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={18} /></button>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 8, color: '#374151' }}>存储位置</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="text"
              value={dataPath}
              onChange={(e) => setStoragePath(e.target.value)}
              placeholder="输入完整路径，如 D:\most-data"
              disabled={loading}
              style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 13, outline: 'none' }}
            />
            <button onClick={handleSavePath} disabled={saving || loading || !isPathChanged} style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: '#3b82f6', color: '#fff', cursor: saving || loading || !isPathChanged ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', opacity: saving || loading || !isPathChanged ? 0.5 : 1 }}>
              {saving ? '保存中...' : '保存'}
            </button>
            {!isDefault && (
              <button onClick={handleResetPath} disabled={saving || loading} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#6b7280', cursor: saving || loading ? 'not-allowed' : 'pointer', fontSize: 13, whiteSpace: 'nowrap', opacity: saving || loading ? 0.5 : 1 }}>
                恢复默认
              </button>
            )}
          </div>
          <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 8 }}>重启后生效</p>
        </div>

        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>MostBox</h3>
            <p style={{ fontSize: 12, color: '#9ca3af' }}>版本 0.0.1</p>
          </div>
          <p style={{ fontSize: 12, color: '#6b7280', textAlign: 'center' }}>Hyperswarm · Hyperdrive · IPFS</p>
        </div>

        <button onClick={onClose} style={{ width: '100%', marginTop: 20, padding: 10, borderRadius: 10, border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer', fontSize: 14 }}>
          关闭
        </button>
      </div>
    </ModalOverlay>
  )
}

// === Toast ===
const TOAST_COLORS = { success: '#22c55e', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6' }

function Toast({ message, type, onDone, index }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000)
    return () => clearTimeout(t)
  }, [])
  return (
    <div style={{
      position: 'fixed', bottom: 24 + index * 60, right: 24, zIndex: 9999,
      background: TOAST_COLORS[type] || TOAST_COLORS.info, color: '#fff',
      padding: '12px 20px', borderRadius: 12, fontSize: 13, fontWeight: 500,
      boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
      animation: 'toastSlideIn 0.2s ease'
    }}>
      {message}
    </div>
  )
}

// === Modal Overlay ===
function ModalOverlay({ children, onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      {children}
    </div>
  )
}

// === Shared Styles ===
const iconContainerStyle = {
  width: 56, height: 56, borderRadius: 12, marginBottom: 10,
  display: 'flex', alignItems: 'center', justifyContent: 'center'
}

const textEllipsisStyle = {
  fontSize: 12, fontWeight: 500, textAlign: 'center', maxWidth: '100%',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
}

// === Breadcrumb Generator ===
function generateBreadcrumbs(currentPath) {
  if (!currentPath) return []
  return [
    { path: '', name: '全部内容' },
    ...currentPath.split('/').filter(Boolean).map((part, i, arr) => ({
      path: arr.slice(0, i + 1).join('/'),
      name: part
    }))
  ]
}

// === Refresh Handler Factory ===
const createRefreshHandler = (setter, apiMethod) => async () => {
  try { setter(await apiMethod()) }
  catch (err) { console.error(err) }
}

// === File Card ===
function FileCard({ file, isSelected, isDarkMode, onSelect, onPreview }) {
  const bgSecondary = isDarkMode ? '#1e293b' : '#ffffff'
  const accentBlue = isDarkMode ? '#60a5fa' : '#3b82f6'
  const borderColor = isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'
  const textColor = isDarkMode ? '#e5e7eb' : '#111827'
  const subtype = getFileSubtype(file.fileName)

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
        ...iconContainerStyle,
        background: file.starred ? 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)' : 'linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)'
      }}>
        {subtype === 'image' && <ImageIcon size={24} color="#fff" />}
        {subtype === 'video' && <Film size={24} color="#fff" />}
        {subtype === 'audio' && <Music size={24} color="#fff" />}
        {subtype === 'file' && <FileText size={24} color="#fff" />}
      </div>
      <p style={{ ...textEllipsisStyle, color: textColor }}>
        {parseName(file.fileName).name}
      </p>
    </div>
  )
}

// === Folder Card ===
function FolderCard({ folder, isDarkMode, onClick }) {
  const bgSecondary = isDarkMode ? '#1e293b' : '#ffffff'
  const borderColor = isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'
  const textColor = isDarkMode ? '#e5e7eb' : '#111827'

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
      <div style={{ ...iconContainerStyle, background: 'linear-gradient(135deg, #818cf8 0%, #6366f1 100%)' }}>
        <Folder size={28} color="#fff" />
      </div>
      <p style={{ ...textEllipsisStyle, color: textColor }}>
        {folder.name}
      </p>
    </div>
  )
}

// === Confirm Modal ===
function ConfirmModal({ title, message, confirmText, onConfirm, onClose, danger }) {
  const isDarkMode = false
  const bgSecondary = '#ffffff'
  const bgTertiary = '#f1f5f9'
  const textPrimary = '#0f172a'
  const textSecondary = '#64748b'
  const borderColor = 'rgba(0,0,0,0.06)'
  return (
    <ModalOverlay onClose={onClose}>
      <div style={{ width: 360, padding: 24, borderRadius: 16, background: bgSecondary, border: `1px solid ${borderColor}` }} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>{title}</h3>
        <p style={{ fontSize: 13, color: textSecondary, marginBottom: 20 }}>{message}</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 10, borderRadius: 8, border: `1px solid ${borderColor}`, background: 'transparent', cursor: 'pointer', fontSize: 13 }}>取消</button>
          <button onClick={onConfirm} style={{ flex: 1, padding: 10, borderRadius: 8, border: 'none', background: danger ? '#ef4444' : '#3b82f6', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>{confirmText}</button>
        </div>
      </div>
    </ModalOverlay>
  )
}

// === Input Modal ===
function InputModal({ title, placeholder, defaultValue, confirmText, onConfirm, onClose }) {
  const [value, setValue] = useState(defaultValue || '')
  const bgSecondary = '#ffffff'
  const bgTertiary = '#f1f5f9'
  const textPrimary = '#0f172a'
  const textSecondary = '#64748b'
  const borderColor = 'rgba(0,0,0,0.06)'
  return (
    <ModalOverlay onClose={onClose}>
      <div style={{ width: 360, padding: 24, borderRadius: 16, background: bgSecondary, border: `1px solid ${borderColor}` }} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>{title}</h3>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter' && value.trim()) onConfirm(value.trim()) }}
          style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1.5px solid ${borderColor}`, fontSize: 13, outline: 'none', background: bgTertiary, color: textPrimary, marginBottom: 16 }}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 10, borderRadius: 8, border: `1px solid ${borderColor}`, background: 'transparent', cursor: 'pointer', fontSize: 13 }}>取消</button>
          <button onClick={() => value.trim() && onConfirm(value.trim())} disabled={!value.trim()} style={{ flex: 1, padding: 10, borderRadius: 8, border: 'none', background: value.trim() ? '#3b82f6' : bgTertiary, color: value.trim() ? '#fff' : textSecondary, cursor: value.trim() ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 500 }}>{confirmText}</button>
        </div>
      </div>
    </ModalOverlay>
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

  const breadcrumbParts = generateBreadcrumbs(targetPath)

  return (
    <ModalOverlay onClose={onClose}>
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
    </ModalOverlay>
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
  const [confirmModal, setConfirmModal] = useState(null)
  const [inputModal, setInputModal] = useState(null)
  const [renameTarget, setRenameTarget] = useState(null)
  const [showWelcome, setShowWelcome] = useState(() => !localStorage.getItem('mostbox_welcomed'))
  const [showSettings, setShowSettings] = useState(false)

  const currentPath = currentFolderId || ''
  const allFolders = getUniqueFolders(items)
  const { folders, files } = getItemsForPath(items, allFolders, currentPath)

  const filteredFiles = searchQuery
    ? items.filter(f => parseName(f.fileName).name.toLowerCase().includes(searchQuery.toLowerCase()))
    : files

  const addToast = (message, type = 'info') => setToasts(prev => [...prev, { id: Date.now(), message, type }])
  const removeToast = (id) => setToasts(prev => prev.filter(t => t.id !== id))

  const refreshFiles = createRefreshHandler(setItems, () => API.listPublishedFiles().then(r => r || []))
  const refreshTrash = createRefreshHandler(setTrashItems, () => API.listTrashFiles().then(r => r || []))
  const refreshStorageStats = createRefreshHandler(setStorageStats, API.getStorageStats)

  const handleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  }

  const handleDelete = async (id) => {
    setConfirmModal({
      title: '确认删除',
      message: '确定要删除吗？',
      confirmText: '删除',
      danger: true,
      onConfirm: async () => {
        setConfirmModal(null)
        try {
          await API.deletePublishedFile(id)
          setSelectedIds(prev => prev.filter(i => i !== id))
          addToast('已删除', 'success')
          refreshFiles()
          refreshTrash()
          refreshStorageStats()
        } catch { addToast('删除失败', 'error') }
      }
    })
  }

  const handleFolderDelete = async (folder) => {
    const toDelete = items.filter(i => parseName(i.fileName).folder.toLowerCase() === folder.path.toLowerCase())
    setConfirmModal({
      title: '确认删除',
      message: toDelete.length > 0 ? `确定要删除文件夹中的 ${toDelete.length} 个文件吗？` : '确定要删除此文件夹吗？',
      confirmText: '删除',
      danger: true,
      onConfirm: async () => {
        setConfirmModal(null)
        try {
          for (const f of toDelete) { if (f.cid) await API.deletePublishedFile(f.cid) }
          addToast('已删除', 'success')
          refreshFiles()
          refreshTrash()
          refreshStorageStats()
        } catch { addToast('删除失败', 'error') }
      }
    })
  }

  const handlePermanentDelete = async (cid) => {
    setConfirmModal({
      title: '永久删除',
      message: '确定要永久删除吗？此操作不可恢复！',
      confirmText: '永久删除',
      danger: true,
      onConfirm: async () => {
        setConfirmModal(null)
        try {
          await API.permanentDeleteTrashFile(cid)
          addToast('已永久删除', 'success')
          refreshTrash()
          refreshStorageStats()
        } catch { addToast('删除失败', 'error') }
      }
    })
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
    setConfirmModal({
      title: '清空回收站',
      message: '确定要清空回收站吗？此操作不可恢复！',
      confirmText: '清空',
      danger: true,
      onConfirm: async () => {
        setConfirmModal(null)
        try {
          await API.emptyTrash()
          addToast('回收站已清空', 'success')
          refreshTrash()
          refreshStorageStats()
        } catch { addToast('清空失败', 'error') }
      }
    })
  }

  const handleToggleStar = async (cid) => {
    try {
      const result = await API.toggleStar(cid)
      setItems(prev => prev.map(i => i.cid === cid ? { ...i, starred: result.starred } : i))
      addToast(result.starred ? '已收藏' : '已取消收藏', 'success')
    } catch { addToast('操作失败', 'error') }
  }

  const handleBatchDelete = async () => {
    const isTrash = currentView === 'trash'
    setConfirmModal({
      title: isTrash ? '永久删除' : '批量删除',
      message: isTrash ? `确定要永久删除选中的 ${selectedIds.length} 个项目吗？此操作不可恢复！` : `确定要删除选中的 ${selectedIds.length} 个项目吗？`,
      confirmText: isTrash ? '永久删除' : '删除',
      danger: true,
      onConfirm: async () => {
        setConfirmModal(null)
        try {
          for (const id of selectedIds) {
            if (isTrash) {
              await API.permanentDeleteTrashFile(id)
            } else {
              if (!id.startsWith('__')) await API.deletePublishedFile(id)
            }
          }
          setSelectedIds([])
          addToast(isTrash ? '已永久删除' : '已删除', 'success')
          refreshFiles()
          refreshTrash()
          refreshStorageStats()
        } catch { addToast('删除失败', 'error') }
      }
    })
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

  const openRenameModal = (target) => {
    const isFolder = !!target.path
    const currentName = isFolder ? target.name : parseName(target.fileName).name
    setInputModal({
      title: isFolder ? '重命名文件夹' : '重命名文件',
      placeholder: '请输入新名称',
      defaultValue: currentName,
      confirmText: '重命名',
      onConfirm: async (newName) => {
        setInputModal(null)
        if (newName === currentName) return
        try {
          if (isFolder) {
            await API.renameFolder(target.path, newName)
          } else {
            const { folder } = parseName(target.fileName)
            const newFileName = folder ? `${folder}/${newName}` : newName
            await API.moveFile(target.cid, newFileName)
          }
          addToast('已重命名', 'success')
          refreshFiles()
        } catch { addToast('重命名失败', 'error') }
      }
    })
  }

  const processFiles = async (files) => {
    const prefix = currentPath ? currentPath + '/' : ''
    const newTransfers = []

    for (const file of Array.from(files)) {
      const fileName = prefix + file.name

      // Create transfer entry for progress tracking
      const transferId = `upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const transfer = {
        id: transferId,
        fileName: file.name,
        progress: 0,
        type: 'upload',
        status: 'uploading'
      }
      newTransfers.push(transfer)
      setTransfers(prev => [...prev, transfer])

      // Open transfer panel if there are new transfers
      if (newTransfers.length > 0) {
        setIsTransferPanelOpen(true)
      }

      try {
        const result = await API.publishFile(file, fileName)
        if (result.alreadyExists) {
          // Update transfer status
          setTransfers(prev => prev.map(t =>
            t.id === transferId ? { ...t, status: 'completed' } : t
          ))
          addToast(`${file.name} 已存在`, 'warning')
        } else {
          // Update transfer status
          setTransfers(prev => prev.map(t =>
            t.id === transferId ? { ...t, progress: 100, status: 'completed' } : t
          ))
          addToast(`${file.name} 上传成功`, 'success')
        }
      } catch (err) {
        setTransfers(prev => prev.map(t =>
          t.id === transferId ? { ...t, status: 'error' } : t
        ))
        addToast(`上传失败: ${file.name}`, 'error')
      }
    }

    // Remove completed transfers after a delay
    setTimeout(() => {
      setTransfers(prev => prev.filter(t => t.status === 'uploading'))
    }, 3000)

    refreshFiles()
    refreshStorageStats()
  }

  const createNewFolder = () => {
    setInputModal({
      title: '新建文件夹',
      placeholder: '请输入文件夹名称',
      confirmText: '创建',
      onConfirm: async (folderPath) => {
        setInputModal(null)
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
    })
  }

  const handleCopyLink = () => {
    navigator.clipboard.writeText(`most://${shareItem.cid}`).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const [isDownloading, setIsDownloading] = useState(false)

  const handleDownloadSharedFile = async () => {
    if (!downloadLink.trim() || !downloadLink.startsWith('most://')) {
      addToast('链接格式应为 most://<cid>', 'warning')
      return
    }
    if (isDownloading) return
    setIsDownloading(true)
    try {
      const result = await API.downloadFile(downloadLink)
      setDownloadLink('')
      setIsDownloadModalOpen(false)
      
      if (result.alreadyExists) {
        addToast(`${result.fileName} 已存在`, 'warning')
      } else {
        const transfer = {
          id: result.taskId,
          fileName: '下载文件',
          progress: 0,
          type: 'download',
          status: 'uploading'
        }
        setTransfers(prev => [...prev, transfer])
        setIsTransferPanelOpen(true)
        addToast('下载已开始', 'info')
      }
    } catch (err) {
      addToast('下载失败', 'error')
    } finally {
      setIsDownloading(false)
    }
  }
  
  const handleCancelTransfer = async (transfer) => {
    if (transfer.type === 'download' && transfer.status === 'uploading') {
      try {
        await API.cancelDownload(transfer.id)
        // The WebSocket will handle the 'download:cancelled' event
      } catch (err) {
        addToast('取消失败', 'error')
      }
    }
  }

  const handleNavigate = (path) => {
    setCurrentFolderId(path || null)
    setSelectedIds([])
  }

  const handleCloseWelcome = () => {
    setShowWelcome(false)
    localStorage.setItem('mostbox_welcomed', 'true')
  }

  const handleShutdown = () => {
    setConfirmModal({
      title: '关闭服务',
      message: '确定要关闭服务吗？',
      confirmText: '关闭',
      danger: true,
      onConfirm: async () => {
        setConfirmModal(null)
        try {
          await fetch('/api/shutdown', { method: 'POST' })
        } catch { }
        window.close()
      }
    })
  }

  // WebSocket
  useEffect(() => {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${location.host}/ws`)
    ws.onmessage = (e) => {
      try {
        const { event, data } = JSON.parse(e.data)
        if (event === 'publish:success' || event === 'download:success') {
          refreshFiles()
          refreshStorageStats()
          const taskId = data.taskId || data.fileName
          setTransfers(prev => prev.map(t =>
            (t.id === taskId || t.fileName === data.fileName) ? { ...t, progress: 100, status: 'completed' } : t
          ))
          if (event === 'download:success') {
            if (data.alreadyExists) {
              addToast(`${data.fileName} 已存在`, 'warning')
            } else {
              addToast(`${data.fileName} 下载完成`, 'success')
            }
            // Remove completed downloads after delay
            setTimeout(() => {
              setTransfers(prev => prev.filter(t => !(t.id === taskId && t.status === 'completed')))
            }, 3000)
          }
        }
        // Handle publish/upload progress
        if (event === 'publish:progress') {
          setTransfers(prev => prev.map(t => {
            if (data.file && t.fileName === data.file && t.type === 'upload') {
              // Calculate percent based on stage
              let progress = 50
              if (data.stage === 'calculating-cid') progress = 25
              else if (data.stage === 'uploading') progress = 75
              else if (data.stage === 'complete') progress = 100
              return { ...t, progress }
            }
            return t
          }))
        }
        // Handle download progress
        if (event === 'download:progress') {
          setTransfers(prev => prev.map(t =>
            t.id === data.taskId ? { ...t, progress: data.percent || 0, loaded: data.loaded, total: data.total } : t
          ))
        }
        // Handle download error
        if (event === 'download:error') {
          setTransfers(prev => prev.map(t =>
            t.id === data.taskId ? { ...t, status: 'error' } : t
          ))
          addToast(`下载失败: ${data.error}`, 'error')
        }
        // Handle download status (includes filename when known)
        if (event === 'download:status') {
          setTransfers(prev => prev.map(t =>
            t.id === data.taskId ? { ...t, fileName: data.file || t.fileName } : t
          ))
        }
        // Handle download cancelled
        if (event === 'download:cancelled') {
          setTransfers(prev => prev.map(t =>
            t.id === data.taskId ? { ...t, status: 'cancelled' } : t
          ))
          addToast('下载已取消', 'warning')
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
  const displayFolders = currentView === 'starred' ? [] : folders

  // Breadcrumb parts
  const breadcrumbParts = generateBreadcrumbs(currentPath)

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
            <button onClick={handleShutdown} title="关闭服务" style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: bgTertiary, cursor: 'pointer', color: '#ef4444' }}>
              <Power size={16} />
            </button>
            <button onClick={() => setShowSettings(true)} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: bgTertiary, cursor: 'pointer', color: textSecondary }}>
              <Info size={16} />
            </button>
          </div>
        </header>

        {/* Upload/Download */}
        {currentView === 'all' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '16px 24px', position: 'relative' }}>
            <div onDragOver={(e) => { e.preventDefault(); setIsDraggingOverUpload(true) }} onDragLeave={() => setIsDraggingOverUpload(false)} onDrop={(e) => { e.preventDefault(); setIsDraggingOverUpload(false); processFiles(e.dataTransfer.files) }} style={{ border: `2px dashed ${isDraggingOverUpload ? '#3b82f6' : 'rgba(59,130,246,0.2)'}`, borderRadius: 12, padding: 20, textAlign: 'center', cursor: 'pointer', background: isDraggingOverUpload ? 'rgba(59,130,246,0.05)' : 'transparent', position: 'relative' }}>
              <input type="file" multiple onChange={(e) => processFiles(e.target.files)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', zIndex: 1 }} />
              <Upload size={20} color={accentBlue} style={{ marginBottom: 8 }} />
              <p style={{ fontSize: 12, color: accentBlue, fontWeight: 500 }}>上传文件</p>
            </div>
            <div onClick={() => setIsDownloadModalOpen(true)} style={{ border: '2px dashed rgba(99,102,241,0.2)', borderRadius: 12, padding: 20, textAlign: 'center', cursor: 'pointer' }}>
              <Download size={20} color="#6366f1" style={{ marginBottom: 8 }} />
              <p style={{ fontSize: 12, color: '#6366f1', fontWeight: 500 }}>下载文件</p>
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
                  <div
                    key={f.cid}
                    onClick={() => setSelectedIds(prev => prev.includes(f.cid) ? prev.filter(id => id !== f.cid) : [...prev, f.cid])}
                    onDoubleClick={() => handleRestore(f.cid)}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                      padding: 16, borderRadius: 12,
                      background: selectedIds.includes(f.cid) ? accentBlue + '15' : bgSecondary,
                      border: `1px solid ${selectedIds.includes(f.cid) ? accentBlue : borderColor}`,
                      transition: 'all 0.15s', cursor: 'pointer'
                    }}
                  >
                    <div style={{ ...iconContainerStyle, background: 'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)' }}>
                      <FileText size={24} color="#fff" />
                    </div>
                    <p style={textEllipsisStyle}>{parseName(f.fileName).name}</p>
                    <p style={{ fontSize: 10, color: textMuted, marginTop: 2 }}>删除于 {formatDate(f.deletedAt)}</p>
                  </div>
                ))}
              </div>
            )
          )}

          {/* All/Starred View */}
          {currentView !== 'trash' && (
            displayFiles.length === 0 && displayFolders.length === 0 ? (
              <div style={{ textAlign: 'center', color: textMuted, padding: 48, fontSize: 13 }}>
                {searchQuery ? '未找到相关文件' : (currentView === 'starred' ? '暂无收藏' : '暂无文件')}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 16 }}>
                {displayFolders.map(folder => (
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



      {/* Confirm Modal */}
      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          confirmText={confirmModal.confirmText}
          danger={confirmModal.danger}
          onConfirm={confirmModal.onConfirm}
          onClose={() => setConfirmModal(null)}
        />
      )}

      {/* Input Modal */}
      {inputModal && (
        <InputModal
          title={inputModal.title}
          placeholder={inputModal.placeholder}
          confirmText={inputModal.confirmText}
          onConfirm={inputModal.onConfirm}
          onClose={() => setInputModal(null)}
        />
      )}

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
        <ModalOverlay onClose={() => setShareItem(null)}>
          <div style={{ width: 420, padding: 24, borderRadius: 16, background: bgSecondary, border: `1px solid ${borderColor}` }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600 }}>分享链接</h3>
              <button onClick={() => setShareItem(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: textMuted }}><X size={18} /></button>
            </div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <div style={{ flex: 1, padding: '12px 14px', borderRadius: 10, background: bgTertiary, fontSize: 13, fontFamily: 'monospace', color: textPrimary, wordBreak: 'break-all' }}>most://{shareItem.cid}</div>
              <button onClick={handleCopyLink} style={{ width: 44, borderRadius: 10, border: 'none', background: copied ? '#22c55e' : accentBlue, color: '#fff', cursor: 'pointer' }}>
                {copied ? <Check size={18} /> : <Copy size={18} />}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Download Modal */}
      {isDownloadModalOpen && (
        <ModalOverlay onClose={() => setIsDownloadModalOpen(false)}>
          <div style={{ width: 400, padding: 24, borderRadius: 16, background: bgSecondary, border: `1px solid ${borderColor}` }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600 }}>下载文件</h3>
              <button onClick={() => setIsDownloadModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: textMuted }}><X size={18} /></button>
            </div>
            <input type="text" value={downloadLink} onChange={(e) => setDownloadLink(e.target.value)} placeholder="most://..." onKeyDown={(e) => e.key === 'Enter' && handleDownloadSharedFile()} style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: `1.5px solid ${borderColor}`, fontSize: 13, fontFamily: 'monospace', outline: 'none', background: bgTertiary, color: textPrimary, marginBottom: 16 }} />
            <button onClick={handleDownloadSharedFile} disabled={!downloadLink.trim() || isDownloading} style={{ width: '100%', padding: 12, borderRadius: 10, border: 'none', background: (downloadLink.trim() && !isDownloading) ? '#6366f1' : bgTertiary, color: (downloadLink.trim() && !isDownloading) ? '#fff' : textMuted, fontSize: 13, fontWeight: 600, cursor: (downloadLink.trim() && !isDownloading) ? 'pointer' : 'not-allowed' }}>
              {isDownloading ? '下载中...' : '开始下载'}
            </button>
          </div>
        </ModalOverlay>
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
      {selectedIds.length > 0 && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 12, background: bgSecondary, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', border: `1px solid ${borderColor}`, zIndex: 100 }}>
          <span style={{ fontSize: 12, color: textSecondary }}>已选 {selectedIds.length} 项</span>
          <button onClick={() => setSelectedIds([])} style={{ background: 'none', border: 'none', cursor: 'pointer', color: textMuted, padding: 4 }}><X size={16} /></button>
          <div style={{ width: 1, height: 20, background: borderColor }} />
          {currentView === 'trash' ? (
            <>
              <button onClick={() => selectedIds.forEach(cid => handleRestore(cid))} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8, border: 'none', fontSize: 12, cursor: 'pointer' }}>
                恢复
              </button>
              <button onClick={handleBatchDelete} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff', fontSize: 12, cursor: 'pointer' }}>
                永久删除
              </button>
            </>
          ) : (
            <>
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
              <button onClick={() => {
                const firstSelected = items.find(i => i.cid === selectedIds[0])
                if (firstSelected) openRenameModal(firstSelected)
              }} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8, border: 'none', background: bgTertiary, color: textPrimary, fontSize: 12, cursor: 'pointer' }}>
                重命名
              </button>
              <button onClick={() => setIsMoveModalOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8, border: 'none', background: accentBlue, color: '#fff', fontSize: 12, cursor: 'pointer' }}>
                移动
              </button>
              <button onClick={handleBatchDelete} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff', fontSize: 12, cursor: 'pointer' }}>删除</button>
              <button onClick={() => setShareItem(items.find(i => i.cid === selectedIds[0]))} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: bgTertiary, color: textPrimary, fontSize: 12, cursor: 'pointer' }}>分享</button>
            </>
          )}
        </div>
      )}

      {/* Transfer Panel */}
      {isTransferPanelOpen && (
        <ModalOverlay onClose={() => setIsTransferPanelOpen(false)}>
          <div style={{ width: 380, maxHeight: '70vh', padding: 24, borderRadius: 16, background: bgSecondary, border: `1px solid ${borderColor}`, overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600 }}>传输</h3>
              <button onClick={() => setIsTransferPanelOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: textMuted }}><X size={18} /></button>
            </div>
            {transfers.length === 0 ? (
              <div style={{ textAlign: 'center', color: textMuted, padding: 24, fontSize: 13 }}>
                暂无传输
              </div>
            ) : (
              transfers.map(t => (
                <div key={t.id} style={{ padding: '10px 0', borderBottom: `1px solid ${borderColor}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    {t.type === 'upload' ? <Upload size={14} color={accentBlue} /> : <Download size={14} color="#6366f1" />}
                    <span style={{ fontSize: 12, fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.fileName}</span>
                    {t.status === 'uploading' && t.type === 'download' && (
                      <button onClick={() => handleCancelTransfer(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 2 }}>
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, height: 4, borderRadius: 2, background: bgTertiary }}>
                      <div style={{ 
                        width: `${t.progress}%`, 
                        height: '100%', 
                        borderRadius: 2, 
                        background: t.status === 'error' ? '#ef4444' : t.status === 'cancelled' ? '#f59e0b' : t.type === 'upload' ? accentBlue : '#6366f1',
                        transition: 'width 0.2s'
                      }} />
                    </div>
                    <span style={{ fontSize: 10, color: textMuted, minWidth: 32, textAlign: 'right' }}>
                      {t.status === 'completed' ? '完成' : 
                       t.status === 'error' ? '失败' : 
                       t.status === 'cancelled' ? '已取消' : 
                       t.loaded && t.total ? `${formatSize(t.loaded)}/${formatSize(t.total)}` : 
                       `${t.progress}%`}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </ModalOverlay>
      )}

      {/* Toasts */}
      {toasts.map((t, i) => <Toast key={t.id} message={t.message} type={t.type} onDone={() => removeToast(t.id)} index={i} />)}

      {/* Welcome Guide */}
      {showWelcome && <WelcomeGuide onClose={handleCloseWelcome} />}

      {/* Settings Modal */}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} addToast={addToast} />}
    </div>
  )
}
