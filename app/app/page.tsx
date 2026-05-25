'use client'

import React, { useState, useEffect } from 'react'
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
  X,
  Check,
  Copy,
  Download,
  ArrowUpDown,
  Star,
  Files,
  HardDrive,
  Search,
  Edit2,
  Loader,
  ArrowRight,
  Settings,
  Info,
} from 'lucide-react'
import AppShell from '~/components/AppShell'
import { ModalOverlay, ConfirmModal, InputModal } from '~/components/ui'
import {
  api,
  getApiErrorMessage,
  getApiErrorPayload,
  getApiUrl,
  getWebSocketUrl,
} from '~/server/src/utils/api'
import {
  getDownloadCheckErrorMessageFromPayload,
  getDownloadLinkValidationMessage,
} from '~/server/src/utils/downloadMessages.js'
import { useAppStore } from '~/app/app/useAppStore'
import { useDisclosure, useClipboard } from '~/hooks'
import Link from 'next/link'

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

interface DownloadCheckResponse {
  success: boolean
  available: boolean
  cid: string
  fileName: string
  size: number | null
  alreadyExists?: boolean
}

type DownloadCheckResult = {
  status: 'success' | 'error'
  link: string
  message: string
}

interface StorageStats {
  total: number
  used: number
  free: number
  fileCount: number
  trashCount: number
}

async function getDownloadCheckErrorMessage(err: unknown) {
  const data = await getApiErrorPayload(err)
  const errorName =
    err && typeof err === 'object' && 'name' in err
      ? String((err as { name?: string }).name)
      : ''
  return getDownloadCheckErrorMessageFromPayload(data, errorName)
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
  checkDownload: link =>
    api
      .post('/api/download/check', { json: { link }, timeout: 15000 })
      .json<DownloadCheckResponse>(),
  downloadFile: link =>
    api.post('/api/download', { json: { link } }).json<any>(),
  cancelDownload: taskId =>
    api.post('/api/download/cancel', { json: { taskId } }).json<any>(),
  getFileDownloadUrl: cid => getApiUrl(`/api/files/${cid}/download`),
  moveFile: (cid, newFileName) =>
    api.post('/api/move', { json: { cid, newFileName } }).json<any>(),
  renameFolder: (oldPath, newPath) =>
    api.post('/api/folder/rename', { json: { oldPath, newPath } }).json<any>(),
}

// Demo data for no-backend marketing preview. Not compatibility code.
const DEMO_FILES = [
  {
    cid: 'mock1',
    fileName: '示例文档.pdf',
    size: 2048576,
    createdAt: '2024-01-15',
    starred: false,
  },
  {
    cid: 'mock2',
    fileName: '项目截图.png',
    size: 1536000,
    createdAt: '2024-01-20',
    starred: true,
  },
  {
    cid: 'mock3',
    fileName: '会议录音.mp3',
    size: 5120000,
    createdAt: '2024-02-01',
    starred: false,
  },
  {
    cid: 'mock4',
    fileName: '演示视频.mp4',
    size: 52428800,
    createdAt: '2024-02-10',
    starred: false,
  },
  {
    cid: 'mock5',
    fileName: '代码备份.zip',
    size: 10485760,
    createdAt: '2024-02-15',
    starred: false,
  },
  {
    cid: 'mock6',
    fileName: '设计稿/首页设计.fig',
    size: 8388608,
    createdAt: '2024-02-20',
    starred: true,
  },
  {
    cid: 'mock7',
    fileName: '设计稿/图标集.svg',
    size: 512000,
    createdAt: '2024-02-22',
    starred: false,
  },
]

