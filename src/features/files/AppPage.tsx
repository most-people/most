import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  Upload,
  Trash2,
  ChevronRight,
  X,
  Download,
  Eye,
  FolderInput,
  ArrowUpDown,
  Star,
  Files,
  Search,
  Edit2,
  Save,
  ArrowRight,
  Loader2,
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
import { useDisclosure } from '~/hooks'
import {
  fileApi,
  getPublishFileErrorMessage,
  getPublishFileLimitViolation,
} from '~/lib/fileApi'
import { getFileSubtype } from '~/lib/filePreview'
import { useI18n } from '~/lib/i18n'
import { getLocalizedDownloadLinkValidationMessage } from '~/lib/i18n/downloadValidation'
import { saveFileToLocal } from '~/lib/saveLocalFile'
import {
  buildCidSharePath,
  createCidRoutePathFromDownloadInput,
} from '~/lib/shareLink'
import { getFolderShareState } from '~/lib/folderShare'

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
  const navigate = useNavigate()
  const addToast = useAppStore(s => s.addToast)
  const hasBackend = useAppStore(s => s.hasBackend)
  const openConnectModal = useAppStore(s => s.openConnectModal)
  const activeDownloadCount = useAppStore(s => s.downloadTasks.length)
  const userIdentity = useUserStore(s => s.identity)
  const openLoginModal = useUserStore(s => s.openLoginModal)
  const [items, setItems] = useState([])
  const [isFileListLoading, setIsFileListLoading] = useState(true)
  const [currentFolderId, setCurrentFolderId] = useState(null)
  const [currentView, setCurrentView] = useState('all')
  const [isDraggingOverUpload, setIsDraggingOverUpload] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [previewItem, setPreviewItem] = useState(null)
  const [isDownloadModalOpen, downloadModal] = useDisclosure(false)
  const [downloadLink, setDownloadLink] = useState('')
  const [downloadLinkError, setDownloadLinkError] = useState('')
  const [transfers, setTransfers] = useState([])
  const [isTransferPanelOpen, transferPanel] = useDisclosure(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isMoveModalOpen, moveModal] = useDisclosure(false)
  const [confirmModal, setConfirmModal] = useState(null)
  const [inputModal, setInputModal] = useState(null)
  const [inputLoading, setInputLoading] = useState(false)
  const previousActiveDownloadCountRef = useRef(activeDownloadCount)
  const { t } = useI18n()
  const isBackendReady = hasBackend === true

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
      const filesWithCollections = await Promise.all(
        (result || []).map(async file => {
          if (file.kind !== 'collection') return file
          try {
            const collection = await fileApi.getCollection(file.cid)
            const collectionFiles = collection.files || []
            return {
              ...file,
              fileCount: file.fileCount || collectionFiles.length,
              size: file.size ?? collection.size,
              downloadedCount: collectionFiles.filter(
                item => item.localAvailable === true
              ).length,
            }
          } catch {
            return file
          }
        })
      )
      setItems(filesWithCollections)
    } catch {
      setItems([])
    }
  }
  const handleSelect = id => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
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
      addToast(
        await getApiErrorMessage(err, t('app.toast.actionFailed')),
        'error'
      )
    }
  }

  const handleBatchDelete = async () => {
    if (!requireLogin()) return
    if (!requireBackendReady()) return
    setConfirmModal({
      title: t('app.permanentDelete'),
      message: t('app.deleteSelectedPermanent', { count: selectedIds.length }),
      confirmText: t('app.permanentDelete'),
      danger: true,
      onConfirm: async () => {
        setConfirmModal(null)
        try {
          for (const id of selectedIds) {
            if (!id.startsWith('__')) await fileApi.deletePublishedFile(id)
          }
          setSelectedIds([])
          addToast(t('app.toast.deletedPermanently'), 'success')
          refreshFiles()
        } catch (err) {
          addToast(
            await getApiErrorMessage(err, t('app.toast.deleteFailed')),
            'error'
          )
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
      addToast(
        await getApiErrorMessage(err, t('app.toast.moveFailed')),
        'error'
      )
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
          addToast(
            await getApiErrorMessage(err, t('app.toast.renameFailed')),
            'error'
          )
        } finally {
          setInputLoading(false)
        }
      },
    })
  }

  const processFiles = async (files: FileList | File[]) => {
    if (!userIdentity) {
      openLoginModal()
      addToast(t('app.toast.signInBeforePublish'), 'warning')
      return
    }
    if (!requireBackendReady()) return
    const prefix = currentPath ? currentPath + '/' : ''
    const newTransfers = []
    const publishPolicy = await fileApi.getNodePolicy().catch(() => null)

    for (const file of Array.from(files)) {
      const fileName = prefix + file.name

      const limitMessage = getPublishFileLimitViolation(file, publishPolicy, t)
      if (limitMessage) {
        addToast(limitMessage, 'error')
        continue
      }

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
          addToast(
            t('app.fileAlreadyExists', { fileName: file.name }),
            'warning'
          )
        } else {
          setTransfers(prev =>
            prev.map(t =>
              t.id === transferId
                ? { ...t, progress: 100, status: 'completed' }
                : t
            )
          )
        }
      } catch (err) {
        setTransfers(prev =>
          prev.map(t => (t.id === transferId ? { ...t, status: 'error' } : t))
        )
        const message = await getPublishFileErrorMessage(
          err,
          t('app.publishFailedWithFile', { fileName: file.name }),
          t,
          file.name
        )
        addToast(message, 'error')
      }
    }

    setTimeout(() => {
      setTransfers(prev =>
        prev.filter(t => t.status !== 'completed' && t.status !== 'error')
      )
    }, 3000)

    refreshFiles()
  }

  const handleShareFolder = async (folder: { path: string }) => {
    if (!requireLogin()) return
    if (!requireBackendReady()) return
    const shareState = getFolderShareState(items, folder.path)
    if (!shareState.canShare) {
      addToast(
        shareState.reason === 'missingLocalFiles'
          ? t('app.folderShareRequiresLocalFiles')
          : t('app.folderShareEmpty'),
        'warning'
      )
      return
    }
    try {
      const shareResult = await fileApi.shareFolder(folder.path)
      refreshFiles()
      navigate({
        href: buildCidSharePath(shareResult.cid, shareResult.fileName),
      })
    } catch (err) {
      addToast(
        await getApiErrorMessage(err, t('app.toast.actionFailed')),
        'error'
      )
    }
  }

  const handleOpenCidSharePage = file => {
    navigate({ href: buildCidSharePath(file.cid, file.fileName) })
  }

  const normalizedDownloadLink = downloadLink.trim()

  const closeDownloadModal = () => {
    downloadModal.close()
    setDownloadLink('')
    setDownloadLinkError('')
  }

  const handleDownloadLinkChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDownloadLink(e.target.value)
    setDownloadLinkError('')
  }

  const handleOpenDownloadPage = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const validationMessage = getLocalizedDownloadLinkValidationMessage(
      normalizedDownloadLink,
      t
    )
    if (validationMessage) {
      setDownloadLinkError(validationMessage)
      return
    }

    const href = createCidRoutePathFromDownloadInput(normalizedDownloadLink)
    if (!href) {
      setDownloadLinkError(t('app.download.validation.generic'))
      return
    }

    downloadModal.close()
    navigate({ href })
  }

  const handleSaveAs = async file => {
    if (!requireLogin()) return
    if (!requireBackendReady()) return
    if (file.localAvailable === false) {
      addToast(t('app.toast.fileNotLocal'), 'warning')
      return
    }
    try {
      const result = await saveFileToLocal({
        cid: file.cid,
        fileName: file.fileName,
        getFileDownloadUrl: fileApi.getFileDownloadUrl,
        getRequestHeaders: getApiRequestHeaders,
        loadFailedMessage: t('app.toast.getFileFailed'),
      })
      if (result.method === 'picker') {
        addToast(t('app.toast.fileSaved'), 'success')
      } else {
        addToast(t('app.toast.fileDownloaded'), 'success')
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        addToast(t('app.saveFailedWithError', { error: err.message }), 'error')
      }
    }
  }

  const handleCacheFile = file => {
    navigate({ href: buildCidSharePath(file.cid, file.fileName) })
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
          if (event === 'publish:success') {
            refreshFiles()
            const taskId = data.taskId || data.fileName
            setTransfers(prev =>
              prev.map(t =>
                t.id === taskId || t.fileName === data.fileName
                  ? { ...t, progress: 100, status: 'completed' }
                  : t
              )
            )
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
          if (
            event === 'download:success' ||
            event === 'user:metadata:updated'
          ) {
            refreshFiles()
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
    let cancelled = false

    if (hasBackend === true && userIdentity) {
      setIsFileListLoading(true)
      void refreshFiles().finally(() => {
        if (!cancelled) setIsFileListLoading(false)
      })
      return () => {
        cancelled = true
      }
    }

    if (hasBackend !== null) {
      setItems([])
      setIsFileListLoading(false)
    }

    return () => {
      cancelled = true
    }
  }, [hasBackend, userIdentity?.address])

  useEffect(() => {
    if (
      activeDownloadCount < previousActiveDownloadCountRef.current &&
      hasBackend === true &&
      userIdentity
    ) {
      refreshFiles()
    }
    previousActiveDownloadCountRef.current = activeDownloadCount
  }, [activeDownloadCount])

  useEffect(() => {
    if (userIdentity) return
    setSelectedIds([])
    setPreviewItem(null)
    setDownloadLink('')
    setDownloadLinkError('')
    setTransfers([])
    setSearchQuery('')
    setCurrentFolderId(null)
    setCurrentView('all')
  }, [userIdentity?.address])

  const viewTitle =
    currentView === 'all' ? t('app.nav.local') : t('app.nav.favorites')
  const displayFiles =
    currentView === 'all'
      ? filteredFiles
      : items.filter(
          i =>
            i.starred &&
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
  const selectedFile =
    selectedIds.length === 1
      ? items.find(i => i.cid === selectedIds[0]) || null
      : null
  const canPreviewSelectedFile =
    !!selectedFile && getFileSubtype(selectedFile.fileName) !== 'file'
  const shouldPullSelectedFile =
    !!selectedFile && selectedFile.localAvailable === false

  const breadcrumbParts = generateBreadcrumbs(currentPath, t('app.allContent'))

  return (
    <AppShell
      sidebar={({ closeSidebar }) => (
        <>
          <AppTop onNavigate={closeSidebar} />
          <nav className="sidebar-nav">
            {[
              {
                id: 'all',
                icon: <Files size={18} />,
                label: t('app.nav.local'),
              },
              {
                id: 'starred',
                icon: <Star size={18} />,
                label: t('app.nav.favorites'),
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
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label={t('app.search.clear')}
                title={t('app.search.clear')}
              >
                <X size={12} />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => transferPanel.open()}
            className="btn btn-icon"
            aria-label={t('app.transfers')}
            title={t('app.transfers')}
          >
            <ArrowUpDown size={16} />
          </button>
        </>
      }
    >
      {currentView === 'all' && (
        <div className="action-grid">
          <div
            className={`action-card upload ui-glass-surface ui-glass-surface-subtle ${isDraggingOverUpload ? 'drag-over' : ''}`}
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
              onChange={e => {
                const selectedFiles = Array.from(e.target.files || [])
                e.target.value = ''
                void processFiles(selectedFiles)
              }}
              className="action-card-input"
            />
            <Upload size={20} className="action-grid-icon" />
            <p>{t('app.publishFile')}</p>
          </div>
          <div
            className="action-card action-card-download ui-glass-surface ui-glass-surface-subtle"
            onClick={() => downloadModal.open()}
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
        {isFileListLoading ? (
          <div
            className="empty-state app-empty-state"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="spin" size={20} />
          </div>
        ) : displayFiles.length === 0 && displayFolders.length === 0 ? (
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
                onShare={() => void handleShareFolder(folder)}
                shareLabel={t('app.share')}
              />
            ))}
            {displayFiles.map(f => (
              <FileCard
                key={f.cid}
                file={f}
                isSelected={selectedIds.includes(f.cid)}
                onSelect={handleSelect}
                onShare={handleOpenCidSharePage}
                shareLabel={t('app.share')}
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
        )}
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

      {isDownloadModalOpen && (
        <ModalOverlay onClose={closeDownloadModal}>
          <form
            className="download-modal"
            onSubmit={handleOpenDownloadPage}
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3>{t('app.downloadFile')}</h3>
              <button
                type="button"
                onClick={closeDownloadModal}
                className="btn btn-icon"
                aria-label={t('common.close')}
                title={t('common.close')}
              >
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
                autoFocus
              />
            </div>
            {downloadLinkError && (
              <p className="download-link-error" role="alert">
                {downloadLinkError}
              </p>
            )}
            <button
              type="submit"
              disabled={!normalizedDownloadLink}
              className="btn btn-info btn-full"
            >
              <ArrowRight size={16} />
              {t('app.viewAndDownload')}
            </button>
          </form>
        </ModalOverlay>
      )}

      {previewItem && (
        <FilePreviewOverlay
          item={previewItem}
          isBackendReady={isBackendReady}
          getFileDownloadUrl={fileApi.getFileDownloadUrl}
          onSaveAs={handleSaveAs}
          onClose={() => setPreviewItem(null)}
        />
      )}

      {selectedIds.length > 0 && (
        <div className="batch-bar">
          <div className="batch-selection">
            <span className="batch-info">
              {t('app.selectedItems', { count: selectedIds.length })}
            </span>
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="batch-dismiss"
            >
              <X size={16} />
            </button>
          </div>
          <>
            <div className="batch-actions batch-actions-primary">
              {canPreviewSelectedFile && (
                <button
                  type="button"
                  onClick={() => {
                    if (selectedFile.localAvailable === false) {
                      addToast(t('app.toast.fileNotLocal'), 'warning')
                      return
                    }
                    const subtype = getFileSubtype(selectedFile.fileName)
                    setPreviewItem({ ...selectedFile, subtype })
                  }}
                  className="btn btn-sm batch-action"
                >
                  <Eye size={14} />
                  <span className="batch-action-label">{t('app.preview')}</span>
                </button>
              )}
              <button
                type="button"
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
                className="btn btn-sm batch-action"
              >
                <Star size={14} />
                <span className="batch-action-label">{t('app.favorite')}</span>
              </button>
              {selectedFile && (
                <button
                  type="button"
                  onClick={() => {
                    openRenameModal(selectedFile)
                  }}
                  className="btn btn-sm batch-action"
                >
                  <Edit2 size={14} />
                  <span className="batch-action-label">{t('app.rename')}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => moveModal.open()}
                className="btn btn-sm batch-action"
              >
                <FolderInput size={14} />
                <span className="batch-action-label">{t('app.move')}</span>
              </button>
              {shouldPullSelectedFile && (
                <button
                  type="button"
                  onClick={() => {
                    void handleCacheFile(selectedFile)
                  }}
                  className="btn btn-sm batch-action"
                >
                  <Download size={14} />
                  <span className="batch-action-label">
                    {t('app.pullToLocal')}
                  </span>
                </button>
              )}
              {selectedFile && (
                <button
                  type="button"
                  onClick={() => {
                    handleSaveAs(selectedFile)
                  }}
                  className="btn btn-sm batch-action"
                >
                  <Save size={14} />
                  <span className="batch-action-label">{t('app.saveAs')}</span>
                </button>
              )}
            </div>
            <div className="batch-actions batch-actions-danger">
              <button
                type="button"
                onClick={handleBatchDelete}
                className="btn btn-sm batch-action batch-action-danger"
              >
                <Trash2 size={14} />
                <span className="batch-action-label">{t('app.delete')}</span>
              </button>
            </div>
          </>
        </div>
      )}

      {isTransferPanelOpen && (
        <ModalOverlay onClose={() => transferPanel.close()}>
          <div className="transfer-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{t('app.transfers')}</h3>
              <button
                type="button"
                onClick={() => transferPanel.close()}
                className="btn btn-icon"
                aria-label={t('common.close')}
                title={t('common.close')}
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
                    <Upload size={14} />
                    <span className="transfer-item-name" translate="no">
                      {transfer.fileName}
                    </span>
                  </div>
                  <div className="transfer-progress-row">
                    <progress
                      className={`transfer-progress-meter ${transfer.status === 'error' ? 'error' : ''}`}
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
