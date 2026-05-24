'use client'

import React, { Suspense, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  Edit2,
  FileText,
  Folder,
  FolderPlus,
  Lock,
  NotebookPen,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import AppShell from '~/components/AppShell'
import { ConfirmModal, InputModal, ModalOverlay } from '~/components/ui'
import { useAppStore, type NoteItem } from '~/app/app/useAppStore'
import { useUserStore } from '~/app/app/userStore'
import { mostDecode } from '~/server/src/utils/mostWallet.js'
import {
  filterNotesByPath,
  getNoteFullPath,
  normalizeNotePath,
} from '~/server/src/utils/noteUtils.js'
import { NoteMoreMenu } from '~/app/note/NoteMoreMenu'
import { NoteSidebar } from '~/app/note/NoteSidebar'
import { useNoteBackupSync } from '~/app/note/useNoteBackupSync'

const MilkdownEditor = dynamic(
  () => import('~/components/MilkdownEditor').then(mod => mod.MilkdownEditor),
  {
    ssr: false,
    loading: () => <div className="note-editor-loading">加载编辑器...</div>,
  }
)

type ExplorerItem =
  | NoteItem
  | {
      name: string
      cid: string
      path: string
      type: 'directory'
      size: number
      created_at: number
      updated_at: number
    }

function formatDate(time: number) {
  if (!time) return ''
  return new Date(time).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getPathLabel(path = '') {
  const parts = normalizeNotePath(path).split('/').filter(Boolean)
  return parts.at(-1) || '全部笔记'
}

function getNotePreview(note: NoteItem) {
  if (note.isSecret || note.content.startsWith('mp://1')) {
    return '私密内容已加密'
  }

  const preview = String(note.content || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return preview || '空白笔记'
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function NotePageContent() {
  const router = useRouter()
  const params = useSearchParams()
  const backupSync = useNoteBackupSync()

  const addToast = useAppStore(s => s.addToast)
  const wallet = useUserStore(s => s.wallet)
  const openLoginModal = useUserStore(s => s.openLoginModal)
  const notes = useAppStore(s => s.notes)
  const notesPath = useAppStore(s => s.notesPath)
  const setNotesPath = useAppStore(s => s.setNotesPath)
  const saveNote = useAppStore(s => s.saveNote)
  const deleteNote = useAppStore(s => s.deleteNote)
  const renameNote = useAppStore(s => s.renameNote)
  const localDataReady = useAppStore(s => s.localDataReady)

  const cid = params.get('cid') || ''
  const selectedNote = notes.find(note => note.cid === cid)
  const showPreview = !!cid

  const [searchQuery, setSearchQuery] = useState('')
  const [inputModal, setInputModal] = useState<null | {
    title: string
    placeholder?: string
    defaultValue?: string
    confirmText: string
    onConfirm: (value: string) => Promise<void> | void
  }>(null)
  const [confirmModal, setConfirmModal] = useState<null | {
    title: string
    message: string
    confirmText: string
    onConfirm: () => void | Promise<void>
  }>(null)
  const [renameTarget, setRenameTarget] = useState<ExplorerItem | null>(null)
  const [renameName, setRenameName] = useState('')
  const [renamePath, setRenamePath] = useState('')
  const [previewContent, setPreviewContent] = useState('')
  const [previewError, setPreviewError] = useState('')

  useEffect(() => {
    if (!cid) {
      setPreviewContent('')
      setPreviewError('')
      return
    }

    if (!selectedNote) {
      setPreviewContent('')
      setPreviewError(localDataReady ? '笔记不存在' : '')
      return
    }

    if (selectedNote.content.startsWith('mp://1')) {
      if (!wallet) {
        setPreviewContent('')
        setPreviewError('请先登录 Web3 账号以解密此笔记')
        return
      }

      const decrypted = mostDecode(selectedNote.content, wallet.danger)
      if (!decrypted) {
        setPreviewContent('')
        setPreviewError('无法解密，请确认当前 Web3 账号正确')
        return
      }

      setPreviewContent(decrypted)
      setPreviewError('')
      return
    }

    setPreviewContent(selectedNote.content || '')
    setPreviewError('')
  }, [cid, localDataReady, selectedNote, wallet])

  const explorerItems = useMemo(
    () =>
      filterNotesByPath(
        notes,
        notesPath,
        searchQuery
      ) as unknown as ExplorerItem[],
    [notes, notesPath, searchQuery]
  )

  const currentPath = normalizeNotePath(notesPath)
  const currentPathLabel = getPathLabel(currentPath)
  const visibleFileCount = explorerItems.filter(item => item.type === 'file')
    .length

  const breadcrumbs = useMemo(() => {
    const parts = notesPath.split('/').filter(Boolean)
    return [
      { label: '全部笔记', path: '' },
      ...parts.map((part, index) => ({
        label: part,
        path: parts.slice(0, index + 1).join('/'),
      })),
    ]
  }, [notesPath])

  function openPreview(note: NoteItem) {
    router.push(`/note/?cid=${encodeURIComponent(note.cid)}`)
  }

  function openEditor(note: NoteItem) {
    router.push(`/note/edit?cid=${encodeURIComponent(note.cid)}`)
  }

  function requireWallet() {
    if (wallet) return true
    addToast('请先登录 Web3 账号', 'warning')
    openLoginModal()
    return false
  }

  function openCreateNoteModal() {
    setInputModal({
      title: '新建笔记',
      placeholder: '笔记名称',
      confirmText: '创建',
      onConfirm: async value => {
        if (!requireWallet()) return
        try {
          const newCid = await saveNote({
            name: value,
            path: notesPath,
            content: '',
            isSecret: false,
          })
          setInputModal(null)
          addToast('笔记已创建', 'success')
          await backupSync.uploadNow({ silent: true })
          router.push(`/note/edit?cid=${encodeURIComponent(newCid)}`)
        } catch (err: unknown) {
          addToast(getErrorMessage(err, '创建失败'), 'error')
        }
      },
    })
  }

  function openCreateFolderModal() {
    setInputModal({
      title: '新建文件夹',
      placeholder: '文件夹名称',
      confirmText: '创建',
      onConfirm: async value => {
        if (!requireWallet()) return
        try {
          await saveNote({
            name: 'index',
            path: normalizeNotePath(`${notesPath}/${value}`),
            content: '',
            isSecret: false,
          })
          setInputModal(null)
          addToast('文件夹已创建', 'success')
          await backupSync.uploadNow({ silent: true })
        } catch (err: unknown) {
          addToast(getErrorMessage(err, '创建失败'), 'error')
        }
      },
    })
  }

  function openRenameModal(item: ExplorerItem) {
    setRenameTarget(item)
    setRenameName(item.name)
    setRenamePath(item.path || '')
  }

  async function handleRename() {
    if (!renameTarget) return
    try {
      const oldFullPath =
        renameTarget.type === 'directory'
          ? normalizeNotePath(
              renameTarget.path
                ? `${renameTarget.path}/${renameTarget.name}`
                : renameTarget.name
            )
          : getNoteFullPath(renameTarget)
      renameNote(oldFullPath, renamePath, renameName)
      setRenameTarget(null)
      addToast('已重命名', 'success')
      await backupSync.uploadNow({ silent: true })
    } catch (err: unknown) {
      addToast(getErrorMessage(err, '重命名失败'), 'error')
    }
  }

  function openDeleteConfirm(item: ExplorerItem) {
    const isDirectory = item.type === 'directory'
    setConfirmModal({
      title: isDirectory ? '删除文件夹' : '删除笔记',
      message: `确定要删除「${item.name}」吗？此操作不可撤销。`,
      confirmText: '删除',
      onConfirm: async () => {
        deleteNote(isDirectory ? undefined : item.cid, item.path, item.name)
        setConfirmModal(null)
        addToast('已删除', 'success')
        await backupSync.uploadNow({ silent: true })
        if (item.type === 'file' && item.cid === cid) {
          router.push('/note/')
        }
      },
    })
  }

  const headerTitle = (
    <div className="note-header-title">
      <h2 className="header-title">笔记工作台</h2>
      <span>{notes.length} 篇笔记</span>
    </div>
  )

  const headerRight = (
    <div className="note-theme-wrap">
      <div className="note-header-actions">
        <button className="btn btn-secondary" onClick={openCreateFolderModal}>
          <FolderPlus size={16} />
          文件夹
        </button>
        <button className="btn btn-primary" onClick={openCreateNoteModal}>
          <Plus size={16} />
          新笔记
        </button>
      </div>
      <NoteMoreMenu sync={backupSync} />
    </div>
  )

  const noteExplorer = (
    <section className="note-list-panel note-sidebar-list" aria-label="笔记列表">
      <div className="note-list-header">
        <div>
          <span className="note-kicker">当前位置</span>
          <h3>{currentPathLabel}</h3>
        </div>
        <span className="note-count">{visibleFileCount} 篇</span>
      </div>

      <div className="note-search">
        <Search size={16} />
        <input
          className="input input-flex"
          value={searchQuery}
          onChange={event => setSearchQuery(event.target.value)}
          placeholder="搜索笔记"
        />
      </div>

      {!searchQuery && (
        <div className="note-breadcrumbs">
          {breadcrumbs.map((part, index) => (
            <React.Fragment key={part.path || 'root'}>
              {index > 0 && <span>/</span>}
              <button onClick={() => setNotesPath(part.path)}>
                {part.label}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}

      {explorerItems.length === 0 ? (
        <div className="note-empty-state">
          <NotebookPen size={32} />
          <p>{searchQuery ? '未找到笔记' : '还没有笔记'}</p>
          {!searchQuery && (
            <button className="btn btn-primary" onClick={openCreateNoteModal}>
              <Plus size={16} />
              新笔记
            </button>
          )}
        </div>
      ) : (
        <div className="note-list">
          {explorerItems.map(item => (
            <article
              key={`${item.cid}:${item.path}:${item.name}`}
              className={`note-list-item ${item.type === 'file' && item.cid === cid ? 'active' : ''}`}
            >
              <button
                className={`note-list-item-main ${item.type === 'directory' ? 'folder' : ''}`}
                onClick={() => {
                  if (item.type === 'directory') {
                    setNotesPath(
                      normalizeNotePath(
                        item.path ? `${item.path}/${item.name}` : item.name
                      )
                    )
                  } else {
                    openPreview(item)
                  }
                }}
              >
                <span className="note-list-icon">
                  {item.type === 'directory' ? (
                    <Folder size={18} />
                  ) : item.isSecret ? (
                    <Lock size={18} />
                  ) : (
                    <FileText size={18} />
                  )}
                </span>
                <span className="note-list-copy">
                  <span className="note-list-name">{item.name}</span>
                  {item.type === 'file' ? (
                    <span className="note-list-preview">
                      {getNotePreview(item)}
                    </span>
                  ) : (
                    <span className="note-list-preview">文件夹</span>
                  )}
                </span>
                {item.type === 'file' && (
                  <span className="note-list-date">
                    {formatDate(item.updated_at)}
                  </span>
                )}
              </button>
              <div className="note-list-actions">
                {item.type === 'file' && (
                  <button
                    className="btn btn-icon"
                    onClick={() => openEditor(item)}
                    title="编辑"
                  >
                    <Edit2 size={14} />
                  </button>
                )}
                <button
                  className="btn btn-icon"
                  onClick={() => openRenameModal(item)}
                  title="重命名"
                >
                  <Pencil size={14} />
                </button>
                <button
                  className="btn btn-icon"
                  onClick={() => openDeleteConfirm(item)}
                  title="删除"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )

  return (
    <AppShell
      sidebar={() => <NoteSidebar>{noteExplorer}</NoteSidebar>}
      headerTitle={headerTitle}
      headerRight={headerRight}
    >
      <main className={`note-page note-browser-page ${showPreview ? 'has-editor' : ''}`}>
        <section className="note-workspace">
          <section className="note-editor-panel" aria-label="笔记阅读器">
            {showPreview ? (
              <>
                <div className="note-editor-panel-header">
                  <div className="note-editor-title-area">
                    <span className="note-kicker">阅读模式</span>
                    <h3>{selectedNote?.name || '未命名笔记'}</h3>
                    {selectedNote && (
                      <div className="note-editor-info">
                        <span>{selectedNote.path || '全部笔记'}</span>
                        <span>
                          {selectedNote.isSecret ||
                          selectedNote.content.startsWith('mp://1')
                            ? '私密'
                            : '公开'}
                        </span>
                        <span>{formatDate(selectedNote.updated_at)}</span>
                      </div>
                    )}
                  </div>

                  <div className="note-editor-actions">
                    <button
                      className="btn btn-secondary"
                      onClick={() => router.push('/note/')}
                    >
                      <ArrowLeft size={16} />
                      关闭
                    </button>
                    {selectedNote && (
                      <button
                        className="btn btn-primary"
                        onClick={() => openEditor(selectedNote)}
                        disabled={!!previewError}
                      >
                        <Edit2 size={16} />
                        编辑
                      </button>
                    )}
                  </div>
                </div>

                {previewError ? (
                  <div className="note-empty-state editor-error">
                    <Lock size={36} />
                    <p>{previewError}</p>
                  </div>
                ) : selectedNote ? (
                  <div className="note-editor-frame reading">
                    <MilkdownEditor
                      content={previewContent}
                      readOnly
                      className="milkdown-editor"
                    />
                  </div>
                ) : (
                  <div className="note-empty-state editor-error">
                    <NotebookPen size={36} />
                    <p>{localDataReady ? '笔记不存在' : '加载中...'}</p>
                  </div>
                )}
              </>
            ) : (
              <div className="note-editor-empty">
                <div className="note-editor-empty-icon">
                  <NotebookPen size={32} />
                </div>
                <h3>没有打开的笔记</h3>
                <p>{notes.length > 0 ? '选择一篇笔记继续' : '创建第一篇笔记'}</p>
                <button className="btn btn-primary" onClick={openCreateNoteModal}>
                  <Plus size={16} />
                  新笔记
                </button>
              </div>
            )}
          </section>
        </section>
      </main>

      {inputModal && (
        <InputModal
          title={inputModal.title}
          placeholder={inputModal.placeholder}
          defaultValue={inputModal.defaultValue}
          confirmText={inputModal.confirmText}
          onConfirm={inputModal.onConfirm}
          onClose={() => setInputModal(null)}
        />
      )}

      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          confirmText={confirmModal.confirmText}
          danger
          onConfirm={confirmModal.onConfirm}
          onClose={() => setConfirmModal(null)}
        />
      )}

      {renameTarget && (
        <ModalOverlay onClose={() => setRenameTarget(null)}>
          <div
            className="note-rename-modal"
            onClick={event => event.stopPropagation()}
          >
            <div className="modal-header">
              <h3>重命名 / 移动</h3>
              <button
                className="btn btn-icon"
                onClick={() => setRenameTarget(null)}
              >
                <X size={18} />
              </button>
            </div>
            <input
              className="input input-compact"
              value={renamePath}
              onChange={event => setRenamePath(event.target.value)}
              placeholder="目录路径"
            />
            <input
              className="input input-compact"
              value={renameName}
              onChange={event => setRenameName(event.target.value)}
              placeholder="名称"
            />
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setRenameTarget(null)}
              >
                取消
              </button>
              <button className="btn btn-primary" onClick={handleRename}>
                确认
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </AppShell>
  )
}

export default function NotePage() {
  return (
    <Suspense fallback={<div className="note-editor-loading">加载中...</div>}>
      <NotePageContent />
    </Suspense>
  )
}
