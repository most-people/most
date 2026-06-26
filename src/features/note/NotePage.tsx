import {
  Fragment,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useLocation, useNavigate } from '@tanstack/react-router'
import {
  PencilRuler,
  Eye,
  FileText,
  Folder,
  FolderOpen,
  Move,
  Lock,
  NotebookPen,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import AppShell from '~/components/AppShell'
import OpenSidebarButton from '~/components/OpenSidebarButton'
import { ConfirmModal, InputModal } from '~/components/ui'
import { useAppStore, type NoteItem } from '~/stores/useAppStore'
import { useUserStore } from '~/stores/userStore'
import type { MilkdownEditorRef } from '~/components/MilkdownEditor'
import { mostDecode, mostEncode } from '~server/src/utils/mostWallet.js'
import {
  filterNotesByPath,
  getNoteFullPath,
  normalizeNotePath,
} from '~server/src/utils/noteUtils.js'
import { NoteMoveModal, type NoteMoveTarget } from '~/components/NoteMoveModal'
import { NoteSidebar } from '~/components/NoteSidebar'
import { useI18n, type MessageKey } from '~/lib/i18n'
import { useIsDesktopClient } from '~/hooks'
import {
  getApiErrorMessage,
  getBackendUrlExport,
} from '~server/src/utils/api.js'
import {
  configureNoteVault,
  createNoteVaultFile,
  deleteNoteVaultFile,
  getNoteVaultStatus,
  listNoteVaultFiles,
  moveNoteVaultFile,
  readNoteVaultFile,
  saveNoteVaultFile,
  type NoteVaultFile,
  type NoteVaultFileContent,
  type NoteVaultStatus,
} from './noteVaultApi'

const MilkdownEditor = lazy(async () => {
  const mod = await import('~/components/MilkdownEditor')
  return { default: mod.MilkdownEditor }
})

type ExplorerItem = NoteMoveTarget

type NoteSearchParams = {
  cid?: string
  file?: string
  mode?: 'edit'
}

function getNoteSearch(searchStr: string): NoteSearchParams {
  const searchParams = new URLSearchParams(searchStr)
  const mode = searchParams.get('mode')

  return {
    cid: searchParams.get('cid') || undefined,
    file: searchParams.get('file') || undefined,
    mode: mode === 'edit' ? 'edit' : undefined,
  }
}

function getNoteHref(search: NoteSearchParams = {}) {
  const searchParams = new URLSearchParams()
  if (search.cid) searchParams.set('cid', search.cid)
  if (search.file) searchParams.set('file', search.file)
  if (search.mode) searchParams.set('mode', search.mode)

  const query = searchParams.toString()
  return query ? `/note/?${query}` : '/note/'
}

function getNotePreview(note: NoteItem, t: (key: MessageKey) => string) {
  if (note.isSecret || note.content.startsWith('mp://1')) {
    return t('note.preview.encrypted')
  }

  const preview = String(note.content || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return preview || t('note.preview.empty')
}

const noteErrorMessageKeys: Record<string, MessageKey> = {
  'note.error.nameRequired': 'note.error.nameRequired',
  'note.error.nameNoSlash': 'note.error.nameNoSlash',
  'note.error.nameNoBackslash': 'note.error.nameNoBackslash',
  'note.error.nameInvalid': 'note.error.nameInvalid',
  'note.error.nameConflict': 'note.error.nameConflict',
  'note.error.moveIntoSelf': 'note.error.moveIntoSelf',
}

function getErrorMessage(
  error: unknown,
  fallback: string,
  t: (key: MessageKey) => string
) {
  const message = error instanceof Error ? error.message : ''
  const messageKey = noteErrorMessageKeys[message]
  if (messageKey) return t(messageKey)
  return message || fallback
}

function getExplorerItemFullPath(item: ExplorerItem) {
  if (item.type === 'directory') {
    return normalizeNotePath(
      item.path ? `${item.path}/${item.name}` : item.name
    )
  }
  return getNoteFullPath(item)
}

function getDirectoryOptions(
  notes: NoteItem[],
  compareStrings: (left: string, right: string) => number
) {
  const directories = new Set<string>()

  for (const note of notes) {
    const parts = normalizeNotePath(note.path).split('/').filter(Boolean)
    for (let index = 0; index < parts.length; index += 1) {
      directories.add(parts.slice(0, index + 1).join('/'))
    }
  }

  return Array.from(directories)
    .sort(compareStrings)
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

function getVaultNoteItems(files: NoteVaultFile[]): NoteItem[] {
  return files.map(file => ({
    name: file.name,
    cid: file.path,
    path: normalizeNotePath(file.directory),
    content: '',
    size: file.size,
    type: 'file',
    created_at: Number(file.mtimeMs) || Date.now(),
    updated_at: Number(file.mtimeMs) || Date.now(),
    isSecret: false,
  }))
}

function ensureMarkdownFileName(input: string) {
  const name = input.trim()
  if (!name) return ''
  return name.toLowerCase().endsWith('.md') ? name : `${name}.md`
}

function getVaultFilePath(directory: string, name: string) {
  const fileName = ensureMarkdownFileName(name)
  return normalizeNotePath(directory ? `${directory}/${fileName}` : fileName)
}

function isLocalNoteVaultBackend(url: string) {
  const value =
    url ||
    (typeof window !== 'undefined' ? window.location.origin || '' : '')
  if (!value) return false

  try {
    const hostname = new URL(value).hostname.toLowerCase()
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '[::1]' ||
      hostname.startsWith('127.')
    )
  } catch {
    return false
  }
}

function useConfiguredNoteVaultBackend(enabled: boolean, walletAddress = '') {
  const [configured, setConfigured] = useState(false)

  useEffect(() => {
    let cancelled = false

    if (!enabled || !walletAddress) {
      setConfigured(false)
      return () => {
        cancelled = true
      }
    }

    getNoteVaultStatus()
      .then(status => {
        if (!cancelled) setConfigured(status.configured === true)
      })
      .catch(() => {
        if (!cancelled) setConfigured(false)
      })

    return () => {
      cancelled = true
    }
  }, [enabled, walletAddress])

  return configured
}

function NotePageContent() {
  const { t, formatDate, compareStrings } = useI18n()
  const navigate = useNavigate()
  const searchStr = useLocation({ select: location => location.searchStr })
  const params = useMemo(() => getNoteSearch(searchStr), [searchStr])
  const editorRef = useRef<MilkdownEditorRef>(null)

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

  const cid = params.cid || ''
  const selectedNote = notes.find(note => note.cid === cid)
  const showPreview = !!cid
  const isEditing = showPreview && params.mode === 'edit'

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
      setPreviewError(localDataReady ? t('note.error.notFound') : '')
      return
    }

    if (selectedNote.content.startsWith('mp://1')) {
      if (!wallet) {
        setPreviewContent('')
        setPreviewError(t('note.error.loginToDecrypt'))
        return
      }

      const decrypted = mostDecode(selectedNote.content, wallet.danger)
      if (!decrypted) {
        setPreviewContent('')
        setPreviewError(t('note.error.decryptFailed'))
        return
      }

      setPreviewContent(decrypted)
      setPreviewError('')
      return
    }

    setPreviewContent(selectedNote.content || '')
    setPreviewError('')
  }, [cid, localDataReady, selectedNote, t, wallet])

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
      setEditError(localDataReady ? t('note.error.notFound') : '')
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
        setEditError(t('note.error.loginToDecrypt'))
        return
      }

      const decrypted = mostDecode(selectedNote.content, wallet.danger)
      if (!decrypted) {
        setPlainContent('')
        setEditError(t('note.error.decryptFailed'))
        return
      }

      setPlainContent(decrypted)
      setEditError('')
      return
    }

    setPlainContent(selectedNote.content || '')
    setEditError('')
  }, [cid, isEditing, localDataReady, selectedNote, t, wallet])

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
      ? t('note.privacy.secret')
      : t('note.privacy.public')
    : selectedNoteIsSecret
      ? t('note.privacy.secret')
      : t('note.privacy.public')

  const breadcrumbs = useMemo(() => {
    const parts = notesPath.split('/').filter(Boolean)
    return [
      { label: t('note.root'), path: '' },
      ...parts.map((part, index) => ({
        label: part,
        path: parts.slice(0, index + 1).join('/'),
      })),
    ]
  }, [notesPath, t])
  const directoryOptions = useMemo(
    () => getDirectoryOptions(notes, compareStrings),
    [compareStrings, notes]
  )

  function navigateToNote(
    search: NoteSearchParams = {},
    replace = false
  ) {
    navigate({ href: getNoteHref(search), replace })
  }

  function openPreview(note: NoteItem) {
    navigateToNote({ cid: note.cid })
  }

  function openEditor(note: NoteItem) {
    navigateToNote({ cid: note.cid, mode: 'edit' })
  }

  function requireWallet() {
    if (wallet) return true
    openLoginModal()
    return false
  }

  function closeEditor() {
    navigateToNote(selectedNote ? { cid: selectedNote.cid } : {})
  }

  async function handleSaveEditor() {
    if (!requireWallet()) return
    if (!selectedNote) {
      addToast(t('note.toast.notFound'), 'error')
      return
    }
    if (!noteName.trim()) {
      addToast(t('note.toast.nameRequired'), 'warning')
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
      navigateToNote({ cid: nextCid }, true)
      addToast(t('note.toast.saved'), 'success')
    } catch (err: unknown) {
      addToast(getErrorMessage(err, t('note.toast.saveFailed'), t), 'error')
    } finally {
      setSaving(false)
    }
  }

  function openCreateNoteModal() {
    if (!requireWallet()) return
    setInputModal({
      title: t('note.create.title'),
      placeholder: t('note.namePlaceholder'),
      confirmText: t('note.create.action'),
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
          addToast(t('note.toast.created'), 'success')
          navigateToNote({ cid: newCid, mode: 'edit' })
        } catch (err: unknown) {
          addToast(
            getErrorMessage(err, t('note.toast.createFailed'), t),
            'error'
          )
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
      addToast(t('note.toast.nameRequired'), 'warning')
      return
    }
    if (nextName === selectedNote.name) return

    try {
      renameNote(getNoteFullPath(selectedNote), selectedNote.path, nextName)
      addToast(t('note.toast.renamed'), 'success')
    } catch (err: unknown) {
      setPreviewName(selectedNote.name)
      addToast(getErrorMessage(err, t('note.toast.renameFailed'), t), 'error')
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
      addToast(t('note.toast.moved'), 'success')
    } catch (err: unknown) {
      addToast(getErrorMessage(err, t('note.toast.moveFailed'), t), 'error')
    }
  }

  function openDeleteConfirm(item: ExplorerItem) {
    if (!requireWallet()) return
    const isDirectory = item.type === 'directory'
    setConfirmModal({
      title: isDirectory
        ? t('note.delete.folderTitle')
        : t('note.delete.noteTitle'),
      message: t('note.delete.message', { name: item.name }),
      confirmText: t('note.action.delete'),
      onConfirm: async () => {
        deleteNote(isDirectory ? undefined : item.cid, item.path, item.name)
        setConfirmModal(null)
        addToast(t('note.toast.deleted'), 'success')
        if (item.type === 'file' && item.cid === cid) {
          navigateToNote()
        }
      },
    })
  }

  const headerTitle = (
    <div className="note-header-title">
      <h2 className="header-title">{t('note.title')}</h2>
      <span>{t('note.count', { count: notes.length })}</span>
    </div>
  )

  const headerRight = (
    <div className="note-theme-wrap" />
  )

  const noteExplorer = (
    <section
      className="note-list-panel note-sidebar-list"
      aria-label={t('note.listLabel')}
    >
      <div className="note-list-header">
        <div className="note-current-location">
          <div className="note-breadcrumbs">
            {breadcrumbs.map((part, index) => (
              <Fragment key={part.path || 'root'}>
                {index > 0 && <span>/</span>}
                <button onClick={() => setNotesPath(part.path)}>
                  <span translate={part.path ? 'no' : 'yes'}>
                    {part.label}
                  </span>
                </button>
              </Fragment>
            ))}
          </div>
        </div>
        <span className="note-count">
          {t('note.count', { count: visibleFileCount })}
        </span>
      </div>

      <div className="note-search">
        <Search size={16} />
        <input
          className="input input-flex"
          value={searchQuery}
          onChange={event => setSearchQuery(event.target.value)}
          placeholder={t('note.search.placeholder')}
        />
      </div>

      {explorerItems.length === 0 ? (
        <div className="ui-empty-state note-empty-state">
          <NotebookPen size={32} />
          <p>
            {searchQuery ? t('note.empty.noMatches') : t('note.empty.noNotes')}
          </p>
        </div>
      ) : (
        <div className="note-list">
          {explorerItems.map(item => (
            <article
              key={`${item.cid}:${item.path}:${item.name}`}
              className={`ui-list-item note-list-item ${item.type === 'file' && item.cid === cid ? 'active' : ''}`}
            >
              <button
                className={`ui-list-item-main note-list-item-main ${item.type === 'directory' ? 'folder' : ''}`}
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
                <span className={`ui-list-icon note-list-icon ${item.type === 'directory' ? 'warning' : ''}`}>
                  {item.type === 'directory' ? (
                    <Folder size={18} />
                  ) : item.isSecret ? (
                    <Lock size={18} />
                  ) : (
                    <FileText size={18} />
                  )}
                </span>
                <span className="ui-list-copy note-list-copy">
                  <span className="ui-list-title note-list-name" translate="no">
                    {item.name}
                  </span>
                  {item.type === 'file' ? (
                    <span
                      className="ui-list-desc note-list-preview"
                      translate="no"
                    >
                      {getNotePreview(item, t)}
                    </span>
                  ) : (
                    <span className="ui-list-desc note-list-preview">
                      {t('note.folder')}
                    </span>
                  )}
                </span>
                {item.type === 'file' && (
                  <span className="ui-list-meta note-list-date">
                    {formatDate(item.updated_at)}
                  </span>
                )}
              </button>
            </article>
          ))}
        </div>
      )}

      <div className="note-create-btn">
        <button className="btn" onClick={openCreateNoteModal}>
          <Plus size={16} />
          {t('note.newNote')}
        </button>
      </div>
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
            aria-label={
              isEditing ? t('note.editorLabel.edit') : t('note.editorLabel.read')
            }
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
                        placeholder={t('note.namePlaceholder')}
                        translate="no"
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
                        placeholder={t('note.namePlaceholder')}
                        title={t('app.rename')}
                        translate="no"
                      />
                    ) : (
                      <h3>{t('note.untitled')}</h3>
                    )}
                    {selectedNote && (
                      <div className="note-editor-info">
                        <span>
                          {isEditing ? t('note.mode.edit') : t('note.mode.read')}
                        </span>
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
                        isEditing ? closeEditor : () => navigateToNote()
                      }
                      title={isEditing ? t('common.cancel') : t('common.close')}
                      aria-label={
                        isEditing ? t('common.cancel') : t('common.close')
                      }
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
                          {editIsSecret
                            ? t('note.privacy.secret')
                            : t('note.privacy.public')}
                        </button>
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={handleSaveEditor}
                          disabled={saving || !!editError || !selectedNote}
                        >
                          <Save size={16} />
                          {saving ? t('note.action.saving') : t('note.action.save')}
                        </button>
                      </>
                    ) : (
                      selectedNote && (
                        <>
                          <button
                            type="button"
                            className="btn btn-icon"
                            onClick={() => openMoveModal(selectedNote)}
                            title={t('note.action.move')}
                            aria-label={t('note.action.move')}
                          >
                            <Move size={16} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-icon note-editor-action-danger"
                            onClick={() => openDeleteConfirm(selectedNote)}
                            title={t('note.action.delete')}
                            aria-label={t('note.action.delete')}
                          >
                            <Trash2 size={16} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            onClick={() => openEditor(selectedNote)}
                            disabled={!!previewError}
                            title={t('note.action.edit')}
                            aria-label={t('note.action.edit')}
                          >
                            <PencilRuler size={16} />
                            {t('note.action.edit')}
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
                      <p>
                        {localDataReady
                          ? t('note.error.notFound')
                          : t('note.loading')}
                      </p>
                    </div>
                  )
                ) : previewError ? (
                  <div className="ui-empty-state note-empty-state editor-error">
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
                  <div className="ui-empty-state note-empty-state editor-error">
                    <NotebookPen size={36} />
                    <p>
                      {localDataReady
                        ? t('note.error.notFound')
                        : t('note.loading')}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="ui-empty-state note-editor-empty">
                <div className="ui-empty-icon note-editor-empty-icon">
                  <NotebookPen size={32} />
                </div>
                <h3 className="ui-empty-title">{t('note.noOpen.title')}</h3>
                <p className="ui-empty-desc">
                  {notes.length > 0
                    ? t('note.noOpen.select')
                    : t('note.noOpen.createFirst')}
                </p>
                <OpenSidebarButton label={t('note.openList')} variant="default" />
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

function VaultNotePageContent() {
  const { t, formatDate, compareStrings } = useI18n()
  const navigate = useNavigate()
  const searchStr = useLocation({ select: location => location.searchStr })
  const params = useMemo(() => getNoteSearch(searchStr), [searchStr])
  const editorRef = useRef<MilkdownEditorRef>(null)

  const addToast = useAppStore(s => s.addToast)
  const wallet = useUserStore(s => s.wallet)
  const openLoginModal = useUserStore(s => s.openLoginModal)

  const currentFilePath = params.file || ''
  const showPreview = !!currentFilePath
  const isEditing = showPreview && params.mode === 'edit'

  const [vaultStatus, setVaultStatus] = useState<NoteVaultStatus | null>(null)
  const [vaultFiles, setVaultFiles] = useState<NoteVaultFile[]>([])
  const [vaultFolderPath, setVaultFolderPath] = useState('')
  const [vaultLoading, setVaultLoading] = useState(true)
  const [vaultError, setVaultError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [openingVault, setOpeningVault] = useState(false)
  const [selectedFile, setSelectedFile] =
    useState<NoteVaultFileContent | null>(null)
  const [previewName, setPreviewName] = useState('')
  const [plainContent, setPlainContent] = useState('')
  const [fileLoading, setFileLoading] = useState(false)
  const [fileError, setFileError] = useState('')
  const [saving, setSaving] = useState(false)
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

  const vaultNotes = useMemo(() => getVaultNoteItems(vaultFiles), [vaultFiles])
  const selectedNote = vaultNotes.find(note => note.cid === currentFilePath)
  const directoryOptions = useMemo(
    () => getDirectoryOptions(vaultNotes, compareStrings),
    [compareStrings, vaultNotes]
  )
  const explorerItems = useMemo(
    () =>
      filterNotesByPath(
        vaultNotes,
        vaultFolderPath,
        searchQuery
      ) as unknown as ExplorerItem[],
    [vaultFolderPath, searchQuery, vaultNotes]
  )
  const visibleFileCount = explorerItems.filter(
    item => item.type === 'file'
  ).length
  const breadcrumbs = useMemo(() => {
    const parts = vaultFolderPath.split('/').filter(Boolean)
    return [
      { label: t('note.root'), path: '' },
      ...parts.map((part, index) => ({
        label: part,
        path: parts.slice(0, index + 1).join('/'),
      })),
    ]
  }, [vaultFolderPath, t])

  const refreshVault = useCallback(async () => {
    if (!wallet) {
      setVaultStatus(null)
      setVaultFiles([])
      setVaultError(t('note.vault.loginRequired'))
      setVaultLoading(false)
      return
    }

    setVaultLoading(true)
    setVaultError('')
    try {
      const status = await getNoteVaultStatus()
      setVaultStatus(status)
      if (status.configured) {
        setVaultFiles(await listNoteVaultFiles())
      } else {
        setVaultFiles([])
      }
    } catch (err: unknown) {
      setVaultStatus(null)
      setVaultFiles([])
      setVaultError(await getApiErrorMessage(err, t('note.vault.loadFailed')))
    } finally {
      setVaultLoading(false)
    }
  }, [t, wallet])

  useEffect(() => {
    void refreshVault()
  }, [refreshVault])

  useEffect(() => {
    setPreviewName(selectedFile?.name || selectedNote?.name || '')
  }, [selectedFile?.name, selectedNote?.name])

  useEffect(() => {
    let cancelled = false

    async function loadFile() {
      if (!currentFilePath) {
        setSelectedFile(null)
        setPlainContent('')
        setFileError('')
        setFileLoading(false)
        return
      }
      if (!wallet) {
        setSelectedFile(null)
        setPlainContent('')
        setFileError(t('note.vault.loginRequired'))
        setFileLoading(false)
        return
      }
      if (vaultStatus?.configured !== true) {
        setSelectedFile(null)
        setPlainContent('')
        setFileError('')
        setFileLoading(false)
        return
      }

      setFileLoading(true)
      setFileError('')
      try {
        const file = await readNoteVaultFile(currentFilePath)
        if (cancelled) return
        setSelectedFile(file)
        setPlainContent(file.content)
      } catch (err: unknown) {
        if (cancelled) return
        setSelectedFile(null)
        setPlainContent('')
        setFileError(await getApiErrorMessage(err, t('note.error.notFound')))
      } finally {
        if (!cancelled) setFileLoading(false)
      }
    }

    void loadFile()
    return () => {
      cancelled = true
    }
  }, [currentFilePath, t, vaultStatus?.configured, wallet])

  function navigateToVault(
    search: NoteSearchParams = {},
    replace = false
  ) {
    navigate({ href: getNoteHref(search), replace })
  }

  function openPreview(note: NoteItem) {
    navigateToVault({ file: note.cid })
  }

  function openEditor() {
    if (!currentFilePath) return
    navigateToVault({ file: currentFilePath, mode: 'edit' })
  }

  function closeEditor() {
    navigateToVault(currentFilePath ? { file: currentFilePath } : {})
  }

  async function handleOpenVault() {
    if (!wallet) {
      openLoginModal()
      return
    }

    const picker = window.electronAPI?.selectNoteVaultDirectory
    if (!picker) {
      addToast(t('note.vault.selectFailed'), 'error')
      return
    }

    setOpeningVault(true)
    try {
      const directory = await picker()
      if (!directory) return

      await configureNoteVault(directory)
      await refreshVault()
      navigateToVault({}, true)
      addToast(t('note.vault.opened'), 'success')
    } catch (err: unknown) {
      addToast(await getApiErrorMessage(err, t('note.vault.selectFailed')), 'error')
    } finally {
      setOpeningVault(false)
    }
  }

  function ensureVaultReady() {
    if (!wallet) {
      openLoginModal()
      return false
    }
    if (vaultStatus?.configured !== true) {
      addToast(t('note.vault.emptyPrompt'), 'warning')
      return false
    }
    return true
  }

  function openCreateNoteModal() {
    if (!ensureVaultReady()) return
    setInputModal({
      title: t('note.create.title'),
      placeholder: t('note.namePlaceholder'),
      confirmText: t('note.create.action'),
      onConfirm: async value => {
        if (!ensureVaultReady()) return
        const targetPath = getVaultFilePath(vaultFolderPath, value)
        if (!targetPath) {
          addToast(t('note.toast.nameRequired'), 'warning')
          return
        }

        try {
          const file = await createNoteVaultFile(targetPath, '')
          setInputModal(null)
          await refreshVault()
          navigateToVault({ file: file.path, mode: 'edit' })
          addToast(t('note.toast.created'), 'success')
        } catch (err: unknown) {
          addToast(
            await getApiErrorMessage(err, t('note.toast.createFailed')),
            'error'
          )
        }
      },
    })
  }

  async function handlePreviewRename() {
    if (!ensureVaultReady() || !selectedFile) return
    const nextName = ensureMarkdownFileName(previewName)
    if (!nextName) {
      setPreviewName(selectedFile.name)
      addToast(t('note.toast.nameRequired'), 'warning')
      return
    }
    if (nextName === selectedFile.name) return

    const nextPath = normalizeNotePath(
      selectedFile.directory
        ? `${selectedFile.directory}/${nextName}`
        : nextName
    )

    try {
      const file = await moveNoteVaultFile(selectedFile.path, nextPath)
      setSelectedFile(file)
      setPreviewName(file.name)
      await refreshVault()
      navigateToVault({ file: file.path }, true)
      addToast(t('note.toast.renamed'), 'success')
    } catch (err: unknown) {
      setPreviewName(selectedFile.name)
      addToast(
        await getApiErrorMessage(err, t('note.toast.renameFailed')),
        'error'
      )
    }
  }

  function openMoveModal(item: ExplorerItem) {
    if (!ensureVaultReady()) return
    setMoveTarget(item)
  }

  async function handleMove(targetPath: string) {
    if (!moveTarget || !ensureVaultReady()) return

    try {
      let nextCurrentPath = currentFilePath

      if (moveTarget.type === 'directory') {
        const sourceFolder = getExplorerItemFullPath(moveTarget)
        const targetFolder = normalizeNotePath(
          targetPath ? `${targetPath}/${moveTarget.name}` : moveTarget.name
        )
        const filesToMove = vaultFiles.filter(file =>
          file.path.startsWith(`${sourceFolder}/`)
        )

        for (const file of filesToMove) {
          const suffix = file.path.slice(sourceFolder.length + 1)
          const nextPath = normalizeNotePath(`${targetFolder}/${suffix}`)
          await moveNoteVaultFile(file.path, nextPath)
          if (currentFilePath === file.path) {
            nextCurrentPath = nextPath
          }
        }
      } else {
        const nextPath = normalizeNotePath(
          targetPath ? `${targetPath}/${moveTarget.name}` : moveTarget.name
        )
        const file = await moveNoteVaultFile(moveTarget.cid, nextPath)
        if (currentFilePath === moveTarget.cid) {
          nextCurrentPath = file.path
        }
      }

      setMoveTarget(null)
      await refreshVault()
      navigateToVault(nextCurrentPath ? { file: nextCurrentPath } : {}, true)
      addToast(t('note.toast.moved'), 'success')
    } catch (err: unknown) {
      addToast(
        await getApiErrorMessage(err, t('note.toast.moveFailed')),
        'error'
      )
    }
  }

  function openDeleteConfirm(item: ExplorerItem) {
    if (!ensureVaultReady()) return
    const isDirectory = item.type === 'directory'
    setConfirmModal({
      title: isDirectory
        ? t('note.delete.folderTitle')
        : t('note.delete.noteTitle'),
      message: t('note.delete.message', { name: item.name }),
      confirmText: t('note.action.delete'),
      onConfirm: async () => {
        try {
          if (item.type === 'directory') {
            const folderPath = getExplorerItemFullPath(item)
            const filesToDelete = vaultFiles.filter(file =>
              file.path.startsWith(`${folderPath}/`)
            )
            for (const file of filesToDelete) {
              await deleteNoteVaultFile(file.path)
            }
            if (currentFilePath.startsWith(`${folderPath}/`)) {
              navigateToVault({}, true)
            }
          } else {
            await deleteNoteVaultFile(item.cid)
            if (currentFilePath === item.cid) {
              navigateToVault({}, true)
            }
          }

          setConfirmModal(null)
          await refreshVault()
          addToast(t('note.toast.deleted'), 'success')
        } catch (err: unknown) {
          addToast(
            await getApiErrorMessage(err, t('note.toast.deleteFailed')),
            'error'
          )
        }
      },
    })
  }

  async function handleSaveEditor() {
    if (!wallet) {
      openLoginModal()
      return
    }
    if (!currentFilePath) {
      addToast(t('note.toast.notFound'), 'error')
      return
    }

    setSaving(true)
    try {
      const markdown = editorRef.current?.getMarkdown() ?? plainContent
      const file = await saveNoteVaultFile(currentFilePath, markdown)
      setSelectedFile(file)
      setPlainContent(file.content)
      await refreshVault()
      navigateToVault({ file: file.path }, true)
      addToast(t('note.toast.saved'), 'success')
    } catch (err: unknown) {
      addToast(await getApiErrorMessage(err, t('note.toast.saveFailed')), 'error')
    } finally {
      setSaving(false)
    }
  }

  const headerTitle = (
    <div className="note-header-title">
      <h2 className="header-title">{t('note.title')}</h2>
      <span>{t('note.count', { count: vaultFiles.length })}</span>
    </div>
  )

  const headerRight = (
    <div className="note-theme-wrap">
      <button
        className="btn btn-sm"
        onClick={handleOpenVault}
        disabled={openingVault}
        title={t('note.vault.open')}
        aria-label={t('note.vault.open')}
      >
        <FolderOpen size={16} />
        {openingVault ? t('note.vault.opening') : t('note.vault.open')}
      </button>
    </div>
  )

  const noteExplorer = (
    <section
      className="note-list-panel note-sidebar-list"
      aria-label={t('note.listLabel')}
    >
      <div className="note-list-header">
        <div className="note-current-location">
          <div className="note-breadcrumbs">
            {breadcrumbs.map((part, index) => (
              <Fragment key={part.path || 'root'}>
                {index > 0 && <span>/</span>}
                <button onClick={() => setVaultFolderPath(part.path)}>
                  <span translate={part.path ? 'no' : 'yes'}>
                    {part.label}
                  </span>
                </button>
              </Fragment>
            ))}
          </div>
        </div>
        <span className="note-count">
          {t('note.count', { count: visibleFileCount })}
        </span>
      </div>

      <div className="note-search">
        <Search size={16} />
        <input
          className="input input-flex"
          value={searchQuery}
          onChange={event => setSearchQuery(event.target.value)}
          placeholder={t('note.search.placeholder')}
        />
      </div>

      {vaultLoading ? (
        <div className="ui-empty-state note-empty-state">
          <NotebookPen size={32} />
          <p>{t('note.loading')}</p>
        </div>
      ) : vaultError ? (
        <div className="ui-empty-state note-empty-state">
          <Lock size={32} />
          <p>{vaultError}</p>
        </div>
      ) : vaultStatus?.configured !== true ? (
        <div className="ui-empty-state note-empty-state">
          <FolderOpen size={32} />
          <button
            className="btn btn-primary"
            onClick={handleOpenVault}
            disabled={openingVault}
          >
            <FolderOpen size={16} />
            {openingVault ? t('note.vault.opening') : t('note.vault.open')}
          </button>
        </div>
      ) : explorerItems.length === 0 ? (
        <div className="ui-empty-state note-empty-state">
          <NotebookPen size={32} />
          <p>
            {searchQuery ? t('note.empty.noMatches') : t('note.vault.noFiles')}
          </p>
        </div>
      ) : (
        <div className="note-list">
          {explorerItems.map(item => (
            <article
              key={`${item.type}:${item.cid || getExplorerItemFullPath(item)}`}
              className={`ui-list-item note-list-item has-actions ${item.type === 'file' && item.cid === currentFilePath ? 'active' : ''}`}
            >
              <button
                className={`ui-list-item-main note-list-item-main ${item.type === 'directory' ? 'folder' : ''}`}
                onClick={() => {
                  if (item.type === 'directory') {
                    setVaultFolderPath(
                      normalizeNotePath(
                        item.path ? `${item.path}/${item.name}` : item.name
                      )
                    )
                  } else {
                    openPreview(item)
                  }
                }}
              >
                <span className={`ui-list-icon note-list-icon ${item.type === 'directory' ? 'warning' : ''}`}>
                  {item.type === 'directory' ? (
                    <Folder size={18} />
                  ) : (
                    <FileText size={18} />
                  )}
                </span>
                <span className="ui-list-copy note-list-copy">
                  <span className="ui-list-title note-list-name" translate="no">
                    {item.name}
                  </span>
                  <span className="ui-list-desc note-list-preview" translate="no">
                    {item.type === 'file'
                      ? item.cid
                      : t('note.folder')}
                  </span>
                </span>
                {item.type === 'file' && (
                  <span className="ui-list-meta note-list-date">
                    {formatDate(item.updated_at)}
                  </span>
                )}
              </button>
              <div className="note-list-inline-actions">
                <button
                  type="button"
                  className="btn btn-icon"
                  onClick={() => openMoveModal(item)}
                  title={t('note.action.move')}
                  aria-label={t('note.action.move')}
                >
                  <Move size={15} />
                </button>
                <button
                  type="button"
                  className="btn btn-icon note-editor-action-danger"
                  onClick={() => openDeleteConfirm(item)}
                  title={t('note.action.delete')}
                  aria-label={t('note.action.delete')}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {vaultStatus?.configured === true && (
        <div className="note-create-btn">
          <button className="btn" onClick={openCreateNoteModal}>
            <Plus size={16} />
            {t('note.newNote')}
          </button>
        </div>
      )}
    </section>
  )

  const editorMetaTime =
    selectedFile?.mtimeMs || selectedNote?.updated_at || Date.now()
  const selectedTitle =
    selectedFile?.name || selectedNote?.name || t('note.untitled')

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
            aria-label={
              isEditing ? t('note.editorLabel.edit') : t('note.editorLabel.read')
            }
          >
            {showPreview ? (
              <>
                <div className="note-editor-panel-header">
                  <div className="note-editor-title-area">
                    {selectedFile && !isEditing ? (
                      <input
                        className="note-title-input"
                        value={previewName}
                        onBlur={handlePreviewRename}
                        onChange={event => setPreviewName(event.target.value)}
                        onKeyDown={event => {
                          if (event.key === 'Enter') {
                            event.currentTarget.blur()
                          }
                        }}
                        title={t('app.rename')}
                        translate="no"
                      />
                    ) : (
                      <h3 translate="no">{selectedTitle}</h3>
                    )}
                    <div className="note-editor-info">
                      <span>
                        {isEditing ? t('note.mode.edit') : t('note.mode.read')}
                      </span>
                      <span translate="no">{currentFilePath}</span>
                      <span>{formatDate(editorMetaTime)}</span>
                    </div>
                  </div>

                  <div className="note-editor-actions">
                    <button
                      type="button"
                      className="btn btn-icon"
                      onClick={isEditing ? closeEditor : () => navigateToVault()}
                      title={isEditing ? t('common.cancel') : t('common.close')}
                      aria-label={
                        isEditing ? t('common.cancel') : t('common.close')
                      }
                    >
                      <X size={16} />
                    </button>
                    {isEditing ? (
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={handleSaveEditor}
                        disabled={saving || !!fileError || !selectedFile}
                      >
                        <Save size={16} />
                        {saving ? t('note.action.saving') : t('note.action.save')}
                      </button>
                    ) : (
                      selectedNote && (
                        <>
                          <button
                            type="button"
                            className="btn btn-icon"
                            onClick={() => openMoveModal(selectedNote)}
                            disabled={!!fileError || !selectedFile}
                            title={t('note.action.move')}
                            aria-label={t('note.action.move')}
                          >
                            <Move size={16} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-icon note-editor-action-danger"
                            onClick={() => openDeleteConfirm(selectedNote)}
                            disabled={!!fileError || !selectedFile}
                            title={t('note.action.delete')}
                            aria-label={t('note.action.delete')}
                          >
                            <Trash2 size={16} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            onClick={openEditor}
                            disabled={!!fileError || !selectedFile}
                            title={t('note.action.edit')}
                            aria-label={t('note.action.edit')}
                          >
                            <PencilRuler size={16} />
                            {t('note.action.edit')}
                          </button>
                        </>
                      )
                    )}
                  </div>
                </div>

                {fileLoading ? (
                  <div className="ui-empty-state note-empty-state editor-error">
                    <NotebookPen size={36} />
                    <p>{t('note.loading')}</p>
                  </div>
                ) : fileError ? (
                  <div className="ui-empty-state note-empty-state editor-error">
                    <Lock size={36} />
                    <p>{fileError}</p>
                  </div>
                ) : isEditing ? (
                  <div className="note-editor-frame editing">
                    <MilkdownEditor
                      ref={editorRef}
                      content={plainContent}
                      onChange={setPlainContent}
                      className="milkdown-editor"
                    />
                  </div>
                ) : selectedFile ? (
                  <div className="note-editor-frame reading">
                    <MilkdownEditor
                      content={selectedFile.content}
                      readOnly
                      className="milkdown-editor"
                    />
                  </div>
                ) : (
                  <div className="ui-empty-state note-empty-state editor-error">
                    <NotebookPen size={36} />
                    <p>{t('note.error.notFound')}</p>
                  </div>
                )}
              </>
            ) : (
              <div className="ui-empty-state note-editor-empty">
                <div className="ui-empty-icon note-editor-empty-icon">
                  <NotebookPen size={32} />
                </div>
                <h3 className="ui-empty-title">
                  {vaultStatus?.configured
                    ? t('note.noOpen.title')
                    : t('note.vault.open')}
                </h3>
                <p className="ui-empty-desc">
                  {vaultStatus?.configured
                    ? t('note.noOpen.select')
                    : t('note.vault.emptyPrompt')}
                </p>
                {vaultStatus?.configured ? (
                  <OpenSidebarButton
                    label={t('note.openList')}
                    variant="default"
                  />
                ) : (
                  <button
                    className="btn btn-primary"
                    onClick={handleOpenVault}
                    disabled={openingVault}
                  >
                    <FolderOpen size={16} />
                    {openingVault ? t('note.vault.opening') : t('note.vault.open')}
                  </button>
                )}
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

export default function NotePage() {
  const { t } = useI18n()
  const hasBackend = useAppStore(s => s.hasBackend)
  const wallet = useUserStore(s => s.wallet)
  const isDesktopClient = useIsDesktopClient()
  const isLocalBackend =
    hasBackend === true && isLocalNoteVaultBackend(getBackendUrlExport())
  const hasConfiguredVaultBackend = useConfiguredNoteVaultBackend(
    isLocalBackend,
    wallet?.address || ''
  )
  const useVaultMode =
    isLocalBackend && (isDesktopClient || hasConfiguredVaultBackend)

  return (
    <Suspense
      fallback={<div className="note-editor-loading">{t('note.loading')}</div>}
    >
      {useVaultMode ? <VaultNotePageContent /> : <NotePageContent />}
    </Suspense>
  )
}
