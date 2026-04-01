import React, { useState, useEffect, useRef } from 'react'
import {
  Upload, Sun, Moon, Image as ImageIcon, Trash2, Folder,
  FolderPlus, Film, Music, ChevronRight, FileText,
  X, Check, Copy, Download, ArrowUpDown, Star, Files, HardDrive, Search, Info,
  FolderOpen, Power, Edit2, Menu, Eye
} from 'lucide-react'

// === 接口 ===
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

// === 工具函数 ===
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
  const txtExts = ['txt', 'md', 'js', 'ts', 'jsx', 'tsx', 'css', 'scss', 'less', 'json', 'xml', 'html', 'htm', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'log', 'sh', 'bash', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'php', 'sql', 'graphql', 'env', 'gitignore', 'dockerfile', 'readme']
  if (imgExts.includes(ext)) return 'image'
  if (vidExts.includes(ext)) return 'video'
  if (audExts.includes(ext)) return 'audio'
  if (txtExts.includes(ext)) return 'text'
  return 'file'
}

// === 引导页 ===
function WelcomeGuide({ onClose, onShutdown }) {
  const [step, setStep] = useState(0)
  const [customPath, setCustomPath] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [defaultPath, setDefaultPath] = useState('')

  useEffect(() => {
    API.getDataPath().then(config => {
      setDefaultPath(config.dataPath || '')
    }).catch(() => { })
  }, [])

  const steps = [
    { title: '欢迎使用', content: '拖拽文件到上传区，或点击选择文件。上传后复制链接发给朋友即可。' },
    { title: '下载文件', content: '点击「下载文件」，粘贴分享链接即可从 P2P 网络下载文件。' },
    { title: '设置存储位置', content: '选择文件存储的文件夹位置（可选，默认使用系统盘）', isOptional: true }
  ]
  const current = steps[step]

  const handleSavePath = async () => {
    if (!customPath.trim()) return
    setSaving(true)
    try {
      await API.saveConfig({ dataPath: customPath.trim() })
    } catch (err) {
      console.error('Save path error:', err)
      setSaving(false)
      return
    }
    setSaving(false)
    setSaved(true)
  }

  const isLastStep = step === steps.length - 1
  const isPathStep = step === 2

  return (
    <ModalOverlay onClose={onClose} closeOnOverlayClick={false}>
      <div className="welcome-modal" onClick={e => e.stopPropagation()}>
        {saved ? (
          <>
            <div className="welcome-success-icon">
              <Check size={24} color="#22c55e" />
            </div>
            <h2>设置已保存</h2>
            <p>存储位置已更改，需要重启应用生效。</p>
            <button
              onClick={onShutdown}
              className="btn primary"
            >
              好的
            </button>
          </>
        ) : (
          <>
            <h2>{current.title}</h2>
            <p>{current.content}</p>

            {isPathStep && (
              <div className="welcome-path-section">
                <div>
                  <div className="path-label">当前存储位置</div>
                  <div className="path-value">{defaultPath || '未设置'}</div>
                </div>
                <div>
                  <div className="path-label">自定义位置</div>
                  <input
                    type="text"
                    value={customPath}
                    onChange={(e) => setCustomPath(e.target.value)}
                    placeholder="如 D:\"
                    className="path-input"
                  />
                  <div className="path-hint">不填则使用当前位置，修改后需重启应用</div>
                </div>
              </div>
            )}

            <div className="welcome-steps">
              {steps.map((_, i) => (
                <div key={i} className={`welcome-step-dot ${i === step ? 'active' : ''}`} />
              ))}
            </div>

            <div className="welcome-actions">
              {isPathStep && (
                <button
                  onClick={onClose}
                  className="btn secondary"
                >
                  跳过
                </button>
              )}
              <button
                onClick={() => {
                  if (isPathStep && customPath) {
                    handleSavePath()
                  } else if (isLastStep) {
                    onClose()
                  } else {
                    setStep(step + 1)
                  }
                }}
                disabled={isPathStep && saving}
                className="btn primary"
                style={{ opacity: isPathStep && saving ? 0.6 : 1, cursor: isPathStep && saving ? 'not-allowed' : 'pointer' }}
              >
                {isPathStep ? (saving ? '保存中...' : '保存并完成') : (isLastStep ? '开始使用' : '下一步')}
              </button>
            </div>
          </>
        )}
      </div>
    </ModalOverlay>
  )
}

