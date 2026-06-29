import React, { useState, useEffect } from 'react'
import {
  Upload,
  Trash2,
  ChevronRight,
  FileText,
  X,
  Check,
  Copy,
  Download,
  ArrowUpDown,
  Star,
  Files,
  Search,
  Edit2,
  Loader,
  Info,
} from 'lucide-react'
import AppShell from '~/components/AppShell'
import {
  FileCard,
  FolderCard,
  parseAppFileName,
} from '~/components/AppFileCards'
import OpenSidebarButton from '~/components/OpenSidebarButton'
import { AppTop } from '~/components/AppTop'
import FilePreviewOverlay from '~/components/FilePreviewOverlay'
import { MoveModal } from '~/components/MoveModal'
import { ModalOverlay, ConfirmModal, InputModal } from '~/components/ui'
import {
  getApiErrorMessage,
  getApiRequestHeaders,
  getAuthenticatedWebSocketUrl,
} from '~server/src/utils/api'
import { useAppStore } from '~/stores/useAppStore'
import { useUserStore } from '~/stores/userStore'
import { useDisclosure, useClipboard } from '~/hooks'
import { fileApi, getDownloadCheckErrorMessage } from '~/lib/fileApi'
import { getFileSubtype } from '~/lib/filePreview'
import { formatBytes } from '~/lib/format'
import { useI18n } from '~/lib/i18n'
import { getLocalizedDownloadLinkValidationMessage } from '~/lib/i18n/downloadValidation'
import { buildCidShareLink } from '~/lib/shareLink'

type DownloadCheckResult = {
  status: 'success' | 'error'
  link: string
  message: string
}

