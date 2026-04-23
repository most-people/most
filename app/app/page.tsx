'use client'

import React, { useState, useEffect, useRef } from 'react'
import {
  Upload,
  Sun,
  Moon,
  Image as ImageIcon,
  Trash2,
  Folder,
  Film,
  Music,
  ChevronRight,
  FileText,
  MessageSquare,
  X,
  Check,
  Copy,
  Download,
  ArrowUpDown,
  Star,
  Files,
  HardDrive,
  Search,
  Info,
  Power,
  Edit2,
  Loader,
  Globe,
  Link,
  ChevronDown,
  Settings,
  Wallet,
} from 'lucide-react'
import AppShell, { useAppShell } from '../../components/AppShell'
import { ModalOverlay, ConfirmModal, InputModal } from '../../components/ui'
import { api } from '../../server/src/utils/api'
import { useApp } from './AppProvider'
import { useDisclosure, useClipboard } from '../../hooks'

interface NetworkAddress {
  type: string
  ip: string
  label: string
  iface: string
}

interface DataPathResponse {
  dataPath: string
  isDefault: boolean
}

interface NetworkResponse {
  port: number
  addresses: NetworkAddress[]
}

interface ToggleStarResponse {
  success: boolean
  cid: string
  starred: boolean
}

interface StorageStats {
  total: number
  used: number
  free: number
  fileCount: number
  trashCount: number
}

const API = {
  listPublishedFiles: () => api.get('/api/files').json<any[]>(),
  listTrashFiles: () => api.get('/api/trash').json<any[]>(),
  deletePublishedFile: cid => api.delete(`/api/files/${cid}`).json(),
  restoreTrashFile: cid => api.post(`/api/trash/${cid}/restore`).json(),
  permanentDeleteTrashFile: cid => api.delete(`/api/trash/${cid}`).json(),
  emptyTrash: () => api.delete('/api/trash').json(),
  toggleStar: cid =>
    api.post<ToggleStarResponse>(`/api/files/${cid}/star`).json(),
  getStorageStats: () => api.get<StorageStats>('/api/storage').json(),
  getConfig: () => api.get('/api/config').json<any>(),
  getDataPath: () => api.get<DataPathResponse>('/api/config/data-path').json(),
  getNetworkAddresses: () => api.get<NetworkResponse>('/api/network').json(),
  saveConfig: config =>
    api
      .post('/api/config', {
        json: config,
      })
      .json(),
  async publishFile(file, customName) {
    const formData = new FormData()
    formData.append('file', file, customName || file.name)
    const res = await api.post('/api/publish', { body: formData })
    if (!res.ok) {
      const err = await res
        .json<{ error: string }>()
        .catch(() => ({ error: res.statusText }))
      throw new Error(err.error || 'Request failed')
    }
    return res.json<any>()
  },
  downloadFile: link =>
    api.post('/api/download', { json: { link } }).json<any>(),
  cancelDownload: taskId =>
    api.post('/api/download/cancel', { json: { taskId } }).json<any>(),
  getFileDownloadUrl: cid => `/api/files/${cid}/download`,
  moveFile: (cid, newFileName) =>
    api.post('/api/move', { json: { cid, newFileName } }).json<any>(),
  renameFolder: (oldPath, newPath) =>
    api.post('/api/folder/rename', { json: { oldPath, newPath } }).json<any>(),
}