// === 设置弹窗 ===
function SettingsModal({ onClose, addToast, isDarkMode, handleShutdown }) {
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
      <div className="settings-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="settings-title">设置</h2>
          <button onClick={onClose} className="modal-close-btn"><X size={18} /></button>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label className="settings-label">存储位置</label>
          <div className="settings-row">
            <input
              type="text"
              value={dataPath}
              onChange={(e) => setStoragePath(e.target.value)}
              placeholder="如 D:\most-data"
              disabled={loading}
              className="settings-input"
            />
            <button onClick={handleSavePath} disabled={saving || loading || !isPathChanged} className="btn primary" style={{ whiteSpace: 'nowrap', opacity: saving || loading || !isPathChanged ? 0.5 : 1 }}>
              {saving ? '保存中...' : '保存'}
            </button>
            {!isDefault && (
              <button onClick={handleResetPath} disabled={saving || loading} className="btn secondary" style={{ whiteSpace: 'nowrap', opacity: saving || loading ? 0.5 : 1 }}>
                恢复默认
              </button>
            )}
          </div>
          <p className="settings-hint">修改后需重启应用</p>
        </div>

        <div className="settings-divider">
          <div className="settings-about">
            <h3>MostBox</h3>
            <p>版本 0.0.1</p>
          </div>
          <p style={{ fontSize: 12, textAlign: 'center', color: 'var(--text-secondary)' }}>Hyperswarm · Hyperdrive · IPFS</p>
        </div>

        <button onClick={() => { onClose(); handleShutdown(); }} className="btn danger full" style={{ marginTop: 20 }}>
          <Power size={16} /> 关闭服务
        </button>
      </div>
    </ModalOverlay>
  )
}

// === 通知 ===
const TOAST_COLORS = { success: '#22c55e', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6' }

function Toast({ message, type, onDone, index }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000)
    return () => clearTimeout(t)
  }, [])
  return (
    <div className={`toast ${type}`} style={{ bottom: 24 + index * 60 }}>
      {message}
    </div>
  )
}

// === 遮罩层 ===
function ModalOverlay({ children, onClose, closeOnOverlayClick = false }) {
  const handleOverlayClick = (e) => {
    if (closeOnOverlayClick && e.target === e.currentTarget) {
      onClose?.()
    }
  }
  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      {children}
    </div>
  )
}

// === 面包屑生成器 ===
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

// === 刷新处理器工厂 ===
const createRefreshHandler = (setter, apiMethod) => async () => {
  try { setter(await apiMethod()) }
  catch (err) { console.error(err) }
}

// === 文件卡片 ===
function FileCard({ file, isSelected, isDarkMode, onSelect, onPreview }) {
  const subtype = getFileSubtype(file.fileName)

  return (
    <div
      data-id={file.cid}
      onClick={() => onSelect(file.cid)}
      onDoubleClick={() => onPreview(file)}
      className={`card ${isSelected ? 'selected' : ''}`}
    >
      <div className={`card-icon ${file.starred ? 'starred' : 'file'}`}>
        {subtype === 'image' && <ImageIcon size={24} color="#fff" />}
        {subtype === 'video' && <Film size={24} color="#fff" />}
        {subtype === 'audio' && <Music size={24} color="#fff" />}
        {subtype === 'file' && <FileText size={24} color="#fff" />}
      </div>
      <p className="card-name">
        {parseName(file.fileName).name}
      </p>
    </div>
  )
}

// === 文件夹卡片 ===
function FolderCard({ folder, isDarkMode, onClick }) {
  return (
    <div
      onClick={onClick}
      className="card"
    >
      <div className="card-icon folder">
        <Folder size={28} color="#fff" />
      </div>
      <p className="card-name">
        {folder.name}
      </p>
    </div>
  )
}