const DEMO_STORAGE = {
  total: 107374182400,
  used: 8053063680,
  free: 99321118720,
  fileCount: 42,
  trashCount: 3,
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

function FileCard({ file, isSelected, onSelect, onPreview }) {
  const subtype = getFileSubtype(file.fileName)
  let fileIcon = <FileText size={24} color="#fff" />

  if (subtype === 'image') {
    fileIcon = <ImageIcon size={24} color="#fff" />
  } else if (subtype === 'video') {
    fileIcon = <Film size={24} color="#fff" />
  } else if (subtype === 'audio') {
    fileIcon = <Music size={24} color="#fff" />
  }

  return (
    <div
      data-id={file.cid}
      onClick={() => onSelect(file.cid)}
      onDoubleClick={() => onPreview(file)}
      className={`card ${isSelected ? 'selected' : ''}`}
    >
      <div className={`card-icon ${file.starred ? 'starred' : 'file'}`}>
        {fileIcon}
      </div>
      <p className="card-name">{parseName(file.fileName).name}</p>
    </div>
  )
}

function FolderCard({ folder, onClick }) {
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
          <button onClick={onClose} className="btn btn-icon">
            <X size={18} />
          </button>
        </div>
        <p className="move-modal-desc">已选 {items.length} 个项目</p>
        <div className="move-new-folder">
          <input
            type="text"
            className="input"
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
          <button onClick={onClose} className="btn btn-secondary">
            取消
          </button>
          <button onClick={handleConfirm} className="btn btn-primary">
            移动
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}

export default function App() {
  const isDarkMode = useAppStore(s => s.isDarkMode)
  const setIsDarkMode = useAppStore(s => s.setIsDarkMode)
  const addToast = useAppStore(s => s.addToast)
  const hasBackend = useAppStore(s => s.hasBackend)
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
  const [downloadCheckResult, setDownloadCheckResult] =
    useState<DownloadCheckResult | null>(null)
  const [isCheckingDownload, setIsCheckingDownload] = useState(false)
  const [transfers, setTransfers] = useState([])
  const [isTransferPanelOpen, transferPanel] = useDisclosure(false)
  const [searchQuery, setSearchQuery] = useState('')
  const { copy: copyLink, copied: linkCopied } = useClipboard({ timeout: 2000 })
  const [storageStats, setStorageStats] = useState({
    total: 0,
    used: 0,
    free: 0,
  })
  const [isMoveModalOpen, moveModal] = useDisclosure(false)
  const [confirmModal, setConfirmModal] = useState(null)
  const [inputModal, setInputModal] = useState(null)
  const [inputLoading, setInputLoading] = useState(false)
  const [previewText, setPreviewText] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)

  useEffect(() => {
    if (previewItem && previewItem.subtype === 'text') {
      setPreviewText('')
      loadPreviewText(previewItem.cid)
    }
  }, [previewItem?.cid])

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

  const refreshFiles = async () => {
    try {
      const result = await API.listPublishedFiles()
      setItems(result || [])
    } catch {
      setItems(DEMO_FILES)
    }
  }
  const refreshTrash = async () => {
    try {
      const result = await API.listTrashFiles()
      setTrashItems(result || [])
    } catch {
      setTrashItems([])
    }
  }
  const refreshStorageStats = async () => {
    try {
      const result = await API.getStorageStats()
      setStorageStats(result)
    } catch {
      setStorageStats(DEMO_STORAGE)
    }
  }

  const handleSelect = id => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  const handleRestore = async cid => {
    try {
      await API.restoreTrashFile(cid)
      addToast('已恢复', 'success')
      refreshFiles()
      refreshTrash()
      refreshStorageStats()
    } catch (err) {
      addToast(await getApiErrorMessage(err, '恢复失败'), 'error')
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
        } catch (err) {
          addToast(await getApiErrorMessage(err, '清空失败'), 'error')
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
    } catch (err) {
      addToast(await getApiErrorMessage(err, '操作失败'), 'error')
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
        } catch (err) {
          addToast(await getApiErrorMessage(err, '删除失败'), 'error')
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
    } catch (err) {
      addToast(await getApiErrorMessage(err, '移动失败'), 'error')
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
        } catch (err) {
          addToast(await getApiErrorMessage(err, '重命名失败'), 'error')
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
          addToast(`${file.name} 已添加到本地`, 'success')
        }
      } catch (err) {
        setTransfers(prev =>
          prev.map(t => (t.id === transferId ? { ...t, status: 'error' } : t))
        )
        const message = await getApiErrorMessage(err, `发布失败: ${file.name}`)
        addToast(message, 'error')
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
      const res = await fetch(API.getFileDownloadUrl(cid), {
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
    copyLink(
      `most://${shareItem.cid}?filename=${encodeURIComponent(shareItem.fileName)}`
    )
  }

  const [isDownloading, setIsDownloading] = useState(false)
  const normalizedDownloadLink = downloadLink.trim()
  const isDownloadReady =
    downloadCheckResult?.status === 'success' &&
    downloadCheckResult.link === normalizedDownloadLink

  const closeDownloadModal = () => {
    downloadModal.close()
    setDownloadCheckResult(null)
  }

  const handleDownloadLinkChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDownloadLink(e.target.value)
    setDownloadCheckResult(null)
  }

  const handleCheckDownloadAvailability = async () => {
    const validationMessage = getDownloadLinkValidationMessage(
      normalizedDownloadLink
    )
    if (validationMessage) {
      setDownloadCheckResult({
        status: 'error',
        link: normalizedDownloadLink,
        message: validationMessage,
      })
      addToast(validationMessage, 'warning')
      return
    }

    if (isCheckingDownload || isDownloading) return

    setIsCheckingDownload(true)
    setDownloadCheckResult(null)
    try {
      const result = await API.checkDownload(normalizedDownloadLink)
      const message = result.alreadyExists
        ? `${result.fileName} 已在本机`
        : `${result.fileName} 可下载`
      setDownloadCheckResult({
        status: 'success',
        link: normalizedDownloadLink,
        message,
      })
      addToast(
        result.alreadyExists ? `${result.fileName} 已存在` : '检测通过',
        result.alreadyExists ? 'warning' : 'success'
      )
    } catch (err) {
      const message = await getDownloadCheckErrorMessage(err)
      setDownloadCheckResult({
        status: 'error',
        link: normalizedDownloadLink,
        message,
      })
      addToast(message, 'error')
    } finally {
      setIsCheckingDownload(false)
    }
  }

  const handleDownloadSharedFile = async () => {
    const validationMessage = getDownloadLinkValidationMessage(
      normalizedDownloadLink
    )
    if (validationMessage) {
      addToast(validationMessage, 'warning')
      return
    }
    if (!isDownloadReady) {
      addToast('请先检测链接可用性', 'warning')
      return
    }
    if (isDownloading) return
    setIsDownloading(true)
    try {
      const result = await API.downloadFile(normalizedDownloadLink)
      setDownloadLink('')
      setDownloadCheckResult(null)
      closeDownloadModal()

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
      const message = await getApiErrorMessage(err, '下载失败')
      addToast(message, 'error')
    } finally {
      setIsDownloading(false)
    }
  }

  const handleCancelTransfer = async transfer => {
    if (transfer.type === 'download' && transfer.status === 'downloading') {
      setTransfers(prev =>
        prev.map(t =>
          t.id === transfer.id ? { ...t, status: 'cancelling' } : t
        )
      )
      try {
        await API.cancelDownload(transfer.id)
      } catch (err) {
        setTransfers(prev =>
          prev.map(t =>
            t.id === transfer.id ? { ...t, status: 'downloading' } : t
          )
        )
        addToast(await getApiErrorMessage(err, '取消失败'), 'error')
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
    if (hasBackend !== true) return

    const ws = new WebSocket(getWebSocketUrl('/ws'))
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
      } catch (err) {
        console.warn('[App WS] Failed to parse message:', err.message)
      }
    }
    return () => ws.close()
  }, [hasBackend])

  useEffect(() => {
    if (hasBackend === true) {
      refreshFiles()
      refreshTrash()
      refreshStorageStats()
      return
    }

    if (hasBackend === false) {
      setItems(DEMO_FILES)
      setTrashItems([])
      setStorageStats(DEMO_STORAGE)
    }
  }, [hasBackend])

  const viewTitle =
    currentView === 'all'
      ? '本地'
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
            className="sidebar-header sidebar-header-link"
            onClick={() => (window.location.href = '/')}
          >
            <h1>MOST PEOPLE</h1>
          </div>
          <nav className="sidebar-nav">
            {[
              { id: 'all', icon: <Files size={18} />, label: '本地' },
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

          <div className="sidebar-footer">
            <div className="sidebar-footer-label">
              <HardDrive size={14} />
              <span>存储空间</span>
            </div>
            <div className="storage-bar">
              <progress
                className="storage-progress"
                value={storageStats.used}
                max={storageStats.total > 0 ? storageStats.total : 1}
                aria-label="存储空间使用量"
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
              className="btn btn-sm btn-empty-trash"
            >
              清空回收站
            </button>
          )}
          <button onClick={() => transferPanel.open()} className="btn btn-icon">
            <ArrowUpDown size={16} />
          </button>
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="btn btn-icon"
          >
            {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <Link
            href="/admin"
            className="btn btn-icon"
            aria-label="节点管理"
            title="节点管理"
          >
            <Settings size={16} />
          </Link>
        </>
      }
    >
      {hasBackend === false && (
        <div className="download-banner">
          <span>Web 端仅用于界面展示，下载桌面客户端获得完整功能</span>
          <Link href="/download" className="download-banner-btn">
            <Download size={14} />
            下载客户端
            <ArrowRight size={12} />
          </Link>
        </div>
      )}

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
            <p>发布文件</p>
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
                  : '暂无本地文件'}
            </div>
          ) : (
            <div className="file-grid">
              {displayFolders.map(folder => (
                <FolderCard
                  key={folder.path}
                  folder={folder}
                  onClick={() => handleNavigate(folder.path)}
                />
              ))}
              {displayFiles.map(f => (
                <FileCard
                  key={f.cid}
                  file={f}
                  isSelected={selectedIds.includes(f.cid)}
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
                className="btn btn-icon"
              >
                <X size={18} />
              </button>
            </div>
            <div className="share-link-box">
              <div className="share-link-text">
                {`most://${shareItem.cid}?filename=${encodeURIComponent(shareItem.fileName)}`}
              </div>
              <button
                onClick={handleCopyLink}
                className={`btn btn-circle btn-primary ${linkCopied ? 'copied' : ''}`}
              >
                {linkCopied ? <Check size={18} /> : <Copy size={18} />}
              </button>
            </div>
            <div className="share-storage-note">
              <span>本机在线时可下载；下载者完成后会默认继续做种。</span>
            </div>
          </div>
        </ModalOverlay>
      )}

      {isDownloadModalOpen && (
        <ModalOverlay onClose={closeDownloadModal}>
          <div className="download-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>下载文件</h3>
              <button onClick={closeDownloadModal} className="btn btn-icon">
                <X size={18} />
              </button>
            </div>
            <div className="download-link-row">
              <input
                type="text"
                className="input"
                value={downloadLink}
                onChange={handleDownloadLinkChange}
                placeholder="输入 most:// 链接"
              />
              <button
                type="button"
                onClick={handleCheckDownloadAvailability}
                disabled={
                  !normalizedDownloadLink || isCheckingDownload || isDownloading
                }
                className="btn btn-secondary download-check-btn"
              >
                {isCheckingDownload ? (
                  <Loader size={14} className="spin" />
                ) : isDownloadReady ? (
                  <Check size={14} />
                ) : (
                  <Search size={14} />
                )}
                {isCheckingDownload
                  ? '检测中...'
                  : isDownloadReady
                    ? '已通过'
                    : '检测'}
              </button>
            </div>
            {downloadCheckResult && (
              <div
                className={`download-check-status ${downloadCheckResult.status}`}
              >
                {downloadCheckResult.status === 'success' ? (
                  <Check size={14} />
                ) : (
                  <Info size={14} />
                )}
                <span>{downloadCheckResult.message}</span>
              </div>
            )}
            <button
              onClick={handleDownloadSharedFile}
              disabled={!isDownloadReady || isDownloading || isCheckingDownload}
              className="btn btn-info btn-full"
            >
              {isDownloading ? (
                <Loader size={14} className="spin" />
              ) : (
                <Download size={14} />
              )}
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
          }}
        >
          <button className="preview-close">
            <X size={20} />
          </button>
          <div onClick={e => e.stopPropagation()}>
            {previewItem.subtype === 'image' && (
              <div className="preview-media-wrapper">
                <img src={API.getFileDownloadUrl(previewItem.cid)} alt="" />
              </div>
            )}
            {previewItem.subtype === 'video' && (
              <div className="preview-media-wrapper">
                <video src={API.getFileDownloadUrl(previewItem.cid)} controls />
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
                className="btn btn-sm"
              >
                恢复
              </button>
              <button
                onClick={handleBatchDelete}
                className="btn btn-sm btn-danger"
              >
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
                    className="btn btn-sm"
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
                className="btn btn-sm btn-star"
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
                  className="btn btn-sm"
                >
                  重命名
                </button>
              )}
              <button
                onClick={() => moveModal.open()}
                className="btn btn-sm btn-move"
              >
                移动
              </button>
              <button
                onClick={handleBatchDelete}
                className="btn btn-sm btn-danger"
              >
                删除
              </button>
              {selectedIds.length === 1 && (
                <button
                  onClick={() =>
                    setShareItem(items.find(i => i.cid === selectedIds[0]))
                  }
                  className="btn btn-sm"
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
                  className="btn btn-sm"
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
                className="btn btn-icon"
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
                    <progress
                      className={`transfer-progress-meter ${t.type === 'download' ? 'download' : ''} ${t.status === 'error' ? 'error' : ''} ${t.status === 'cancelled' ? 'cancelled' : ''}`}
                      value={Math.max(0, Math.min(100, t.progress))}
                      max={100}
                      aria-label={`${t.fileName} 传输进度`}
                    />
                    <span className="transfer-progress-text">
                      {t.status === 'completed'
                        ? '完成'
                        : t.status === 'error'
                          ? '失败'
                          : t.status === 'cancelled'
                            ? '已取消'
                            : t.status === 'cancelling'
                              ? '取消中'
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