function formatSize(bytes) {
  if (!bytes || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatDate(dateString) {
  if (!dateString) return ''
  return new Date(dateString).toLocaleDateString('zh-CN')
}

function parseName(fullPath) {
  const lastSlash = fullPath.lastIndexOf('/')
  if (lastSlash === -1) return { folder: '', name: fullPath }
  return {
    folder: fullPath.substring(0, lastSlash),
    name: fullPath.substring(lastSlash + 1),
  }
}

function getUniqueFolders(files: { fileName: string }[]): string[] {
  const folders = new Set<string>()
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
  return allFolders
    .filter(f => {
      const isUnder = f.toLowerCase().startsWith(prefix.toLowerCase())
      const remainder = f.substring(prefix.length)
      return isUnder && !remainder.includes('/')
    })
    .map(f => ({ name: f.substring(prefix.length), path: f }))
}

function getItemsForPath(files, allFolders, currentPath) {
  return {
    folders: getCurrentFolders(allFolders, currentPath),
    files: files.filter(f => parseName(f.fileName).folder === currentPath),
  }
}

function getFileSubtype(fileName) {
  const ext = fileName.split('.').pop().toLowerCase()
  const imgExts = [
    'jpg',
    'jpeg',
    'png',
    'gif',
    'webp',
    'svg',
    'bmp',
    'ico',
    'tiff',
    'heic',
    'heif',
  ]
  const vidExts = [
    'mp4',
    'webm',
    'mov',
    'avi',
    'mkv',
    'flv',
    'wmv',
    'm4v',
    'mpeg',
    '3gp',
  ]
  const audExts = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus']
  const txtExts = [
    'txt',
    'md',
    'js',
    'ts',
    'jsx',
    'tsx',
    'css',
    'scss',
    'less',
    'json',
    'xml',
    'html',
    'htm',
    'yaml',
    'yml',
    'toml',
    'ini',
    'cfg',
    'conf',
    'log',
    'sh',
    'bash',
    'py',
    'rb',
    'go',
    'rs',
    'java',
    'c',
    'cpp',
    'h',
    'hpp',
    'cs',
    'php',
    'sql',
    'graphql',
    'env',
    'gitignore',
    'dockerfile',
    'readme',
  ]
  if (imgExts.includes(ext)) return 'image'
  if (vidExts.includes(ext)) return 'video'
  if (audExts.includes(ext)) return 'audio'
  if (txtExts.includes(ext)) return 'text'
  return 'file'
}

function generateBreadcrumbs(currentPath) {
  if (!currentPath) return []
  return [
    { path: '', name: '全部内容' },
    ...currentPath
      .split('/')
      .filter(Boolean)
      .map((part, i, arr) => ({
        path: arr.slice(0, i + 1).join('/'),
        name: part,
      })),
  ]
}

const createRefreshHandler = (setter, apiMethod) => async () => {
  try {
    setter(await apiMethod())
  } catch (err) {
    console.info(err)
  }
}

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
      <p className="card-name">{parseName(file.fileName).name}</p>
    </div>
  )
}

function FolderCard({ folder, isDarkMode, onClick }) {
  return (
    <div onClick={onClick} className="card">
      <div className="card-icon folder">
        <Folder size={28} color="#fff" />
      </div>
      <p className="card-name">{folder.name}</p>
    </div>
  )
}