// === 确认弹窗 ===
function ConfirmModal({ title, message, confirmText, onConfirm, onClose, danger, isDarkMode, closeOnOverlayClick }) {
  return (
    <ModalOverlay onClose={onClose} closeOnOverlayClick={closeOnOverlayClick}>
      <div className="confirm-modal" onClick={e => e.stopPropagation()}>
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="modal-actions">
          <button onClick={onClose} className="btn secondary">取消</button>
          <button onClick={onConfirm} className={`btn ${danger ? 'danger' : 'primary'}`}>{confirmText}</button>
        </div>
      </div>
    </ModalOverlay>
  )
}

// === 输入弹窗 ===
function InputModal({ title, placeholder, defaultValue, confirmText, onConfirm, onClose, isDarkMode, isLoading, loadingText }) {
  const [value, setValue] = useState(defaultValue || '')
  return (
    <ModalOverlay onClose={onClose}>
      <div className="input-modal" onClick={e => e.stopPropagation()}>
        <h3>{title}</h3>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter' && value.trim() && !isLoading) onConfirm(value.trim()) }}
          className="modal-input"
        />
        <div className="modal-actions">
          <button onClick={onClose} disabled={isLoading} className="btn secondary">取消</button>
          <button onClick={() => value.trim() && onConfirm(value.trim())} disabled={!value.trim() || isLoading} className="btn primary" style={{ opacity: isLoading ? 0.7 : 1 }}>{isLoading ? (loadingText || '处理中...') : confirmText}</button>
        </div>
      </div>
    </ModalOverlay>
  )
}

