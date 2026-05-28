'use client'

import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ChevronDown,
  ChevronRight,
  PencilRuler,
  Eye,
  FileText,
  Folder,
  Move,
  Lock,
  Moon,
  NotebookPen,
  Plus,
  Save,
  Search,
  Sun,
  Trash2,
  X,
} from 'lucide-react'
import AppShell from '~/components/AppShell'
import { ConfirmModal, InputModal, ModalOverlay } from '~/components/ui'
import { useAppStore, type NoteItem } from '~/app/app/useAppStore'
import { useUserStore } from '~/app/app/userStore'
import type { MilkdownEditorRef } from '~/components/MilkdownEditor'
import { mostDecode, mostEncode } from '~/server/src/utils/mostWallet.js'
import { formatDate } from '~/server/src/utils/dateTime.js'
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

type NoteDirectoryOption = {
  path: string
  name: string
  parentPath: string
  depth: number
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

function getExplorerItemFullPath(item: ExplorerItem) {
  if (item.type === 'directory') {
    return normalizeNotePath(
      item.path ? `${item.path}/${item.name}` : item.name
    )
  }
  return getNoteFullPath(item)
}

function getDirectoryOptions(notes: NoteItem[]) {
  const directories = new Set<string>()

  for (const note of notes) {
    const parts = normalizeNotePath(note.path).split('/').filter(Boolean)
    for (let index = 0; index < parts.length; index += 1) {
      directories.add(parts.slice(0, index + 1).join('/'))
    }
  }

  return Array.from(directories)
    .sort((left, right) => left.localeCompare(right, 'zh-CN'))
    .map(path => {
      const parts = path.split('/')
      return {
        path,
        name: parts[parts.length - 1] || path,
        parentPath: parts.slice(0, -1).join('/'),
        depth: Math.max(parts.length - 1, 0),
      }
    })
}

function NotePageContent() {
  const router = useRouter()
  const params = useSearchParams()
  const editorRef = useRef<MilkdownEditorRef>(null)
  const backupSync = useNoteBackupSync()

  const addToast = useAppStore(s => s.addToast)
  const isDarkMode = useAppStore(s => s.isDarkMode)
  const setIsDarkMode = useAppStore(s => s.setIsDarkMode)
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
  const isEditing = showPreview && params.get('mode') === 'edit'

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
  const [moveTarget, setMoveTarget] = useState<ExplorerItem | null>(null)
  const [previewContent, setPreviewContent] = useState('')
  const [previewError, setPreviewError] = useState('')
  const [previewName, setPreviewName] = useState('')
  const [noteName, setNoteName] = useState('')
  const [notePath, setNotePath] = useState('')
  const [plainContent, setPlainContent] = useState('')
  const [editIsSecret, setEditIsSecret] = useState(false)
  const [editError, setEditError] = useState('')
  const [saving, setSaving] = useState(false)

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

  useEffect(() => {
    if (!isEditing) {
      setSaving(false)
      return
    }

    if (!cid || !selectedNote) {
      setNoteName('')
      setNotePath('')
      setPlainContent('')
      setEditIsSecret(false)
      setEditError(localDataReady ? '笔记不存在' : '')
      return
    }

    setNoteName(selectedNote.name)
    setNotePath(selectedNote.path || '')
    setEditIsSecret(
      selectedNote.isSecret === true ||
        selectedNote.content.startsWith('mp://1')
    )

    if (selectedNote.content.startsWith('mp://1')) {
      if (!wallet) {
        setPlainContent('')
        setEditError('请先登录 Web3 账号以解密此笔记')
        return
      }

      const decrypted = mostDecode(selectedNote.content, wallet.danger)
      if (!decrypted) {
        setPlainContent('')
        setEditError('无法解密，请确认当前 Web3 账号正确')
        return
      }

      setPlainContent(decrypted)
      setEditError('')
      return
    }

    setPlainContent(selectedNote.content || '')
    setEditError('')
  }, [cid, isEditing, localDataReady, selectedNote, wallet])

  useEffect(() => {
    setPreviewName(selectedNote?.name || '')
  }, [selectedNote?.cid, selectedNote?.name])

  const explorerItems = useMemo(
    () =>
      filterNotesByPath(
        notes,
        notesPath,
        searchQuery
      ) as unknown as ExplorerItem[],
    [notes, notesPath, searchQuery]
  )

  const visibleFileCount = explorerItems.filter(
    item => item.type === 'file'
  ).length
  const selectedNoteIsSecret =
    selectedNote?.isSecret === true ||
    selectedNote?.content.startsWith('mp://1') === true
  const selectedNotePrivacyLabel = isEditing
    ? editIsSecret
      ? '私密'
      : '公开'
    : selectedNoteIsSecret
      ? '私密'
      : '公开'

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
  const directoryOptions = useMemo(() => getDirectoryOptions(notes), [notes])

  function openPreview(note: NoteItem) {
    router.push(`/note/?cid=${encodeURIComponent(note.cid)}`)
  }

  function openEditor(note: NoteItem) {
    router.push(`/note/?cid=${encodeURIComponent(note.cid)}&mode=edit`)
  }

  function requireWallet() {
    if (wallet) return true
    openLoginModal()
    return false
  }

  function closeEditor() {
    router.push(
      selectedNote
        ? `/note/?cid=${encodeURIComponent(selectedNote.cid)}`
        : '/note/'
    )
  }

  async function handleSaveEditor() {
    if (!requireWallet()) return
    if (!selectedNote) {
      addToast('笔记不存在', 'error')
      return
    }
    if (!noteName.trim()) {
      addToast('请输入笔记名称', 'warning')
      return
    }

    setSaving(true)
    try {
      const markdown = editorRef.current?.getMarkdown() ?? plainContent
      const storedContent = editIsSecret
        ? mostEncode(markdown, wallet.danger)
        : markdown
      const nextCid = await saveNote({
        cid: selectedNote.cid,
        name: noteName,
        path: notePath,
        content: storedContent,
        isSecret: editIsSecret,
      })
      setPlainContent(markdown)
      addToast('笔记已保存', 'success')
      await backupSync.uploadNow({ silent: true })
      router.replace(`/note/?cid=${encodeURIComponent(nextCid)}`)
    } catch (err: unknown) {
      addToast(getErrorMessage(err, '保存失败'), 'error')
    } finally {
      setSaving(false)
    }
  }

  function openCreateNoteModal() {
    if (!requireWallet()) return
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
          router.push(`/note/?cid=${encodeURIComponent(newCid)}&mode=edit`)
        } catch (err: unknown) {
          addToast(getErrorMessage(err, '创建失败'), 'error')
        }
      },
    })
  }

  async function handlePreviewRename() {
    if (!requireWallet()) return
    if (!selectedNote) return
    const nextName = previewName.trim()
    if (!nextName) {
      setPreviewName(selectedNote.name)
      addToast('请输入笔记名称', 'warning')
      return
    }
    if (nextName === selectedNote.name) return

    try {
      renameNote(getNoteFullPath(selectedNote), selectedNote.path, nextName)
      addToast('已重命名', 'success')
      await backupSync.uploadNow({ silent: true })
    } catch (err: unknown) {
      setPreviewName(selectedNote.name)
      addToast(getErrorMessage(err, '重命名失败'), 'error')
    }
  }

  function openMoveModal(item: ExplorerItem) {
    if (!requireWallet()) return
    setMoveTarget(item)
  }

  async function handleMove(targetPath: string) {
    if (!moveTarget) return
    try {
      renameNote(
        getExplorerItemFullPath(moveTarget),
        targetPath,
        moveTarget.name
      )
      setMoveTarget(null)
      addToast('已移动', 'success')
      await backupSync.uploadNow({ silent: true })
    } catch (err: unknown) {
      addToast(getErrorMessage(err, '移动失败'), 'error')
    }
  }

  function openDeleteConfirm(item: ExplorerItem) {
    if (!requireWallet()) return
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
      <h2 className="header-title">笔记</h2>
      <span>{notes.length} 篇</span>
    </div>
  )

  const headerRight = (
    <div className="note-theme-wrap">
      <button
        className="btn btn-icon"
        onClick={() => setIsDarkMode(!isDarkMode)}
        title="切换主题"
        aria-label="切换主题"
      >
        {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
      </button>
      <NoteMoreMenu sync={backupSync} />
    </div>
  )

  const noteExplorer = (
    <section
      className="note-list-panel note-sidebar-list"
      aria-label="笔记列表"
    >
      <div className="note-list-header">
        <div className="note-current-location">
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
      <main
        className={`note-page note-browser-page ${showPreview ? 'has-editor' : ''}`}
      >
        <section className="note-workspace">
          <section
            className="note-editor-panel"
            aria-label={isEditing ? '笔记编辑器' : '笔记阅读器'}
          >
            {showPreview ? (
              <>
                <div className="note-editor-panel-header">
                  <div className="note-editor-title-area">
                    {isEditing ? (
                      <input
                        className="note-title-input"
                        value={noteName}
                        onChange={event => setNoteName(event.target.value)}
                        placeholder="笔记名称"
                        disabled={!selectedNote}
                      />
                    ) : selectedNote ? (
                      <input
                        className="note-title-input"
                        value={previewName}
                        onBlur={handlePreviewRename}
                        onChange={event => setPreviewName(event.target.value)}
                        onKeyDown={event => {
                          if (event.key === 'Enter') {
                            event.currentTarget.blur()
                          }
                          if (event.key === 'Escape') {
                            setPreviewName(selectedNote.name)
                            event.currentTarget.blur()
                          }
                        }}
                        placeholder="笔记名称"
                        title="重命名"
                      />
                    ) : (
                      <h3>未命名笔记</h3>
                    )}
                    {selectedNote && (
                      <div className="note-editor-info">
                        <span>{isEditing ? '编辑模式' : '阅读模式'}</span>
                        <span>{selectedNotePrivacyLabel}</span>
                        <span>{formatDate(selectedNote.updated_at)}</span>
                      </div>
                    )}
                  </div>

                  <div className="note-editor-actions">
                    <button
                      type="button"
                      className="btn btn-icon"
                      onClick={
                        isEditing ? closeEditor : () => router.push('/note/')
                      }
                      title={isEditing ? '取消' : '关闭'}
                      aria-label={isEditing ? '取消' : '关闭'}
                    >
                      <X size={16} />
                    </button>
                    {isEditing ? (
                      <>
                        <button
                          className={`btn btn-sm ${
                            editIsSecret ? 'btn-warning' : 'btn-secondary'
                          }`}
                          onClick={() => setEditIsSecret(!editIsSecret)}
                          disabled={!selectedNote}
                        >
                          {editIsSecret ? (
                            <Lock size={16} />
                          ) : (
                            <Eye size={16} />
                          )}
                          {editIsSecret ? '私密' : '公开'}
                        </button>
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={handleSaveEditor}
                          disabled={saving || !!editError || !selectedNote}
                        >
                          <Save size={16} />
                          {saving ? '保存中' : '保存'}
                        </button>
                      </>
                    ) : (
                      selectedNote && (
                        <>
                          <button
                            type="button"
                            className="btn btn-icon"
                            onClick={() => openMoveModal(selectedNote)}
                            title="移动"
                            aria-label="移动"
                          >
                            <Move size={16} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-icon note-editor-action-danger"
                            onClick={() => openDeleteConfirm(selectedNote)}
                            title="删除"
                            aria-label="删除"
                          >
                            <Trash2 size={16} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            onClick={() => openEditor(selectedNote)}
                            disabled={!!previewError}
                            title="编辑"
                            aria-label="编辑"
                          >
                            <PencilRuler size={16} />
                            编辑
                          </button>
                        </>
                      )
                    )}
                  </div>
                </div>

                {isEditing ? (
                  editError ? (
                    <div className="note-empty-state editor-error">
                      <Lock size={36} />
                      <p>{editError}</p>
                    </div>
                  ) : selectedNote ? (
                    <div className="note-editor-frame editing">
                      <MilkdownEditor
                        ref={editorRef}
                        content={plainContent}
                        onChange={setPlainContent}
                        className="milkdown-editor"
                      />
                    </div>
                  ) : (
                    <div className="note-empty-state editor-error">
                      <NotebookPen size={36} />
                      <p>{localDataReady ? '笔记不存在' : '加载中...'}</p>
                    </div>
                  )
                ) : previewError ? (
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
                <p>
                  {notes.length > 0 ? '选择一篇笔记继续' : '创建第一篇笔记'}
                </p>
                <button
                  className="btn btn-primary"
                  onClick={openCreateNoteModal}
                >
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

      {moveTarget && (
        <NoteMoveModal
          target={moveTarget}
          directories={directoryOptions}
          onMove={handleMove}
          onClose={() => setMoveTarget(null)}
        />
      )}
    </AppShell>
  )
}

function NoteMoveModal({
  target,
  directories,
  onMove,
  onClose,
}: {
  target: ExplorerItem
  directories: NoteDirectoryOption[]
  onMove: (targetPath: string) => void | Promise<void>
  onClose: () => void
}) {
  const currentPath = normalizeNotePath(target.path || '')
  const targetFullPath = getExplorerItemFullPath(target)
  const usableDirectories = directories.filter(directory => {
    if (target.type !== 'directory') return true
    return (
      directory.path !== targetFullPath &&
      !directory.path.startsWith(`${targetFullPath}/`)
    )
  })
  const [selectedPath, setSelectedPath] = useState(currentPath)
  const [customPath, setCustomPath] = useState('')
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const normalizedCustomPath = normalizeNotePath(customPath)
  const finalPath = customPath.trim() ? normalizedCustomPath : selectedPath
  const isSamePath = normalizeNotePath(finalPath) === currentPath
  const childPathsByParent = new Map<string, NoteDirectoryOption[]>()

  for (const directory of usableDirectories) {
    const siblings = childPathsByParent.get(directory.parentPath) || []
    siblings.push(directory)
    childPathsByParent.set(directory.parentPath, siblings)
  }

  const visibleDirectories = usableDirectories.filter(directory => {
    if (!directory.parentPath) return true
    const ancestors = directory.parentPath.split('/').filter(Boolean)
    return ancestors.every((_, index) =>
      expandedPaths.has(ancestors.slice(0, index + 1).join('/'))
    )
  })

  const selectedBreadcrumbs = [
    { label: '全部笔记', path: '' },
    ...selectedPath
      .split('/')
      .filter(Boolean)
      .map((part, index, parts) => ({
        label: part,
        path: parts.slice(0, index + 1).join('/'),
      })),
  ]

  function selectPath(path: string) {
    setSelectedPath(normalizeNotePath(path))
    setCustomPath('')
  }

  function selectDirectory(path: string) {
    selectPath(path)
    if (!childPathsByParent.has(path)) return

    setExpandedPaths(previous => {
      const next = new Set(previous)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  function handleConfirm() {
    if (!isSamePath) {
      onMove(finalPath)
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div
        className="note-move-modal"
        onClick={event => event.stopPropagation()}
      >
        <div className="modal-header">
          <h3>移动笔记</h3>
          <button className="btn btn-icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="note-move-target">
          <span>正在移动</span>
          <strong>{target.name}</strong>
        </div>
        <div className="note-move-path">
          {selectedBreadcrumbs.map((part, index) => (
            <React.Fragment key={part.path || 'root'}>
              {index > 0 && <span>/</span>}
              <button type="button" onClick={() => selectPath(part.path)}>
                {part.label}
              </button>
            </React.Fragment>
          ))}
        </div>
        <div className="note-move-folder-list">
          <button
            type="button"
            className={`note-move-folder-item ${selectedPath === '' ? 'selected' : ''}`}
            onClick={() => selectPath('')}
          >
            <span className="note-move-folder-spacer" />
            <Folder className="note-move-folder-icon" size={16} />
            <span>全部笔记</span>
          </button>
          {usableDirectories.length === 0 ? (
            <p className="note-move-empty">还没有可选文件夹</p>
          ) : (
            visibleDirectories.map(directory => {
              const hasChildren = childPathsByParent.has(directory.path)
              const isExpanded = expandedPaths.has(directory.path)

              return (
                <button
                  type="button"
                  key={directory.path}
                  className={`note-move-folder-item note-move-depth-${Math.min(directory.depth, 4)} ${
                    selectedPath === directory.path ? 'selected' : ''
                  }`}
                  onClick={() => selectDirectory(directory.path)}
                >
                  {hasChildren ? (
                    isExpanded ? (
                      <ChevronDown className="note-move-expander" size={14} />
                    ) : (
                      <ChevronRight className="note-move-expander" size={14} />
                    )
                  ) : (
                    <span className="note-move-folder-spacer" />
                  )}
                  <Folder className="note-move-folder-icon" size={16} />
                  <span>{directory.name}</span>
                  {directory.parentPath && (
                    <small>{directory.parentPath}</small>
                  )}
                </button>
              )
            })
          )}
        </div>
        <input
          className="input input-compact"
          value={customPath}
          onChange={event => setCustomPath(event.target.value)}
          placeholder="或输入新目录路径，如 文章/摘录"
        />
        <div className="note-move-destination">
          目标位置：{finalPath || '全部笔记'}
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>
            取消
          </button>
          <button
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={isSamePath}
          >
            移动
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}

export default function NotePage() {
  return (
    <Suspense fallback={<div className="note-editor-loading">加载中...</div>}>
      <NotePageContent />
    </Suspense>
  )
}
