'use client'

import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  CloudDownload,
  CloudUpload,
  Edit2,
  Eye,
  FileText,
  Folder,
  FolderPlus,
  KeyRound,
  Lock,
  LogOut,
  Moon,
  NotebookPen,
  Pencil,
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
import type { MilkdownEditorRef } from '~/components/MilkdownEditor'
import { mostDecode, mostEncode } from '~/server/src/utils/mostWallet.js'
import {
  buildNotesBackupUpload,
  decryptNotesBackup,
  getBackupAuthHeaders,
  NOTE_BACKUP_API_URL,
} from '~/server/src/utils/noteBackup.js'
import {
  calculateNoteCid,
  filterNotesByPath,
  getNoteFullPath,
  normalizeNotePath,
} from '~/server/src/utils/noteUtils.js'

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

function shortAddress(address = '') {
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '-'
}

async function readApiError(response: Response, fallback: string) {
  const data = await response
    .clone()
    .json()
    .catch(() => null)
  return data?.error || fallback
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function NotePageContent() {
  const router = useRouter()
  const params = useSearchParams()
  const editorRef = useRef<MilkdownEditorRef>(null)

  const isDarkMode = useAppStore(s => s.isDarkMode)
  const setIsDarkMode = useAppStore(s => s.setIsDarkMode)
  const addToast = useAppStore(s => s.addToast)
  const wallet = useAppStore(s => s.wallet)
  const loginWithWeb3 = useAppStore(s => s.loginWithWeb3)
  const logoutWeb3 = useAppStore(s => s.logoutWeb3)
  const notes = useAppStore(s => s.notes)
  const notesPath = useAppStore(s => s.notesPath)
  const setNotesPath = useAppStore(s => s.setNotesPath)
  const saveNote = useAppStore(s => s.saveNote)
  const deleteNote = useAppStore(s => s.deleteNote)
  const renameNote = useAppStore(s => s.renameNote)
  const importNotes = useAppStore(s => s.importNotes)

  const cid = params.get('cid') || ''
  const mode = params.get('mode') || ''
  const isNewNote = mode === 'new'
  const selectedNote = notes.find(note => note.cid === cid)
  const showEditor = isNewNote || !!cid

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
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
    onConfirm: () => void
  }>(null)
  const [renameTarget, setRenameTarget] = useState<ExplorerItem | null>(null)
  const [renameName, setRenameName] = useState('')
  const [renamePath, setRenamePath] = useState('')
  const [cloudAction, setCloudAction] = useState<'save' | 'restore' | null>(
    null
  )

  const [noteName, setNoteName] = useState('')
  const [notePath, setNotePath] = useState('')
  const [plainContent, setPlainContent] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [isSecret, setIsSecret] = useState(false)
  const [decryptError, setDecryptError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!showEditor) return

    if (isNewNote) {
      setNoteName('')
      setNotePath(notesPath)
      setPlainContent('')
      setIsSecret(false)
      setDecryptError('')
      setIsEditing(true)
      return
    }

    if (!selectedNote) {
      setNoteName('')
      setNotePath('')
      setPlainContent('')
      setIsSecret(false)
      setDecryptError('笔记不存在')
      setIsEditing(false)
      return
    }

    setNoteName(selectedNote.name)
    setNotePath(selectedNote.path || '')
    setIsSecret(
      selectedNote.isSecret === true || selectedNote.content.startsWith('mp://1')
    )
    setIsEditing(mode === 'edit')

    if (selectedNote.content.startsWith('mp://1')) {
      if (!wallet) {
        setPlainContent('')
        setDecryptError('请先登录 Web3 账号以解密此笔记')
        return
      }

      const decrypted = mostDecode(selectedNote.content, wallet.danger)
      if (!decrypted) {
        setPlainContent('')
        setDecryptError('无法解密，请确认当前 Web3 账号正确')
        return
      }

      setPlainContent(decrypted)
      setDecryptError('')
      return
    }

    setPlainContent(selectedNote.content || '')
    setDecryptError('')
  }, [cid, isNewNote, mode, notesPath, selectedNote, showEditor, wallet])

  const explorerItems = useMemo(
    () =>
      filterNotesByPath(
        notes,
        notesPath,
        searchQuery
      ) as unknown as ExplorerItem[],
    [notes, notesPath, searchQuery]
  )

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

  function openEditor(note: NoteItem, edit = false) {
    router.push(`/note/?cid=${encodeURIComponent(note.cid)}${edit ? '&mode=edit' : ''}`)
  }

  function handleLogin() {
    if (!username.trim()) {
      addToast('请输入用户名', 'warning')
      return
    }
    setLoginLoading(true)
    setTimeout(() => {
      try {
        const result = loginWithWeb3(username.trim(), password)
        addToast(`已登录 ${result.username}`, 'success')
        setUsername('')
        setPassword('')
      } catch (err: unknown) {
        addToast(getErrorMessage(err, '登录失败'), 'error')
      } finally {
        setLoginLoading(false)
      }
    }, 0)
  }

  function openCreateNoteModal() {
    setInputModal({
      title: '新建笔记',
      placeholder: '笔记名称',
      confirmText: '创建',
      onConfirm: async value => {
        if (!wallet) {
          addToast('请先登录 Web3 账号', 'warning')
          return
        }
        try {
          const newCid = await saveNote({
            name: value,
            path: notesPath,
            content: '',
            isSecret: false,
          })
          setInputModal(null)
          addToast('笔记已创建', 'success')
          router.push(`/note/?cid=${encodeURIComponent(newCid)}&mode=edit`)
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
        if (!wallet) {
          addToast('请先登录 Web3 账号', 'warning')
          return
        }
        try {
          await saveNote({
            name: 'index',
            path: normalizeNotePath(`${notesPath}/${value}`),
            content: '',
            isSecret: false,
          })
          setInputModal(null)
          addToast('文件夹已创建', 'success')
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

  function handleRename() {
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
      onConfirm: () => {
        deleteNote(
          isDirectory ? undefined : item.cid,
          item.path,
          item.name
        )
        setConfirmModal(null)
        addToast('已删除', 'success')
      },
    })
  }

  async function handleSaveEditor() {
    if (!wallet) {
      addToast('请先登录 Web3 账号', 'warning')
      return
    }
    if (!noteName.trim()) {
      addToast('请输入笔记名称', 'warning')
      return
    }
    setSaving(true)
    try {
      const markdown = editorRef.current?.getMarkdown() ?? plainContent
      const storedContent = isSecret
        ? mostEncode(markdown, wallet.danger)
        : markdown
      const nextCid = await saveNote({
        cid: selectedNote?.cid,
        name: noteName,
        path: notePath,
        content: storedContent,
        isSecret,
      })
      setPlainContent(markdown)
      setIsEditing(false)
      addToast('笔记已保存', 'success')
      router.replace(`/note/?cid=${encodeURIComponent(nextCid)}`)
    } catch (err: unknown) {
      addToast(getErrorMessage(err, '保存失败'), 'error')
    } finally {
      setSaving(false)
    }
  }

  function handleCancelEdit() {
    if (isNewNote) {
      router.push('/note/')
      return
    }
    editorRef.current?.setMarkdown(plainContent)
    setIsEditing(false)
    router.replace(selectedNote ? `/note/?cid=${selectedNote.cid}` : '/note/')
  }

  async function handleCloudSave() {
    if (!wallet) {
      addToast('请先登录 Web3 账号', 'warning')
      return
    }

    setCloudAction('save')
    try {
      const upload = await buildNotesBackupUpload(wallet, notes)
      const response = await fetch(NOTE_BACKUP_API_URL, {
        method: 'PUT',
        headers: upload.headers,
        body: upload.body,
      })
      if (!response.ok) {
        throw new Error(await readApiError(response, '云备份失败'))
      }
      addToast('云端备份已更新', 'success')
    } catch (err: unknown) {
      addToast(getErrorMessage(err, '云备份失败'), 'error')
    } finally {
      setCloudAction(null)
    }
  }

  async function handleCloudRestore() {
    if (!wallet) {
      addToast('请先登录 Web3 账号', 'warning')
      return
    }

    setCloudAction('restore')
    try {
      const response = await fetch(NOTE_BACKUP_API_URL, {
        method: 'GET',
        headers: await getBackupAuthHeaders(wallet, 'GET', NOTE_BACKUP_API_URL),
      })
      if (response.status === 404) {
        addToast('云端暂无备份', 'info')
        return
      }
      if (!response.ok) {
        throw new Error(await readApiError(response, '云端恢复失败'))
      }

      const encrypted = await response.text()
      const data = decryptNotesBackup(encrypted, wallet.danger)
      const cloudCid = response.headers.get('x-backup-cid') || ''
      const localCid = await calculateNoteCid(JSON.stringify({ notes }))

      if (notes.length > 0 && cloudCid && localCid !== cloudCid) {
        const confirmed = window.confirm(
          '云端备份与本地笔记不一致。恢复会覆盖本地笔记，是否继续？'
        )
        if (!confirmed) {
          addToast('已取消恢复', 'info')
          return
        }
      }

      importNotes(data.notes)
      addToast('已从云端恢复', 'success')
      router.push('/note/')
    } catch (err: unknown) {
      addToast(getErrorMessage(err, '云端恢复失败'), 'error')
    } finally {
      setCloudAction(null)
    }
  }

  const headerTitle = (
    <h2 className="header-title">{showEditor ? noteName || '新笔记' : '笔记'}</h2>
  )

  const headerRight = showEditor ? (
    <div className="note-header-actions">
      <button className="btn btn-secondary" onClick={() => router.push('/note/')}>
        <ArrowLeft size={16} />
        返回
      </button>
      {isEditing ? (
        <>
          <button className="btn btn-secondary" onClick={handleCancelEdit}>
            <X size={16} />
            取消
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSaveEditor}
            disabled={saving || !!decryptError}
          >
            <Save size={16} />
            {saving ? '保存中' : '保存'}
          </button>
        </>
      ) : (
        <button
          className="btn btn-primary"
          onClick={() => {
            setIsEditing(true)
            router.replace(selectedNote ? `/note/?cid=${selectedNote.cid}&mode=edit` : '/note/?mode=new')
          }}
          disabled={!!decryptError}
        >
          <Edit2 size={16} />
          编辑
        </button>
      )}
    </div>
  ) : (
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
  )

  return (
    <AppShell
      sidebar={() => (
        <>
          <div
            className="sidebar-header"
            onClick={() => (window.location.href = '/')}
          >
            <h1>MOST PEOPLE</h1>
          </div>
          <div className="note-sidebar">
            <button
              className="sidebar-nav-btn active"
              onClick={() => router.push('/note/')}
            >
              <NotebookPen size={16} />
              <span>笔记</span>
            </button>

            <div className="note-login-card">
              {wallet ? (
                <>
                  <div className="note-login-user">
                    <div className="note-login-avatar">
                      <KeyRound size={16} />
                    </div>
                    <div>
                      <strong>{wallet.displayName || wallet.username}</strong>
                      <span>{shortAddress(wallet.address)}</span>
                    </div>
                  </div>
                  <button className="btn btn-secondary btn-full" onClick={logoutWeb3}>
                    <LogOut size={16} />
                    退出
                  </button>
                </>
              ) : (
                <>
                  <input
                    className="input input-compact"
                    value={username}
                    onChange={event => setUsername(event.target.value)}
                    placeholder="用户名"
                  />
                  <input
                    className="input input-compact"
                    value={password}
                    onChange={event => setPassword(event.target.value)}
                    placeholder="密码"
                    type="password"
                  />
                  <button
                    className="btn btn-primary btn-full"
                    onClick={handleLogin}
                    disabled={loginLoading}
                  >
                    <KeyRound size={16} />
                    {loginLoading ? '登录中' : '登录'}
                  </button>
                </>
              )}
            </div>

            <div className="note-cloud-actions">
              <button
                className="btn btn-secondary btn-full"
                onClick={handleCloudSave}
                disabled={!wallet || cloudAction !== null}
              >
                <CloudUpload size={16} />
                {cloudAction === 'save' ? '备份中' : '云端备份'}
              </button>
              <button
                className="btn btn-secondary btn-full"
                onClick={handleCloudRestore}
                disabled={!wallet || cloudAction !== null}
              >
                <CloudDownload size={16} />
                {cloudAction === 'restore' ? '恢复中' : '云端恢复'}
              </button>
            </div>
          </div>
        </>
      )}
      headerTitle={headerTitle}
      headerRight={
        <div className="note-theme-wrap">
          {headerRight}
          <button
            className="btn btn-icon"
            onClick={() => setIsDarkMode(!isDarkMode)}
            title="切换主题"
          >
            {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      }
    >
      <main className="note-page">
        {showEditor ? (
          <section className="note-editor-shell">
            <div className="note-editor-meta">
              <input
                className="input"
                value={noteName}
                onChange={event => setNoteName(event.target.value)}
                placeholder="笔记名称"
                disabled={!isEditing}
              />
              <input
                className="input"
                value={notePath}
                onChange={event => setNotePath(event.target.value)}
                placeholder="目录路径"
                disabled={!isEditing}
              />
              <button
                className={`btn ${isSecret ? 'btn-warning' : 'btn-secondary'}`}
                onClick={() => setIsSecret(!isSecret)}
                disabled={!isEditing}
              >
                {isSecret ? <Lock size={16} /> : <Eye size={16} />}
                {isSecret ? '私密' : '公开'}
              </button>
            </div>

            {decryptError ? (
              <div className="note-empty-state">
                <Lock size={36} />
                <p>{decryptError}</p>
              </div>
            ) : (
              <div className={`note-editor-frame ${isEditing ? 'editing' : 'reading'}`}>
                <MilkdownEditor
                  ref={editorRef}
                  content={plainContent}
                  readOnly={!isEditing}
                  className="milkdown-editor"
                />
              </div>
            )}
          </section>
        ) : (
          <section className="note-list-shell">
            <div className="note-toolbar">
              <div className="note-search">
                <Search size={16} />
                <input
                  className="input input-flex"
                  value={searchQuery}
                  onChange={event => setSearchQuery(event.target.value)}
                  placeholder="搜索笔记"
                />
              </div>
              <span className="note-count">{notes.length} 篇</span>
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
                <NotebookPen size={40} />
                <p>{searchQuery ? '未找到笔记' : '还没有笔记'}</p>
              </div>
            ) : (
              <div className="note-grid">
                {explorerItems.map(item => (
                  <article key={`${item.cid}:${item.path}:${item.name}`} className="note-card">
                    <button
                      className={`note-card-main ${item.type === 'directory' ? 'folder' : ''}`}
                      onClick={() => {
                        if (item.type === 'directory') {
                          setNotesPath(
                            normalizeNotePath(
                              item.path ? `${item.path}/${item.name}` : item.name
                            )
                          )
                        } else {
                          openEditor(item)
                        }
                      }}
                    >
                      <span className="note-card-icon">
                        {item.type === 'directory' ? (
                          <Folder size={22} />
                        ) : item.isSecret ? (
                          <Lock size={22} />
                        ) : (
                          <FileText size={22} />
                        )}
                      </span>
                      <span className="note-card-name">{item.name}</span>
                      {item.type === 'file' && (
                        <span className="note-card-date">
                          {formatDate(item.updated_at)}
                        </span>
                      )}
                    </button>
                    <div className="note-card-actions">
                      {item.type === 'file' && (
                        <button
                          className="btn btn-icon"
                          onClick={() => openEditor(item, true)}
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
        )}
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
          <div className="note-rename-modal" onClick={event => event.stopPropagation()}>
            <div className="modal-header">
              <h3>重命名 / 移动</h3>
              <button className="btn btn-icon" onClick={() => setRenameTarget(null)}>
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
              <button className="btn btn-secondary" onClick={() => setRenameTarget(null)}>
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