function MoveModal({ items, allFolders, currentPath, onMove, onClose }) {
  const [targetPath, setTargetPath] = useState('')
  const [customPath, setCustomPath] = useState(currentPath)

  const breadcrumbParts = generateBreadcrumbs(targetPath)

  const handleConfirm = () => {
    const finalPath = targetPath || customPath.trim()
    onMove(finalPath)
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="move-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>移动到</h3>
          <button onClick={onClose} className="modal-close-btn">
            <X size={18} />
          </button>
        </div>
        <p className="move-modal-desc">已选 {items.length} 个项目</p>
        <div className="move-new-folder">
          <input
            type="text"
            value={customPath}
            onChange={e => setCustomPath(e.target.value)}
            placeholder="输入路径创建嵌套文件夹"
          />
        </div>
        <p className="move-modal-hint">如 图片/壁纸</p>
        <div className="move-breadcrumb">
          {breadcrumbParts.map((part, i) => (
            <React.Fragment key={part.path}>
              {i > 0 && <span className="breadcrumb-separator">/</span>}
              <button
                key={part.path}
                onClick={() => {
                  setTargetPath(part.path)
                  setCustomPath(part.path)
                }}
                className={`move-breadcrumb-btn ${targetPath === part.path && !customPath ? 'active' : ''}`}
              >
                {part.name}
              </button>
            </React.Fragment>
          ))}
        </div>
        <div className="move-folder-list">
          {allFolders.filter(f => {
            if (targetPath === '') {
              return !f.path.includes('/')
            }
            const prefix = targetPath + '/'
            if (!f.path.startsWith(prefix)) return false
            const relativePath = f.path.substring(prefix.length)
            return !relativePath.includes('/')
          }).length === 0 && (
            <p className="move-modal-empty">该目录下没有子文件夹</p>
          )}
          {allFolders
            .filter(f => {
              if (targetPath === '') {
                return !f.path.includes('/')
              }
              const prefix = targetPath + '/'
              if (!f.path.startsWith(prefix)) return false
              const relativePath = f.path.substring(prefix.length)
              return !relativePath.includes('/')
            })
            .map(folder => (
              <button
                key={folder.path}
                onClick={() => setTargetPath(folder.path)}
                className={`move-folder-item ${targetPath === folder.path && !customPath ? 'selected' : ''}`}
              >
                <Folder size={16} />
                <span>{folder.name}</span>
              </button>
            ))}
        </div>
        <div className="modal-actions">
          <button onClick={onClose} className="btn secondary">
            取消
          </button>
          <button onClick={handleConfirm} className="btn primary">
            移动
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}

export default function App() {
  const {
    isDarkMode,
    setIsDarkMode,
    addToast,
    openSettings,
    showBackendWarning,
  } = useApp()
  const [items, setItems] = useState([])
  const [trashItems, setTrashItems] = useState([])
  const [currentFolderId, setCurrentFolderId] = useState(null)
  const [currentView, setCurrentView] = useState('all')
  const [isDraggingOverUpload, setIsDraggingOverUpload] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [previewItem, setPreviewItem] = useState(null)
  const [shareItem, setShareItem] = useState(null)
  const [isDownloadModalOpen, downloadModal] = useDisclosure(false)
  const [downloadLink, setDownloadLink] = useState('')
  const [transfers, setTransfers] = useState([])
  const [isTransferPanelOpen, transferPanel] = useDisclosure(false)
  const [searchQuery, setSearchQuery] = useState('')
  const { copy: copyLink, copied: linkCopied } = useClipboard({ timeout: 2000 })
  const [peerCount, setPeerCount] = useState(0)
  const [storageStats, setStorageStats] = useState({
    total: 0,
    used: 0,
    free: 0,
  })
  const [isMoveModalOpen, moveModal] = useDisclosure(false)
  const [confirmModal, setConfirmModal] = useState(null)
  const [inputModal, setInputModal] = useState(null)
  const [inputLoading, setInputLoading] = useState(false)
  const [renameTarget, setRenameTarget] = useState(null)
  const [previewText, setPreviewText] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewMediaLoading, setPreviewMediaLoading] = useState(false)
  const [previewLoaded, setPreviewLoaded] = useState(false)
  const previewMediaRef = useRef(null)
  const previewTextRef = useRef(null)

  useEffect(() => {
    if (
      previewItem &&
      (previewItem.subtype === 'image' || previewItem.subtype === 'video')
    ) {
      setPreviewMediaLoading(true)
      setPreviewLoaded(false)
    }
    if (previewItem && previewItem.subtype === 'text') {
      setPreviewText('')
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
    ? items.filter(f =>
        parseName(f.fileName)
          .name.toLowerCase()
          .includes(searchQuery.toLowerCase())
      )
    : files

  const refreshFiles = createRefreshHandler(setItems, () =>
    API.listPublishedFiles().then(r => r || [])
  )
  const refreshTrash = createRefreshHandler(setTrashItems, () =>
    API.listTrashFiles().then(r => r || [])
  )
  const refreshStorageStats = createRefreshHandler(
    setStorageStats,
    API.getStorageStats
  )

  const handleSelect = id => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  const handleDelete = async id => {
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
        } catch {
          addToast('删除失败', 'error')
        }
      },
    })
  }

  const handleFolderDelete = async folder => {
    const toDelete = items.filter(
      i =>
        parseName(i.fileName).folder.toLowerCase() === folder.path.toLowerCase()
    )
    setConfirmModal({
      title: '确认删除',
      message:
        toDelete.length > 0
          ? `确定要删除文件夹中的 ${toDelete.length} 个文件吗？`
          : '确定要删除此文件夹吗？',
      confirmText: '删除',
      danger: true,
      onConfirm: async () => {
        setConfirmModal(null)
        try {
          for (const f of toDelete) {
            if (f.cid) await API.deletePublishedFile(f.cid)
          }
          addToast('已删除', 'success')
          refreshFiles()
          refreshTrash()
          refreshStorageStats()
        } catch {
          addToast('删除失败', 'error')
        }
      },
    })
  }

  const handlePermanentDelete = async cid => {
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
        } catch {
          addToast('删除失败', 'error')
        }
      },
    })
  }

  const handleRestore = async cid => {
    try {
      await API.restoreTrashFile(cid)
      addToast('已恢复', 'success')
      refreshFiles()
      refreshTrash()
      refreshStorageStats()
    } catch {
      addToast('恢复失败', 'error')
    }
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
        } catch {
          addToast('清空失败', 'error')
        }
      },
    })
  }

  const handleToggleStar = async cid => {
    try {
      const result = await API.toggleStar(cid)
      setItems(prev =>
        prev.map(i => (i.cid === cid ? { ...i, starred: result.starred } : i))
      )
      addToast(result.starred ? '已收藏' : '已取消收藏', 'success')
    } catch {
      addToast('操作失败', 'error')
    }
  }

  const handleBatchDelete = async () => {
    const isTrash = currentView === 'trash'
    setConfirmModal({
      title: isTrash ? '永久删除' : '批量删除',
      message: isTrash
        ? `确定要永久删除选中的 ${selectedIds.length} 个项目吗？此操作不可恢复！`
        : `确定要删除选中的 ${selectedIds.length} 个项目吗？`,
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
        } catch {
          addToast('删除失败', 'error')
        }
      },
    })
  }

  const handleMove = async targetPath => {
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
      moveModal.close()
      addToast('已移动', 'success')
      refreshFiles()
    } catch {
      addToast('移动失败', 'error')
    }
  }

  const openRenameModal = target => {
    const isFolder = !!target.path
    const currentName = isFolder ? target.name : parseName(target.fileName).name
    setInputModal({
      title: isFolder ? '重命名文件夹' : '重命名文件',
      placeholder: '请输入新名称',
      defaultValue: currentName,
      confirmText: '重命名',
      onConfirm: async newName => {
        if (newName === currentName) return
        setInputLoading(true)
        try {
          if (isFolder) {
            const lastSlash = target.path.lastIndexOf('/')
            const parentPath =
              lastSlash !== -1 ? target.path.substring(0, lastSlash) : ''
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
      },
    })
  }

  const processFiles = async (files: FileList) => {
    const prefix = currentPath ? currentPath + '/' : ''
    const newTransfers = []

    for (const file of Array.from(files)) {
      const fileName = prefix + file.name

      const nameExists = items.some(item => item.fileName === fileName)
      if (nameExists) {
        addToast(`${file.name} 已存在`, 'warning')
        continue
      }

      const transferId = `upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const transfer = {
        id: transferId,
        fileName: file.name,
        progress: 0,
        type: 'upload',
        status: 'uploading',
      }
      newTransfers.push(transfer)
      setTransfers(prev => [...prev, transfer])

      if (newTransfers.length > 0) {
        transferPanel.open()
      }

      try {
        const result = await API.publishFile(file, fileName)
        if (result.alreadyExists) {
          setTransfers(prev =>
            prev.map(t =>
              t.id === transferId ? { ...t, status: 'completed' } : t
            )
          )
          addToast(`${file.name} 已存在`, 'warning')
        } else {
          setTransfers(prev =>
            prev.map(t =>
              t.id === transferId
                ? { ...t, progress: 100, status: 'completed' }
                : t
            )
          )
          addToast(`${file.name} 上传成功`, 'success')
        }
      } catch (err) {
        setTransfers(prev =>
          prev.map(t => (t.id === transferId ? { ...t, status: 'error' } : t))
        )
        addToast(`上传失败: ${file.name}`, 'error')
      }
    }

    setTimeout(() => {
      setTransfers(prev =>
        prev.filter(
          t =>
            t.status !== 'completed' &&
            t.status !== 'error' &&
            t.status !== 'cancelled'
        )
      )
    }, 3000)

    refreshFiles()
    refreshStorageStats()
  }

  const loadPreviewText = async cid => {
    setPreviewLoading(true)
    try {
      const res = await fetch(`/api/files/${cid}/download`, {
        headers: { Range: 'bytes=0-9999' },
      })
      if (!res.ok) throw new Error('加载失败')
      const text = await res.text()
      setPreviewText(text || '（文件为空）')
    } catch {
      setPreviewText('加载失败')
    }
    setPreviewLoading(false)
  }

  const handleCopyLink = () => {
    copyLink(`most://${shareItem.cid}?filename=${shareItem.fileName}`)
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
      downloadModal.close()

      if (result.alreadyExists) {
        addToast(`${result.fileName} 已存在`, 'warning')
      } else {
        const transfer = {
          id: result.taskId,
          fileName: '下载文件',
          progress: 0,
          type: 'download',
          status: 'downloading',
        }
        setTransfers(prev => [...prev, transfer])
        transferPanel.open()
        addToast('下载已开始', 'info')
      }
    } catch (err) {
      addToast('下载失败', 'error')
    } finally {
      setIsDownloading(false)
    }
  }

  const handleCancelTransfer = async transfer => {
    if (transfer.type === 'download' && transfer.status === 'downloading') {
      try {
        await API.cancelDownload(transfer.id)
      } catch (err) {
        addToast('取消失败', 'error')
      }
    }
  }

  const handleSaveAs = async file => {
    try {
      const res = await fetch(API.getFileDownloadUrl(file.cid))
      if (!res.ok) throw new Error('获取文件失败')
      const blob = await res.blob()
      const showSaveFilePicker = (window as any).showSaveFilePicker
      if (showSaveFilePicker) {
        const handle = await showSaveFilePicker({
          suggestedName: file.fileName,
        })
        const writable = await handle.createWritable()
        await writable.write(blob)
        await writable.close()
        addToast('文件已保存', 'success')
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = file.fileName
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        addToast('文件已下载', 'success')
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        addToast('保存失败: ' + err.message, 'error')
      }
    }
  }

  const handleNavigate = path => {
    setCurrentFolderId(path || null)
    setSelectedIds([])
  }

  useEffect(() => {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(
      `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`
    )
    ws.onmessage = e => {
      try {
        const { event, data } = JSON.parse(e.data)
        if (event === 'publish:success' || event === 'download:success') {
          refreshFiles()
          refreshStorageStats()
          const taskId = data.taskId || data.fileName
          setTransfers(prev =>
            prev.map(t =>
              t.id === taskId || t.fileName === data.fileName
                ? { ...t, progress: 100, status: 'completed' }
                : t
            )
          )
          if (event === 'download:success') {
            if (data.alreadyExists) {
              addToast(`${data.fileName} 已存在`, 'warning')
            } else {
              addToast(`${data.fileName} 下载完成`, 'success')
            }
            setTimeout(() => {
              setTransfers(prev =>
                prev.filter(t => !(t.id === taskId && t.status === 'completed'))
              )
            }, 3000)
          }
        }
        if (event === 'publish:progress') {
          setTransfers(prev =>
            prev.map(t => {
              if (
                data.file &&
                t.fileName === data.file &&
                t.type === 'upload'
              ) {
                let progress = 50
                if (data.stage === 'calculating-cid') progress = 25
                else if (data.stage === 'uploading') progress = 75
                else if (data.stage === 'complete') progress = 100
                return { ...t, progress }
              }
              return t
            })
          )
        }
        if (event === 'download:progress') {
          setTransfers(prev =>
            prev.map(t =>
              t.id === data.taskId
                ? {
                    ...t,
                    progress: data.percent || 0,
                    loaded: data.loaded,
                    total: data.total,
                  }
                : t
            )
          )
        }
        if (event === 'download:error') {
          setTransfers(prev =>
            prev.map(t =>
              t.id === data.taskId ? { ...t, status: 'error' } : t
            )
          )
          addToast(`下载失败: ${data.error}`, 'error')
        }
        if (event === 'network:status') {
          setPeerCount(data.peers || 0)
        }
        if (event === 'download:status') {
          setTransfers(prev =>
            prev.map(t =>
              t.id === data.taskId
                ? { ...t, fileName: data.file || t.fileName }
                : t
            )
          )
        }
        if (event === 'download:cancelled') {
          setTransfers(prev =>
            prev.map(t =>
              t.id === data.taskId ? { ...t, status: 'cancelled' } : t
            )
          )
          addToast('下载已取消', 'warning')
        }
      } catch {}
    }
    return () => ws.close()
  }, [])

  useEffect(() => {
    refreshFiles()
    refreshTrash()
    refreshStorageStats()
    API.getStorageStats()
      .then(s => setStorageStats(s))
      .catch(() => {})
  }, [])

  const viewTitle =
    currentView === 'all'
      ? '全部内容'
      : currentView === 'starred'
        ? '收藏'
        : '回收站'
  const displayFiles =
    currentView === 'all'
      ? filteredFiles
      : currentView === 'starred'
        ? items.filter(
            i =>
              i.starred &&
              parseName(i.fileName)
                .name.toLowerCase()
                .includes(searchQuery.toLowerCase())
          )
        : trashItems.filter(i =>
            parseName(i.fileName)
              .name.toLowerCase()
              .includes(searchQuery.toLowerCase())
          )
  const displayFolders =
    currentView === 'starred'
      ? []
      : folders.filter(f =>
          f.name.toLowerCase().includes(searchQuery.toLowerCase())
        )

  const breadcrumbParts = generateBreadcrumbs(currentPath)

  return (
    <AppShell
      sidebar={({ closeSidebar }) => (
        <>
          <div
            className="sidebar-header"
            onClick={() => (window.location.href = '/')}
            style={{ cursor: 'pointer' }}
          >
            <h1>MOST PEOPLE</h1>
          </div>
          <nav className="sidebar-nav">
            {[
              { id: 'all', icon: <Files size={18} />, label: '全部内容' },
              { id: 'starred', icon: <Star size={18} />, label: '收藏' },
              { id: 'trash', icon: <Trash2 size={18} />, label: '回收站' },
            ].map(item => (
              <button
                key={item.id}
                onClick={() => {
                  setCurrentView(item.id)
                  setCurrentFolderId(null)
                  setSelectedIds([])
                  setSearchQuery('')
                  closeSidebar()
                }}
                className={`sidebar-nav-btn ${currentView === item.id ? 'active' : ''}`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="sidebar-tools">
            <div className="sidebar-tools-label">工具</div>
            <button
              onClick={() => (window.location.href = '/app/chat/')}
              className="sidebar-nav-btn"
            >
              <MessageSquare size={18} />
              <span>聊天</span>
            </button>
            <button
              onClick={() => (window.location.href = '/web3/')}
              className="sidebar-nav-btn"
            >
              <Wallet size={18} />
              <span>Web3</span>
            </button>
          </div>
          <div className="sidebar-footer">
            <div className="sidebar-footer-label">
              <HardDrive size={14} />
              <span>存储空间</span>
            </div>
            <div className="storage-bar">
              <div
                className="storage-bar-fill"
                style={{
                  width: `${storageStats.total > 0 ? (storageStats.used / storageStats.total) * 100 : 0}%`,
                }}
              />
            </div>
            <div className="storage-info">
              <span>{formatSize(storageStats.used)}</span>
              <span>
                {storageStats.total > 0 ? formatSize(storageStats.total) : '-'}
              </span>
            </div>
          </div>
        </>
      )}
      headerTitle={<h2 className="header-title">{viewTitle}</h2>}
      headerRight={
        <>
          <div className="search-box">
            <Search size={14} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜索..."
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')}>
                <X size={12} />
              </button>
            )}
          </div>
          {currentView === 'trash' && trashItems.length > 0 && (
            <button
              onClick={handleEmptyTrash}
              className="btn small btn-empty-trash"
            >
              清空回收站
            </button>
          )}
          <button onClick={() => transferPanel.open()} className="icon-btn">
            <ArrowUpDown size={16} />
            {transfers.length > 0 && (
              <span className="icon-btn-badge">{transfers.length}</span>
            )}
          </button>
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="icon-btn theme-toggle"
          >
            {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button onClick={() => openSettings()} className="icon-btn">
            <Info size={16} />
          </button>
        </>
      }
    >
      {currentView === 'all' && (
        <div className="action-grid">
          <div
            className={`action-card upload ${isDraggingOverUpload ? 'drag-over' : ''}`}
            onDragOver={e => {
              e.preventDefault()
              setIsDraggingOverUpload(true)
            }}
            onDragLeave={() => setIsDraggingOverUpload(false)}
            onDrop={e => {
              e.preventDefault()
              setIsDraggingOverUpload(false)
              processFiles(e.dataTransfer.files)
            }}
          >
            <input
              type="file"
              multiple
              onChange={e => processFiles(e.target.files)}
              className="action-card-input"
            />
            <Upload size={20} className="action-grid-icon" />
            <p>上传文件</p>
          </div>
          <div
            className="action-card action-card-download"
            onClick={() => downloadModal.open()}
          >
            <Download size={20} className="action-grid-icon" />
            <p>下载文件</p>
          </div>
        </div>
      )}

      {currentView === 'all' && (
        <div className="breadcrumb">
          {currentPath ? (
            <>
              <button onClick={() => handleNavigate('')}>全部内容</button>
              {breadcrumbParts.slice(1).map((part, i) => (
                <React.Fragment key={part.path}>
                  <ChevronRight size={12} />
                  <button
                    onClick={() => handleNavigate(part.path)}
                    className={
                      i === breadcrumbParts.length - 2 ? 'current' : ''
                    }
                  >
                    {part.name}
                  </button>
                  {i === breadcrumbParts.length - 2 && (
                    <button
                      onClick={() => openRenameModal(part)}
                      className="breadcrumb-edit-btn"
                    >
                      <Edit2 size={12} />
                    </button>
                  )}
                </React.Fragment>
              ))}
            </>
          ) : null}
        </div>
      )}

      <div className="content-grid">
        {currentView === 'trash' &&
          (displayFiles.length === 0 ? (
            <div className="empty-state">
              {searchQuery ? '未找到相关文件' : '回收站是空的'}
            </div>
          ) : (
            <div className="file-grid">
              {displayFiles.map(f => (
                <div
                  key={f.cid}
                  onClick={() =>
                    setSelectedIds(prev =>
                      prev.includes(f.cid)
                        ? prev.filter(id => id !== f.cid)
                        : [...prev, f.cid]
                    )
                  }
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
          ))}

        {currentView !== 'trash' &&
          (displayFiles.length === 0 && displayFolders.length === 0 ? (
            <div className="empty-state">
              {searchQuery
                ? '未找到相关文件'
                : currentView === 'starred'
                  ? '暂无的收藏'
                  : '暂无文件'}
            </div>
          ) : (
            <div className="file-grid">
              {displayFolders.map(folder => (
                <FolderCard
                  key={folder.path}
                  folder={folder}
                  isDarkMode={isDarkMode}
                  onClick={() => handleNavigate(folder.path)}
                />
              ))}
              {displayFiles.map(f => (
                <FileCard
                  key={f.cid}
                  file={f}
                  isSelected={selectedIds.includes(f.cid)}
                  isDarkMode={isDarkMode}
                  onSelect={handleSelect}
                  onPreview={file =>
                    setPreviewItem({
                      ...file,
                      subtype: getFileSubtype(file.fileName),
                    })
                  }
                />
              ))}
            </div>
          ))}
      </div>

      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          confirmText={confirmModal.confirmText}
          danger={confirmModal.danger}
          closeOnOverlayClick={confirmModal.danger}
          onConfirm={confirmModal.onConfirm}
          onClose={() => setConfirmModal(null)}
        />
      )}

      {inputModal && (
        <InputModal
          title={inputModal.title}
          placeholder={inputModal.placeholder}
          defaultValue={inputModal.defaultValue}
          confirmText={inputModal.confirmText}
          isLoading={inputLoading}
          onConfirm={inputModal.onConfirm}
          onClose={() => setInputModal(null)}
        />
      )}

      {isMoveModalOpen && (
        <MoveModal
          items={selectedIds
            .map(id => items.find(i => i.cid === id))
            .filter(Boolean)}
          allFolders={allFolders.map(path => ({
            path,
            name: path.split('/').pop(),
          }))}
          currentPath={currentPath}
          onMove={handleMove}
          onClose={() => moveModal.close()}
        />
      )}

      {shareItem && (
        <ModalOverlay onClose={() => setShareItem(null)}>
          <div className="share-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>分享链接</h3>
              <button
                onClick={() => setShareItem(null)}
                className="modal-close-btn"
              >
                <X size={18} />
              </button>
            </div>
            <div className="share-link-box">
              <div className="share-link-text">
                most://{shareItem.cid}?filename={shareItem.fileName}
              </div>
              <button
                onClick={handleCopyLink}
                className={`share-copy-btn ${linkCopied ? 'copied' : ''}`}
              >
                {linkCopied ? <Check size={18} /> : <Copy size={18} />}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {isDownloadModalOpen && (
        <ModalOverlay onClose={() => downloadModal.close()}>
          <div className="download-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>下载文件</h3>
              <button
                onClick={() => downloadModal.close()}
                className="modal-close-btn"
              >
                <X size={18} />
              </button>
            </div>
            <input
              type="text"
              value={downloadLink}
              onChange={e => setDownloadLink(e.target.value)}
              placeholder="most://..."
              onKeyDown={e => e.key === 'Enter' && handleDownloadSharedFile()}
              className="download-input"
            />
            <button
              onClick={handleDownloadSharedFile}
              disabled={!downloadLink.trim() || isDownloading}
              className="download-btn"
            >
              {isDownloading ? '下载中...' : '开始下载'}
            </button>
          </div>
        </ModalOverlay>
      )}

      {previewItem && (
        <div
          className="preview-overlay"
          onClick={() => {
            setPreviewItem(null)
            setPreviewText('')
            setPreviewMediaLoading(false)
          }}
        >
          <button className="preview-close">
            <X size={20} />
          </button>
          <div onClick={e => e.stopPropagation()}>
            {previewItem.subtype === 'image' && (
              <div className="preview-media-wrapper">
                <img
                  ref={previewMediaRef}
                  src={API.getFileDownloadUrl(previewItem.cid)}
                  alt=""
                />
              </div>
            )}
            {previewItem.subtype === 'video' && (
              <div className="preview-media-wrapper">
                <video
                  ref={previewMediaRef}
                  src={API.getFileDownloadUrl(previewItem.cid)}
                  controls
                />
              </div>
            )}
            {previewItem.subtype === 'audio' && (
              <div className="preview-audio">
                <div className="preview-audio-icon">
                  <Music size={36} color="var(--accent)" />
                </div>
                <p className="preview-audio-filename">{previewItem.fileName}</p>
                <audio
                  className="preview-audio-player"
                  src={API.getFileDownloadUrl(previewItem.cid)}
                  controls
                />
              </div>
            )}
            {previewItem.subtype === 'file' && (
              <div className="preview-unsupported">
                <FileText size={48} className="preview-file-icon" />
                <p>{previewItem.fileName}</p>
                <p className="preview-unsupported-hint">无法预览</p>
              </div>
            )}
            {previewItem.subtype === 'text' && (
              <div className="preview-text-container">
                <div className="preview-text-header">
                  <span>{previewItem.fileName}</span>
                </div>
                {previewLoading ? (
                  <div className="preview-text-loading">
                    <Loader size={24} className="preview-text-spinner" />
                    <p>正在加载文本预览...</p>
                    <p className="preview-text-loading-hint">
                      如果是初次预览，可能需要等待 P2P 网络同步
                    </p>
                  </div>
                ) : (
                  <pre className="preview-text">
                    {previewText || '（文件为空）'}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {selectedIds.length > 0 && (
        <div className="batch-bar">
          <span className="batch-info">已选 {selectedIds.length} 项</span>
          <button onClick={() => setSelectedIds([])} className="batch-dismiss">
            <X size={16} />
          </button>
          <div className="batch-divider" />
          {currentView === 'trash' ? (
            <>
              <button
                onClick={async () => {
                  await Promise.all(
                    selectedIds.map(cid => API.restoreTrashFile(cid))
                  )
                  setSelectedIds([])
                  addToast('已恢复', 'success')
                  refreshFiles()
                  refreshTrash()
                  refreshStorageStats()
                }}
                className="btn small"
              >
                恢复
              </button>
              <button onClick={handleBatchDelete} className="btn small danger">
                永久删除
              </button>
            </>
          ) : (
            <>
              {selectedIds.length === 1 &&
                (() => {
                  const file = items.find(i => i.cid === selectedIds[0])
                  return file && getFileSubtype(file.fileName) !== 'file'
                })() && (
                  <button
                    onClick={() => {
                      const file = items.find(i => i.cid === selectedIds[0])
                      if (file) {
                        const subtype = getFileSubtype(file.fileName)
                        setPreviewItem({ ...file, subtype })
                        setPreviewText('')
                        if (subtype === 'text') loadPreviewText(file.cid)
                      }
                    }}
                    className="btn small"
                  >
                    预览
                  </button>
                )}
              <button
                onClick={() => {
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
                }}
                className="btn small btn-star"
              >
                收藏
              </button>
              {selectedIds.length === 1 && (
                <button
                  onClick={() => {
                    const firstSelected = items.find(
                      i => i.cid === selectedIds[0]
                    )
                    if (firstSelected) openRenameModal(firstSelected)
                  }}
                  className="btn small"
                >
                  重命名
                </button>
              )}
              <button
                onClick={() => moveModal.open()}
                className="btn small btn-move"
              >
                移动
              </button>
              <button onClick={handleBatchDelete} className="btn small danger">
                删除
              </button>
              {selectedIds.length === 1 && (
                <button
                  onClick={() =>
                    setShareItem(items.find(i => i.cid === selectedIds[0]))
                  }
                  className="btn small"
                >
                  分享
                </button>
              )}
              {selectedIds.length === 1 && (
                <button
                  onClick={() => {
                    const file = items.find(i => i.cid === selectedIds[0])
                    if (file) handleSaveAs(file)
                  }}
                  className="btn small"
                >
                  另存为
                </button>
              )}
            </>
          )}
        </div>
      )}

      {isTransferPanelOpen && (
        <ModalOverlay
          onClose={() => transferPanel.close()}
          closeOnOverlayClick={true}
        >
          <div className="transfer-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>传输</h3>
              <button
                onClick={() => transferPanel.close()}
                className="modal-close-btn"
              >
                <X size={18} />
              </button>
            </div>
            {transfers.length === 0 ? (
              <div className="empty-transfer">暂无传输</div>
            ) : (
              transfers.map(t => (
                <div key={t.id} className="transfer-item">
                  <div className="transfer-item-header">
                    {t.type === 'upload' ? (
                      <Upload size={14} />
                    ) : (
                      <Download size={14} />
                    )}
                    <span className="transfer-item-name">{t.fileName}</span>
                    {t.status === 'downloading' && t.type === 'download' && (
                      <button
                        onClick={() => handleCancelTransfer(t)}
                        className="transfer-item-cancel"
                      >
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
                      {t.status === 'completed'
                        ? '完成'
                        : t.status === 'error'
                          ? '失败'
                          : t.status === 'cancelled'
                            ? '已取消'
                            : t.loaded && t.total
                              ? `${formatSize(t.loaded)}/${formatSize(t.total)}`
                              : `${t.progress}%`}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </ModalOverlay>
      )}
    </AppShell>
  )
}