function parseName(fullPath) {
  return parseAppFileName(fullPath)
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

function generateBreadcrumbs(currentPath, rootName) {
  if (!currentPath) return []
  return [
    { path: '', name: rootName },
    ...currentPath
      .split('/')
      .filter(Boolean)
      .map((part, i, arr) => ({
        path: arr.slice(0, i + 1).join('/'),
        name: part,
      })),
  ]
}

export default function App() {
  const addToast = useAppStore(s => s.addToast)
  const hasBackend = useAppStore(s => s.hasBackend)
  const openConnectModal = useAppStore(s => s.openConnectModal)
  const userIdentity = useUserStore(s => s.identity)
  const openLoginModal = useUserStore(s => s.openLoginModal)
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
  const [isMoveModalOpen, moveModal] = useDisclosure(false)
  const [confirmModal, setConfirmModal] = useState(null)
  const [inputModal, setInputModal] = useState(null)
  const [inputLoading, setInputLoading] = useState(false)
  const { t, formatDate } = useI18n()
  const isBackendReady = hasBackend === true
  const formatOptionalDate = (value?: string | null) =>
    value ? formatDate(value) : ''

  const currentPath = currentFolderId || ''
  const allFolders = getUniqueFolders(items)
  const { folders, files } = getItemsForPath(items, allFolders, currentPath)
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

  const filteredFiles = searchQuery
    ? items.filter(f =>
        parseName(f.fileName)
          .name.toLowerCase()
          .includes(searchQuery.toLowerCase())
      )
    : files

  const refreshFiles = async () => {
    if (!isBackendReady || !userIdentity) {
      setItems([])
      return
    }
    try {
      const result = await fileApi.listPublishedFiles()
      setItems(result || [])
    } catch {
      setItems([])
    }
  }
  const refreshTrash = async () => {
    if (!isBackendReady || !userIdentity) {
      setTrashItems([])
      return
    }
    try {
      const result = await fileApi.listTrashFiles()
      setTrashItems(result || [])
    } catch {
      setTrashItems([])
    }
  }
  const handleSelect = id => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  const handleRestore = async cid => {
    if (!requireLogin()) return
    if (!requireBackendReady()) return
    try {
      await fileApi.restoreTrashFile(cid)
      addToast(t('app.toast.restored'), 'success')
      refreshFiles()
      refreshTrash()
    } catch (err) {
      addToast(await getApiErrorMessage(err, t('app.toast.restoreFailed')), 'error')
    }
  }

  const handleEmptyTrash = async () => {
    if (!requireLogin()) return
    if (!requireBackendReady()) return
    setConfirmModal({
      title: t('app.clearTrash.title'),
      message: t('app.clearTrash.message'),
      confirmText: t('app.clear'),
      danger: true,
      onConfirm: async () => {
        setConfirmModal(null)
        try {
          await fileApi.emptyTrash()
          addToast(t('app.toast.trashEmptied'), 'success')
          refreshTrash()
        } catch (err) {
          addToast(await getApiErrorMessage(err, t('app.toast.emptyFailed')), 'error')
        }
      },
    })
  }

  const handleToggleStar = async cid => {
    if (!requireLogin()) return
    if (!requireBackendReady()) return
    try {
      const result = await fileApi.toggleStar(cid)
      setItems(prev =>
        prev.map(i => (i.cid === cid ? { ...i, starred: result.starred } : i))
      )
      addToast(
        result.starred ? t('app.toast.favorited') : t('app.toast.unfavorited'),
        'success'
      )
    } catch (err) {
      addToast(await getApiErrorMessage(err, t('app.toast.actionFailed')), 'error')
    }
  }

  const handleBatchDelete = async () => {
    if (!requireLogin()) return
    if (!requireBackendReady()) return
    const isTrash = currentView === 'trash'
    setConfirmModal({
      title: isTrash ? t('app.permanentDelete') : t('app.batchDelete'),
      message: isTrash
        ? t('app.deleteSelectedPermanent', { count: selectedIds.length })
        : t('app.deleteSelected', { count: selectedIds.length }),
      confirmText: isTrash ? t('app.permanentDelete') : t('app.delete'),
      danger: true,
      onConfirm: async () => {
        setConfirmModal(null)
        try {
          for (const id of selectedIds) {
            if (isTrash) {
              await fileApi.permanentDeleteTrashFile(id)
            } else {
              if (!id.startsWith('__')) await fileApi.deletePublishedFile(id)
            }
          }
          setSelectedIds([])
          addToast(
            isTrash ? t('app.toast.deletedPermanently') : t('app.toast.deleted'),
            'success'
          )
          refreshFiles()
          refreshTrash()
        } catch (err) {
          addToast(await getApiErrorMessage(err, t('app.toast.deleteFailed')), 'error')
        }
      },
    })
  }

  const handleMove = async targetPath => {
    if (!requireLogin()) return
    if (!requireBackendReady()) return
    try {
      for (const id of selectedIds) {
        const file = items.find(i => i.cid === id)
        if (!file) continue
        const { name } = parseName(file.fileName)
        const newFileName = targetPath ? `${targetPath}/${name}` : name
        if (file.fileName !== newFileName) {
          await fileApi.moveFile(id, newFileName)
        }
      }
      setSelectedIds([])
      moveModal.close()
      addToast(t('app.toast.moved'), 'success')
      refreshFiles()
    } catch (err) {
      addToast(await getApiErrorMessage(err, t('app.toast.moveFailed')), 'error')
    }
  }

  const openRenameModal = target => {
    const isFolder = !!target.path
    const currentName = isFolder ? target.name : parseName(target.fileName).name
    setInputModal({
      title: isFolder ? t('app.renameFolder') : t('app.renameFile'),
      placeholder: t('app.enterNewName'),
      defaultValue: currentName,
      confirmText: t('app.rename'),
      onConfirm: async newName => {
        if (newName === currentName) return
        if (!requireLogin()) return
        if (!requireBackendReady()) return
        setInputLoading(true)
        try {
          if (isFolder) {
            const lastSlash = target.path.lastIndexOf('/')
            const parentPath =
              lastSlash !== -1 ? target.path.substring(0, lastSlash) : ''
            const newPath = parentPath ? `${parentPath}/${newName}` : newName
            await fileApi.renameFolder(target.path, newPath)
            addToast(t('app.toast.renamed'), 'success')
            refreshFiles()
            handleNavigate(newPath)
          } else {
            const { folder } = parseName(target.fileName)
            const newFileName = folder ? `${folder}/${newName}` : newName
            await fileApi.moveFile(target.cid, newFileName)
            addToast(t('app.toast.renamed'), 'success')
            refreshFiles()
          }
          setInputModal(null)
        } catch (err) {
          addToast(await getApiErrorMessage(err, t('app.toast.renameFailed')), 'error')
        } finally {
          setInputLoading(false)
        }
      },
    })
  }

  const processFiles = async (files: FileList) => {
    if (!userIdentity) {
      openLoginModal()
      addToast(t('app.toast.signInBeforePublish'), 'warning')
      return
    }
    if (!requireBackendReady()) return
    const prefix = currentPath ? currentPath + '/' : ''
    const newTransfers = []

    for (const file of Array.from(files)) {
      const fileName = prefix + file.name

      const nameExists = items.some(item => item.fileName === fileName)
      if (nameExists) {
        addToast(t('app.fileAlreadyExists', { fileName: file.name }), 'warning')
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
        const result = await fileApi.publishFile(file, fileName)
        if (result.alreadyExists) {
          setTransfers(prev =>
            prev.map(t =>
              t.id === transferId ? { ...t, status: 'completed' } : t
            )
          )
          addToast(t('app.fileAlreadyExists', { fileName: file.name }), 'warning')
        } else {
          setTransfers(prev =>
            prev.map(t =>
              t.id === transferId
                ? { ...t, progress: 100, status: 'completed' }
                : t
            )
          )
          addToast(t('app.fileAddedLocal', { fileName: file.name }), 'success')
        }
      } catch (err) {
        setTransfers(prev =>
          prev.map(t => (t.id === transferId ? { ...t, status: 'error' } : t))
        )
        const message = await getApiErrorMessage(
          err,
          t('app.publishFailedWithFile', { fileName: file.name })
        )
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
  }

  const shareLink = shareItem
    ? buildCidShareLink(shareItem.cid, shareItem.fileName)
    : ''

  const handleCopyLink = () => {
    if (!shareLink) return
    copyLink(shareLink)
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
    const validationMessage = getLocalizedDownloadLinkValidationMessage(
      normalizedDownloadLink,
      t
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
    if (!requireLogin()) return
    if (!requireBackendReady()) return

    setIsCheckingDownload(true)
    setDownloadCheckResult(null)
    try {
      const result = await fileApi.checkDownload(normalizedDownloadLink)
      const message = result.alreadyExists
        ? t('app.fileAlreadyLocal', { fileName: result.fileName })
        : t('app.fileAvailable', { fileName: result.fileName })
      setDownloadCheckResult({
        status: 'success',
        link: normalizedDownloadLink,
        message,
      })
      addToast(
        result.alreadyExists
          ? t('app.fileAlreadyExists', { fileName: result.fileName })
          : t('app.toast.checkPassed'),
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
    if (!userIdentity) {
      openLoginModal()
      addToast(t('app.toast.signInBeforeDownload'), 'warning')
      return
    }
    if (!requireBackendReady()) return
    const validationMessage = getLocalizedDownloadLinkValidationMessage(
      normalizedDownloadLink,
      t
    )
    if (validationMessage) {
      addToast(validationMessage, 'warning')
      return
    }
    if (!isDownloadReady) {
      addToast(t('app.toast.checkLinkFirst'), 'warning')
      return
    }
    if (isDownloading) return
    setIsDownloading(true)
    try {
      const result = await fileApi.downloadFile(normalizedDownloadLink)
      setDownloadLink('')
      setDownloadCheckResult(null)
      closeDownloadModal()

      if (result.alreadyExists) {
        addToast(t('app.fileAlreadyExists', { fileName: result.fileName }), 'warning')
      } else {
        const transfer = {
          id: result.taskId,
          fileName: t('app.downloadFallbackName'),
          progress: 0,
          type: 'download',
          status: 'downloading',
        }
        setTransfers(prev => [...prev, transfer])
        transferPanel.open()
        addToast(t('app.toast.downloadStarted'), 'info')
      }
    } catch (err) {
      const message = await getApiErrorMessage(err, t('app.toast.downloadFailed'))
      addToast(message, 'error')
    } finally {
      setIsDownloading(false)
    }
  }

  const handleCancelTransfer = async transfer => {
    if (!requireLogin()) return
    if (!requireBackendReady()) return
    if (transfer.type === 'download' && transfer.status === 'downloading') {
      setTransfers(prev =>
        prev.map(t =>
          t.id === transfer.id ? { ...t, status: 'cancelling' } : t
        )
      )
      try {
        await fileApi.cancelDownload(transfer.id)
      } catch (err) {
        setTransfers(prev =>
          prev.map(t =>
            t.id === transfer.id ? { ...t, status: 'downloading' } : t
          )
        )
        addToast(await getApiErrorMessage(err, t('app.toast.cancelFailed')), 'error')
      }
    }
  }

  const handleSaveAs = async file => {
    if (!requireLogin()) return
    if (!requireBackendReady()) return
    if (file.localAvailable === false) {
      addToast(t('app.toast.fileNotLocal'), 'warning')
      return
    }
    try {
      const res = await fetch(fileApi.getFileDownloadUrl(file.cid), {
        headers: await getApiRequestHeaders(
          'GET',
          `/api/files/${file.cid}/download`
        ),
      })
      if (!res.ok) throw new Error(t('app.toast.getFileFailed'))
      const blob = await res.blob()
      const showSaveFilePicker = (window as any).showSaveFilePicker
      if (showSaveFilePicker) {
        const handle = await showSaveFilePicker({
          suggestedName: file.fileName,
        })
        const writable = await handle.createWritable()
        await writable.write(blob)
        await writable.close()
        addToast(t('app.toast.fileSaved'), 'success')
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = file.fileName
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        addToast(t('app.toast.fileDownloaded'), 'success')
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        addToast(t('app.saveFailedWithError', { error: err.message }), 'error')
      }
    }
  }

  const handleCacheFile = async file => {
    if (!requireLogin()) return
    if (!requireBackendReady()) return
    try {
      addToast(t('app.toast.startPullLocal'), 'info')
      await fileApi.cacheFile(file.cid)
      addToast(t('app.toast.pulledAndSeeding'), 'success')
      refreshFiles()
    } catch (err) {
      addToast(await getApiErrorMessage(err, t('app.toast.pullFailed')), 'error')
    }
  }

  const handleNavigate = path => {
    setCurrentFolderId(path || null)
    setSelectedIds([])
  }

  useEffect(() => {
    if (hasBackend !== true) return

    let ws: WebSocket | null = null
    let cancelled = false
    ;(async () => {
      ws = new WebSocket(await getAuthenticatedWebSocketUrl('/ws'))
      if (cancelled) {
        ws.close()
        return
      }
      ws.onmessage = e => {
        try {
          const { event, data } = JSON.parse(e.data)
          if (event === 'publish:success' || event === 'download:success') {
            refreshFiles()
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
                addToast(
                  t('app.fileAlreadyExists', { fileName: data.fileName }),
                  'warning'
                )
              } else {
                addToast(
                  t('app.fileDownloadCompleted', { fileName: data.fileName }),
                  'success'
                )
              }
              setTimeout(() => {
                setTransfers(prev =>
                  prev.filter(
                    t => !(t.id === taskId && t.status === 'completed')
                  )
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
            addToast(
              t('app.downloadFailedWithError', { error: data.error }),
              'error'
            )
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
            addToast(t('app.toast.downloadCancelled'), 'warning')
          }
          if (event === 'user:metadata:updated') {
            refreshFiles()
            refreshTrash()
          }
        } catch (err) {
          console.warn('[App WS] Failed to parse message:', err.message)
        }
      }
    })()
    return () => {
      cancelled = true
      ws?.close()
    }
  }, [hasBackend, userIdentity?.address])

  useEffect(() => {
    if (hasBackend === true && userIdentity) {
      refreshFiles()
      refreshTrash()
      return
    }

    if (hasBackend === false) {
      setItems([])
      setTrashItems([])
    }
  }, [hasBackend, userIdentity?.address])

  useEffect(() => {
    if (userIdentity) return
    setSelectedIds([])
    setPreviewItem(null)
    setShareItem(null)
    setDownloadLink('')
    setDownloadCheckResult(null)
    setTransfers([])
    setSearchQuery('')
    setCurrentFolderId(null)
    setCurrentView('all')
  }, [userIdentity?.address])

  const viewTitle =
    currentView === 'all'
      ? t('app.nav.local')
      : currentView === 'starred'
        ? t('app.nav.favorites')
        : t('app.nav.trash')
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

  const breadcrumbParts = generateBreadcrumbs(currentPath, t('app.allContent'))

  return (
    <AppShell
      sidebar={({ closeSidebar }) => (
        <>
          <AppTop onNavigate={closeSidebar} />
          <nav className="sidebar-nav">
            {[
              { id: 'all', icon: <Files size={18} />, label: t('app.nav.local') },
              {
                id: 'starred',
                icon: <Star size={18} />,
                label: t('app.nav.favorites'),
              },
              {
                id: 'trash',
                icon: <Trash2 size={18} />,
                label: t('app.nav.trash'),
              },
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
              placeholder={t('app.search.placeholder')}
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
              {t('app.emptyTrash')}
            </button>
          )}
          <button onClick={() => transferPanel.open()} className="btn btn-icon">
            <ArrowUpDown size={16} />
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
              if (!requireLogin() || !requireBackendReady()) return
              processFiles(e.dataTransfer.files)
            }}
          >
            <input
              type="file"
              multiple
              onClick={e => {
                if (!requireLogin() || !requireBackendReady()) {
                  e.preventDefault()
                }
              }}
              onChange={e => processFiles(e.target.files)}
              className="action-card-input"
            />
            <Upload size={20} className="action-grid-icon" />
            <p>{t('app.publishFile')}</p>
          </div>
          <div
            className="action-card action-card-download"
            onClick={() => {
              if (!requireLogin() || !requireBackendReady()) return
              downloadModal.open()
            }}
          >
            <Download size={20} className="action-grid-icon" />
            <p>{t('app.downloadFile')}</p>
          </div>
        </div>
      )}

      {currentView === 'all' && (
        <div className="breadcrumb">
          {currentPath ? (
            <>
              <button onClick={() => handleNavigate('')}>
                {t('app.allContent')}
              </button>
              {breadcrumbParts.slice(1).map((part, i) => (
                <React.Fragment key={part.path}>
                  <ChevronRight size={12} />
                  <button
                    onClick={() => handleNavigate(part.path)}
                    className={
                      i === breadcrumbParts.length - 2 ? 'current' : ''
                    }
                  >
                    <span translate="no">{part.name}</span>
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
            <div className="empty-state app-empty-state">
              <p>{searchQuery ? t('app.noMatches') : t('app.trashEmpty')}</p>
              <OpenSidebarButton label={t('app.openFileNavigation')} />
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
                  <p className="card-name" translate="no">
                    {parseName(f.fileName).name}
                  </p>
                  <p className="card-date">
                    {t('app.deletedOn', {
                      date: formatOptionalDate(f.deletedAt),
                    })}
                  </p>
                </div>
              ))}
            </div>
          ))}

        {currentView !== 'trash' &&
          (displayFiles.length === 0 && displayFolders.length === 0 ? (
            <div className="empty-state app-empty-state">
              <p>
                {searchQuery
                  ? t('app.noMatches')
                  : currentView === 'starred'
                    ? t('app.noFavorites')
                    : t('app.noLocalFiles')}
              </p>
              <OpenSidebarButton label={t('app.openFileNavigation')} />
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
                  onPreview={file => {
                    if (file.localAvailable === false) {
                      addToast(t('app.toast.fileNotLocal'), 'warning')
                      return
                    }
                    setPreviewItem({
                      ...file,
                      subtype: getFileSubtype(file.fileName),
                    })
                  }}
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
              <h3>{t('app.shareLink')}</h3>
              <button
                onClick={() => setShareItem(null)}
                className="btn btn-icon"
              >
                <X size={18} />
              </button>
            </div>
            <div className="share-link-box">
              <div className="share-link-text" translate="no">
                {shareLink}
              </div>
              <button
                onClick={handleCopyLink}
                className={`btn btn-circle btn-primary ${linkCopied ? 'copied' : ''}`}
              >
                {linkCopied ? <Check size={18} /> : <Copy size={18} />}
              </button>
            </div>
            <div className="share-storage-note">
              <span>{t('app.shareSeedNote')}</span>
            </div>
          </div>
        </ModalOverlay>
      )}

      {isDownloadModalOpen && (
        <ModalOverlay onClose={closeDownloadModal}>
          <div className="download-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{t('app.downloadFile')}</h3>
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
                placeholder={t('app.downloadLink.placeholder')}
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
                  ? t('app.checking')
                  : isDownloadReady
                    ? t('app.passed')
                    : t('app.check')}
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
              {isDownloading ? t('app.downloading') : t('app.startDownload')}
            </button>
          </div>
        </ModalOverlay>
      )}

      {previewItem && (
        <FilePreviewOverlay
          item={previewItem}
          isBackendReady={isBackendReady}
          getFileDownloadUrl={fileApi.getFileDownloadUrl}
          onClose={() => setPreviewItem(null)}
        />
      )}

      {selectedIds.length > 0 && (
        <div className="batch-bar">
          <span className="batch-info">
            {t('app.selectedItems', { count: selectedIds.length })}
          </span>
          <button onClick={() => setSelectedIds([])} className="batch-dismiss">
            <X size={16} />
          </button>
          <div className="batch-divider" />
          {currentView === 'trash' ? (
            <>
              <button
                onClick={async () => {
                  if (!requireLogin()) return
                  if (!requireBackendReady()) return
                  await Promise.all(
                    selectedIds.map(cid => fileApi.restoreTrashFile(cid))
                  )
                  setSelectedIds([])
                  addToast(t('app.toast.restored'), 'success')
                  refreshFiles()
                  refreshTrash()
                }}
                className="btn btn-sm"
              >
                {t('app.restore')}
              </button>
              <button
                onClick={handleBatchDelete}
                className="btn btn-sm btn-danger"
              >
                {t('app.permanentDelete')}
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
                        if (file.localAvailable === false) {
                          addToast(t('app.toast.fileNotLocal'), 'warning')
                          return
                        }
                        const subtype = getFileSubtype(file.fileName)
                        setPreviewItem({ ...file, subtype })
                      }
                    }}
                    className="btn btn-sm"
                  >
                    {t('app.preview')}
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
                {t('app.favorite')}
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
                  {t('app.rename')}
                </button>
              )}
              <button
                onClick={() => moveModal.open()}
                className="btn btn-sm btn-move"
              >
                {t('app.move')}
              </button>
              <button
                onClick={handleBatchDelete}
                className="btn btn-sm btn-danger"
              >
                {t('app.delete')}
              </button>
              {selectedIds.length === 1 &&
                (() => {
                  const file = items.find(i => i.cid === selectedIds[0])
                  return file && file.localAvailable === false
                })() && (
                  <button
                    onClick={() => {
                      const file = items.find(i => i.cid === selectedIds[0])
                      if (file) void handleCacheFile(file)
                    }}
                    className="btn btn-sm"
                  >
                    {t('app.pullToLocal')}
                  </button>
                )}
              {selectedIds.length === 1 && (
                <button
                  onClick={() =>
                    setShareItem(items.find(i => i.cid === selectedIds[0]))
                  }
                  className="btn btn-sm"
                >
                  {t('app.share')}
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
                  {t('app.saveAs')}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {isTransferPanelOpen && (
        <ModalOverlay
          onClose={() => transferPanel.close()}
        >
          <div className="transfer-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{t('app.transfers')}</h3>
              <button
                onClick={() => transferPanel.close()}
                className="btn btn-icon"
              >
                <X size={18} />
              </button>
            </div>
            {transfers.length === 0 ? (
              <div className="empty-transfer">{t('app.noTransfers')}</div>
            ) : (
              transfers.map(transfer => (
                <div key={transfer.id} className="transfer-item">
                  <div className="transfer-item-header">
                    {transfer.type === 'upload' ? (
                      <Upload size={14} />
                    ) : (
                      <Download size={14} />
                    )}
                    <span className="transfer-item-name" translate="no">
                      {transfer.fileName}
                    </span>
                    {transfer.status === 'downloading' &&
                      transfer.type === 'download' && (
                      <button
                        onClick={() => handleCancelTransfer(transfer)}
                        className="transfer-item-cancel"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  <div className="transfer-progress-row">
                    <progress
                      className={`transfer-progress-meter ${transfer.type === 'download' ? 'download' : ''} ${transfer.status === 'error' ? 'error' : ''} ${transfer.status === 'cancelled' ? 'cancelled' : ''}`}
                      value={Math.max(0, Math.min(100, transfer.progress))}
                      max={100}
                      aria-label={t('app.transferProgress', {
                        fileName: transfer.fileName,
                      })}
                    />
                    <span className="transfer-progress-text">
                      {transfer.status === 'completed'
                        ? t('app.completed')
                        : transfer.status === 'error'
                          ? t('app.failed')
                          : transfer.status === 'cancelled'
                            ? t('app.cancelled')
                            : transfer.status === 'cancelling'
                              ? t('app.cancelling')
                              : transfer.loaded && transfer.total
                                ? `${formatBytes(transfer.loaded)}/${formatBytes(transfer.total)}`
                                : `${transfer.progress}%`}
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