// === 移动弹窗 ===
function MoveModal({ items, allFolders, currentPath, isDarkMode, onMove, onClose }) {
  const [targetPath, setTargetPath] = useState('')

  const breadcrumbParts = generateBreadcrumbs(targetPath)

  return (
    <ModalOverlay onClose={onClose}>
      <div className="move-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>移动到</h3>
          <button onClick={onClose} className="modal-close-btn"><X size={18} /></button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>已选 {items.length} 个项目</p>
        <div className="move-breadcrumb">
          {breadcrumbParts.map((part, i) => (
            <React.Fragment key={part.path}>
              {i > 0 && <span style={{ color: 'var(--text-secondary)' }}>/</span>}
              <button
                key={part.path}
                onClick={() => setTargetPath(part.path)}
                className={`move-breadcrumb-btn ${targetPath === part.path ? 'active' : ''}`}
              >
                {part.name}
              </button>
            </React.Fragment>
          ))}
        </div>
        <div className="move-folder-list">
          {allFolders.filter(f => f.path.startsWith(targetPath + (targetPath ? '/' : ''))).length === 0 && targetPath !== '' && (
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center', padding: 16 }}>该目录下没有子文件夹</p>
          )}
          {allFolders.filter(f => f.path.startsWith(targetPath + (targetPath ? '/' : ''))).map(folder => (
            <button
              key={folder.path}
              onClick={() => setTargetPath(folder.path)}
              className={`move-folder-item ${targetPath === folder.path ? 'selected' : ''}`}
            >
              <Folder size={16} />
              <span>{folder.name}</span>
            </button>
          ))}
        </div>
        <div className="modal-actions">
          <button onClick={onClose} className="btn secondary">取消</button>
          <button
            onClick={() => onMove(targetPath)}
            disabled={targetPath === currentPath}
            className="btn primary"
          >
            移动
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}

// === 主应用 ===
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
  const [inputLoading, setInputLoading] = useState(false)
  const [renameTarget, setRenameTarget] = useState(null)
  const [showWelcome, setShowWelcome] = useState(() => !localStorage.getItem('mostbox_welcomed'))
  const [showSettings, setShowSettings] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [previewText, setPreviewText] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewOffset, setPreviewOffset] = useState(0)
  const [previewHasMore, setPreviewHasMore] = useState(true)
  const [previewMediaLoading, setPreviewMediaLoading] = useState(false)
  const [previewLoaded, setPreviewLoaded] = useState(false)
  const previewMediaRef = useRef(null)

  useEffect(() => {
    if (previewItem && (previewItem.subtype === 'image' || previewItem.subtype === 'video')) {
      setPreviewMediaLoading(true)
      setPreviewLoaded(false)
    }
    if (previewItem && previewItem.subtype === 'text') {
      setPreviewText('')
      setPreviewOffset(0)
      setPreviewHasMore(true)
      loadPreviewText(previewItem.cid)
    }
  }, [previewItem?.cid])

  useEffect(() => {
    const media = previewMediaRef.current
    if (!media) return

    const handleLoad = () => setPreviewMediaLoading(false)
    const handleError = () => setPreviewMediaLoading(false)

    if (previewItem?.subtype === 'image') {
      if (media.complete) {
        setPreviewMediaLoading(false)
      } else {
        media.addEventListener('load', handleLoad)
        media.addEventListener('error', handleError)
      }
    } else if (previewItem?.subtype === 'video') {
      media.addEventListener('canplay', handleLoad)
      media.addEventListener('error', handleError)
    }

    return () => {
      media.removeEventListener('load', handleLoad)
      media.removeEventListener('error', handleError)
      media.removeEventListener('canplay', handleLoad)
    }
  }, [previewItem])

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
        if (newName === currentName) return
        setInputLoading(true)
        try {
          if (isFolder) {
            const lastSlash = target.path.lastIndexOf('/')
            const parentPath = lastSlash !== -1 ? target.path.substring(0, lastSlash) : ''
            const newPath = parentPath ? `${parentPath}/${newName}` : newName
            await API.renameFolder(target.path, newPath)
            addToast('已重命名', 'success')
            refreshFiles()
            handleNavigate(newPath)
          } else {
            const { folder } = parseName(target.fileName)
            const newFileName = folder ? `${folder}/${newName}` : newName
            await API.moveFile(target.cid, newFileName)
            addToast('已重命名', 'success')
            refreshFiles()
          }
          setInputModal(null)
        } catch {
          addToast('重命名失败', 'error')
        } finally {
          setInputLoading(false)
        }
      }
    })
  }

  const processFiles = async (files) => {
    const prefix = currentPath ? currentPath + '/' : ''
    const newTransfers = []

    for (const file of Array.from(files)) {
      const fileName = prefix + file.name

      // 创建传输条目用于进度跟踪
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

      // 有新传输时打开传输面板
      if (newTransfers.length > 0) {
        setIsTransferPanelOpen(true)
      }

      try {
        const result = await API.publishFile(file, fileName)
        if (result.alreadyExists) {
          // 更新传输状态
          setTransfers(prev => prev.map(t =>
            t.id === transferId ? { ...t, status: 'completed' } : t
          ))
          addToast(`${file.name} 已存在`, 'warning')
        } else {
          // 更新传输状态
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

    // 延迟移除已完成的传输
    setTimeout(() => {
      setTransfers(prev => prev.filter(t => t.status === 'uploading'))
    }, 3000)

    refreshFiles()
    refreshStorageStats()
  }

  const loadPreviewText = async (cid, offset = 0, append = false) => {
    setPreviewLoading(true)
    try {
      const res = await fetch(`/api/files/${cid}/content?offset=${offset}&limit=1000`)
      const text = await res.text()
      setPreviewText(prev => append ? prev + text : text)
      setPreviewHasMore(text.length === 1000)
      setPreviewOffset(offset + text.length)
    } catch {
      setPreviewText(prev => append ? prev : '加载失败')
    }
    setPreviewLoading(false)
  }

  const createNewFolder = () => {
    setInputModal({
      title: '新建文件夹',
      placeholder: '请输入文件夹名称',
      confirmText: '创建',
      onConfirm: async (folderPath) => {
        setInputLoading(true)
        try {
          const exists = items.some(f =>
            f.fileName === folderPath ||
            f.fileName.startsWith(folderPath + '/')
          )
          if (exists) {
            addToast('文件夹已存在', 'warning')
            setInputLoading(false)
            return
          }
          const randomContent = Math.random().toString(36).substring(2, 10)
          const content = new File([randomContent], 'hello.txt', { type: 'text/plain' })
          await API.publishFile(content, `${folderPath}/hello.txt`)
          addToast('文件夹已创建', 'success')
          refreshFiles()
          setInputModal(null)
        } catch {
          addToast('创建失败', 'error')
        } finally {
          setInputLoading(false)
        }
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
        // WebSocket 会处理 'download:cancelled' 事件
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

  // WebSocket 连接
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
            // 延迟移除已完成的下载
            setTimeout(() => {
              setTransfers(prev => prev.filter(t => !(t.id === taskId && t.status === 'completed')))
            }, 3000)
          }
        }
        // 处理发布/上传进度
        if (event === 'publish:progress') {
          setTransfers(prev => prev.map(t => {
            if (data.file && t.fileName === data.file && t.type === 'upload') {
              // 根据阶段计算百分比
              let progress = 50
              if (data.stage === 'calculating-cid') progress = 25
              else if (data.stage === 'uploading') progress = 75
              else if (data.stage === 'complete') progress = 100
              return { ...t, progress }
            }
            return t
          }))
        }
        // 处理下载进度
        if (event === 'download:progress') {
          setTransfers(prev => prev.map(t =>
            t.id === data.taskId ? { ...t, progress: data.percent || 0, loaded: data.loaded, total: data.total } : t
          ))
        }
        // 处理下载错误
        if (event === 'download:error') {
          setTransfers(prev => prev.map(t =>
            t.id === data.taskId ? { ...t, status: 'error' } : t
          ))
          addToast(`下载失败: ${data.error}`, 'error')
        }
        // 处理下载状态（包含文件名）
        if (event === 'download:status') {
          setTransfers(prev => prev.map(t =>
            t.id === data.taskId ? { ...t, fileName: data.file || t.fileName } : t
          ))
        }
        // 处理下载取消
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

  // 初始化
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

  // 同步 data-theme 属性
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light')
  }, [isDarkMode])

  // 主题颜色
  const viewTitle = currentView === 'all' ? '全部内容' : currentView === 'starred' ? '收藏' : '回收站'
  const displayFiles = currentView === 'all'
    ? filteredFiles
    : currentView === 'starred'
      ? items.filter(i => i.starred && parseName(i.fileName).name.toLowerCase().includes(searchQuery.toLowerCase()))
      : trashItems.filter(i => parseName(i.fileName).name.toLowerCase().includes(searchQuery.toLowerCase()))
  const displayFolders = currentView === 'starred'
    ? []
    : folders.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()))

  // 面包屑部分
  const breadcrumbParts = generateBreadcrumbs(currentPath)

  return (
    <div className="app-layout">
      {/* 侧边栏遮罩 */}
      <div className={`sidebar-overlay ${isSidebarOpen ? 'visible' : ''}`} onClick={() => setIsSidebarOpen(false)} />

      {/* 侧边栏 */}
      <div className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h1>Most.Box</h1>
        </div>
        <nav className="sidebar-nav">
          {[{ id: 'all', icon: <Files size={18} />, label: '全部内容' }, { id: 'starred', icon: <Star size={18} />, label: '收藏' }, { id: 'trash', icon: <Trash2 size={18} />, label: '回收站' }].map(item => (
            <button
              key={item.id}
              onClick={() => { setCurrentView(item.id); setCurrentFolderId(null); setSelectedIds([]); setSearchQuery(''); setIsSidebarOpen(false) }}
              className={`sidebar-nav-btn ${currentView === item.id ? 'active' : ''}`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-footer-label">
            <HardDrive size={14} />
            <span>存储空间</span>
          </div>
          <div className="storage-bar">
            <div className="storage-bar-fill" style={{ width: `${storageStats.total > 0 ? (storageStats.used / storageStats.total) * 100 : 0}%` }} />
          </div>
          <div className="storage-info">
            <span>{formatSize(storageStats.used)}</span>
            <span>{storageStats.total > 0 ? formatSize(storageStats.total) : '-'}</span>
          </div>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="main-content">
        {/* 头部 */}
        <header className="app-header">
          <div className="header-left">
            <button onClick={() => setIsSidebarOpen(true)} className="icon-btn mobile-menu-btn">
              <Menu size={18} />
            </button>
            <h2 className="header-title">{viewTitle}</h2>
            <div className="header-badge">
              <div className={`header-badge-dot ${peerCount > 0 ? 'connected' : ''}`} />
              {peerCount > 0 ? `${peerCount} 节点` : '等待连接'}
            </div>
          </div>
          <div className="header-right">
            <div className="search-box">
              <Search size={14} />
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="搜索..." />
              {searchQuery && <button onClick={() => setSearchQuery('')}><X size={12} /></button>}
            </div>
            {currentView === 'trash' && trashItems.length > 0 && (
              <button onClick={handleEmptyTrash} className="btn small" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                清空回收站
              </button>
            )}
            <button onClick={() => setIsTransferPanelOpen(true)} className="icon-btn">
              <ArrowUpDown size={16} />
              {transfers.length > 0 && <span className="icon-btn-badge">{transfers.length}</span>}
            </button>
            <button onClick={createNewFolder} className="icon-btn accent">
              <FolderPlus size={16} />
            </button>
            <button onClick={() => setIsDarkMode(!isDarkMode)} className="icon-btn theme-toggle">
              {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button onClick={() => setShowSettings(true)} className="icon-btn">
              <Info size={16} />
            </button>
          </div>
        </header>

        {/* 上传/下载 */}
        {currentView === 'all' && (
          <div className="action-grid">
            <div className={`action-card upload ${isDraggingOverUpload ? 'drag-over' : ''}`} onDragOver={(e) => { e.preventDefault(); setIsDraggingOverUpload(true) }} onDragLeave={() => setIsDraggingOverUpload(false)} onDrop={(e) => { e.preventDefault(); setIsDraggingOverUpload(false); processFiles(e.dataTransfer.files) }}>
              <input type="file" multiple onChange={(e) => processFiles(e.target.files)} className="action-card-input" />
              <Upload size={20} style={{ marginBottom: 8 }} />
              <p>上传文件</p>
            </div>
            <div className="action-card action-card-download" onClick={() => setIsDownloadModalOpen(true)}>
              <Download size={20} style={{ marginBottom: 8 }} />
              <p>下载文件</p>
            </div>
          </div>
        )}

        {/* 面包屑 */}
        {currentView === 'all' && (
          <div className="breadcrumb">
            {currentPath ? (
              <>
                <button onClick={() => handleNavigate('')}>全部内容</button>
                {breadcrumbParts.slice(1).map((part, i) => (
                  <React.Fragment key={part.path}>
                    <ChevronRight size={12} />
                    <button onClick={() => handleNavigate(part.path)} className={i === breadcrumbParts.length - 2 ? 'current' : ''}>{part.name}</button>
                    {i === breadcrumbParts.length - 2 && (
                      <button onClick={() => openRenameModal(part)} className="breadcrumb-edit-btn">
                        <Edit2 size={12} />
                      </button>
                    )}
                  </React.Fragment>
                ))}
              </>
            ) : null}
          </div>
        )}

        {/* 内容网格 */}
        <div className="content-grid">
          {/* 回收站视图 */}
          {currentView === 'trash' && (
            displayFiles.length === 0 ? (
              <div className="empty-state">{searchQuery ? '未找到相关文件' : '回收站是空的'}</div>
            ) : (
              <div className="file-grid">
                {displayFiles.map(f => (
                  <div
                    key={f.cid}
                    onClick={() => setSelectedIds(prev => prev.includes(f.cid) ? prev.filter(id => id !== f.cid) : [...prev, f.cid])}
                    onDoubleClick={() => handleRestore(f.cid)}
                    className={`card ${selectedIds.includes(f.cid) ? 'selected' : ''}`}
                  >
                    <div className="card-icon trash">
                      <FileText size={24} color="#fff" />
                    </div>
                    <p className="card-name">{parseName(f.fileName).name}</p>
                    <p className="card-date">删除于 {formatDate(f.deletedAt)}</p>
                  </div>
                ))}
              </div>
            )
          )}

          {/* 全部/收藏视图 */}
          {currentView !== 'trash' && (
            displayFiles.length === 0 && displayFolders.length === 0 ? (
              <div className="empty-state">
                {searchQuery ? '未找到相关文件' : (currentView === 'starred' ? '暂无收藏' : '暂无文件')}
              </div>
            ) : (
              <div className="file-grid">
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



      {/* 确认弹窗 */}
      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          confirmText={confirmModal.confirmText}
          danger={confirmModal.danger}
          isDarkMode={isDarkMode}
          closeOnOverlayClick={confirmModal.danger}
          onConfirm={confirmModal.onConfirm}
          onClose={() => setConfirmModal(null)}
        />
      )}

      {/* 输入弹窗 */}
      {inputModal && (
        <InputModal
          title={inputModal.title}
          placeholder={inputModal.placeholder}
          confirmText={inputModal.confirmText}
          isDarkMode={isDarkMode}
          isLoading={inputLoading}
          onConfirm={inputModal.onConfirm}
          onClose={() => setInputModal(null)}
        />
      )}

      {/* 移动弹窗 */}
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

      {/* 分享弹窗 */}
      {shareItem && (
        <ModalOverlay onClose={() => setShareItem(null)}>
          <div className="share-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>分享链接</h3>
              <button onClick={() => setShareItem(null)} className="modal-close-btn"><X size={18} /></button>
            </div>
            <div className="share-link-box">
              <div className="share-link-text">most://{shareItem.cid}</div>
              <button onClick={handleCopyLink} className={`share-copy-btn ${copied ? 'copied' : ''}`}>
                {copied ? <Check size={18} /> : <Copy size={18} />}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* 下载弹窗 */}
      {isDownloadModalOpen && (
        <ModalOverlay onClose={() => setIsDownloadModalOpen(false)}>
          <div className="download-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>下载文件</h3>
              <button onClick={() => setIsDownloadModalOpen(false)} className="modal-close-btn"><X size={18} /></button>
            </div>
            <input type="text" value={downloadLink} onChange={(e) => setDownloadLink(e.target.value)} placeholder="most://..." onKeyDown={(e) => e.key === 'Enter' && handleDownloadSharedFile()} className="download-input" />
            <button onClick={handleDownloadSharedFile} disabled={!downloadLink.trim() || isDownloading} className="download-btn">
              {isDownloading ? '下载中...' : '开始下载'}
            </button>
          </div>
        </ModalOverlay>
      )}

      {/* 预览弹窗 */}
      {previewItem && (
        <div className="preview-overlay" onClick={() => { setPreviewItem(null); setPreviewText(''); setPreviewMediaLoading(false) }}>
          <button className="preview-close"><X size={20} /></button>
          <div onClick={e => e.stopPropagation()}>
            {previewItem.subtype === 'image' && (
              <div className="preview-media-wrapper">
                {previewMediaLoading && <div className="preview-loading"><div className="preview-loading-spinner" /></div>}
                <img ref={previewMediaRef} src={API.getFileDownloadUrl(previewItem.cid)} alt="" />
              </div>
            )}
            {previewItem.subtype === 'video' && (
              <div className="preview-media-wrapper">
                {previewMediaLoading && <div className="preview-loading"><div className="preview-loading-spinner" /></div>}
                <video ref={previewMediaRef} src={API.getFileDownloadUrl(previewItem.cid)} controls />
              </div>
            )}
            {previewItem.subtype === 'audio' && <div className="preview-audio"><Music size={48} color="#fff" style={{ marginBottom: 12 }} /><audio src={API.getFileDownloadUrl(previewItem.cid)} controls /></div>}
            {previewItem.subtype === 'file' && (
              <div className="preview-unsupported">
                <FileText size={48} color="#fff" style={{ marginBottom: 12, opacity: 0.5 }} />
                <p>{previewItem.fileName}</p>
                <p style={{ fontSize: 12, marginTop: 8, opacity: 0.7 }}>无法预览</p>
              </div>
            )}
            {previewItem.subtype === 'text' && (
              <div className="preview-text-container">
                <div className="preview-text-header">
                  <span>{previewItem.fileName}</span>
                  {previewHasMore && (
                    <button
                      onClick={() => loadPreviewText(previewItem.cid, previewOffset, true)}
                      disabled={previewLoading}
                      className="btn small"
                    >
                      {previewLoading ? '加载中...' : '加载更多'}
                    </button>
                  )}
                </div>
                <pre className="preview-text">{previewLoading && !previewText ? '加载中...' : previewText}</pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 批量操作栏 */}
      {selectedIds.length > 0 && (
        <div className="batch-bar">
          <span className="batch-info">已选 {selectedIds.length} 项</span>
          <button onClick={() => setSelectedIds([])} className="batch-dismiss"><X size={16} /></button>
          <div className="batch-divider" />
          {currentView === 'trash' ? (
            <>
              <button onClick={() => selectedIds.forEach(cid => handleRestore(cid))} className="btn small">
                恢复
              </button>
              <button onClick={handleBatchDelete} className="btn small danger">
                永久删除
              </button>
            </>
          ) : (
            <>
              {selectedIds.length === 1 && (
                <button onClick={() => {
                  const file = items.find(i => i.cid === selectedIds[0])
                  if (file) {
                    const subtype = getFileSubtype(file.fileName)
                    setPreviewItem({ ...file, subtype })
                    setPreviewText('')
                    setPreviewOffset(0)
                    if (subtype === 'text') loadPreviewText(file.cid)
                  }
                }} className="btn small">
                  <Eye size={14} /> 预览
                </button>
              )}
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
              }} className="btn small" style={{ background: '#f59e0b', color: '#fff' }}>
                收藏
              </button>
              <button onClick={() => {
                const firstSelected = items.find(i => i.cid === selectedIds[0])
                if (firstSelected) openRenameModal(firstSelected)
              }} className="btn small">
                重命名
              </button>
              <button onClick={() => setIsMoveModalOpen(true)} className="btn small" style={{ background: 'var(--accent-blue)', color: '#fff' }}>
                移动
              </button>
              <button onClick={handleBatchDelete} className="btn small danger">删除</button>
              <button onClick={() => setShareItem(items.find(i => i.cid === selectedIds[0]))} className="btn small">分享</button>
            </>
          )}
        </div>
      )}

      {/* 传输面板 */}
      {isTransferPanelOpen && (
        <ModalOverlay onClose={() => setIsTransferPanelOpen(false)} closeOnOverlayClick={true}>
          <div className="transfer-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>传输</h3>
              <button onClick={() => setIsTransferPanelOpen(false)} className="modal-close-btn"><X size={18} /></button>
            </div>
            {transfers.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24, fontSize: 13 }}>
                暂无传输
              </div>
            ) : (
              transfers.map(t => (
                <div key={t.id} className="transfer-item">
                  <div className="transfer-item-header">
                    {t.type === 'upload' ? <Upload size={14} /> : <Download size={14} />}
                    <span className="transfer-item-name">{t.fileName}</span>
                    {t.status === 'uploading' && t.type === 'download' && (
                      <button onClick={() => handleCancelTransfer(t)} className="transfer-item-cancel">
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  <div className="transfer-progress-row">
                    <div className="transfer-progress-bar">
                      <div
                        className={`transfer-progress-fill ${t.type === 'download' ? 'download' : ''} ${t.status === 'error' ? 'error' : ''} ${t.status === 'cancelled' ? 'cancelled' : ''}`}
                        style={{ width: `${t.progress}%` }}
                      />
                    </div>
                    <span className="transfer-progress-text">
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

      {/* 通知列表 */}
      {toasts.map((t, i) => <Toast key={t.id} message={t.message} type={t.type} onDone={() => removeToast(t.id)} index={i} />)}

      {/* 引导页 */}
      {showWelcome && <WelcomeGuide onClose={handleCloseWelcome} onShutdown={() => {
        fetch('/api/shutdown', { method: 'POST' })
        addToast('服务已关闭，请重新启动应用', 'info')
        handleCloseWelcome()
      }} />}

      {/* 设置弹窗 */}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} addToast={addToast} isDarkMode={isDarkMode} handleShutdown={handleShutdown} />}
    </div>
  )
}
