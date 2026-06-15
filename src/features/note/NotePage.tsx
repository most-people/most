import {
  Fragment,
  Suspense,
  lazy,
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
import { NoteMoreMenu } from '~/components/NoteMoreMenu'
import { NoteMoveModal, type NoteMoveTarget } from '~/components/NoteMoveModal'
import { NoteSidebar } from '~/components/NoteSidebar'
import { useNoteBackupSync } from '~/features/note/useNoteBackupSync'
import { useI18n, type MessageKey } from '~/lib/i18n'

const MilkdownEditor = lazy(async () => {
  const mod = await import('~/components/MilkdownEditor')
  return { default: mod.MilkdownEditor }
})

type ExplorerItem = NoteMoveTarget

type NoteSearchParams = {
  cid?: string
  mode?: 'edit'
}

function getNoteSearch(searchStr: string): NoteSearchParams {
  const searchParams = new URLSearchParams(searchStr)
  const mode = searchParams.get('mode')

  return {
    cid: searchParams.get('cid') || undefined,
    mode: mode === 'edit' ? 'edit' : undefined,
  }
}

function getNoteHref(search: NoteSearchParams = {}) {
  const searchParams = new URLSearchParams()
  if (search.cid) searchParams.set('cid', search.cid)
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

function NotePageContent() {
  const { t, formatDate, compareStrings } = useI18n()
  const navigate = useNavigate()
  const searchStr = useLocation({ select: location => location.searchStr })
  const params = useMemo(() => getNoteSearch(searchStr), [searchStr])
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
      await backupSync.uploadNow({ silent: true })
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
          await backupSync.uploadNow({ silent: true })
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
      await backupSync.uploadNow({ silent: true })
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
      await backupSync.uploadNow({ silent: true })
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
        await backupSync.uploadNow({ silent: true })
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
    <div className="note-theme-wrap">
      <button
        className="btn btn-icon"
        onClick={() => setIsDarkMode(!isDarkMode)}
        title={t('common.theme.toggle')}
        aria-label={t('common.theme.toggle')}
      >
        {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
      </button>
      <NoteMoreMenu sync={backupSync} />
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

export default function NotePage() {
  const { t } = useI18n()

  return (
    <Suspense
      fallback={<div className="note-editor-loading">{t('note.loading')}</div>}
    >
      <NotePageContent />
    </Suspense>
  )
}
