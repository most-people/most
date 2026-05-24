'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Eye, Lock, NotebookPen, Save, X } from 'lucide-react'
import AppShell from '~/components/AppShell'
import { useAppStore } from '~/app/app/useAppStore'
import { useUserStore } from '~/app/app/userStore'
import type { MilkdownEditorRef } from '~/components/MilkdownEditor'
import { mostDecode, mostEncode } from '~/server/src/utils/mostWallet.js'
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

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function NoteEditPageContent() {
  const router = useRouter()
  const params = useSearchParams()
  const editorRef = useRef<MilkdownEditorRef>(null)
  const backupSync = useNoteBackupSync()

  const addToast = useAppStore(s => s.addToast)
  const notes = useAppStore(s => s.notes)
  const saveNote = useAppStore(s => s.saveNote)
  const localDataReady = useAppStore(s => s.localDataReady)
  const wallet = useUserStore(s => s.wallet)
  const openLoginModal = useUserStore(s => s.openLoginModal)

  const cid = params.get('cid') || ''
  const selectedNote = notes.find(note => note.cid === cid)

  const [noteName, setNoteName] = useState('')
  const [notePath, setNotePath] = useState('')
  const [plainContent, setPlainContent] = useState('')
  const [isSecret, setIsSecret] = useState(false)
  const [decryptError, setDecryptError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!cid) {
      setNoteName('')
      setNotePath('')
      setPlainContent('')
      setIsSecret(false)
      setDecryptError(localDataReady ? '笔记不存在' : '')
      return
    }

    if (!selectedNote) {
      setNoteName('')
      setNotePath('')
      setPlainContent('')
      setIsSecret(false)
      setDecryptError(localDataReady ? '笔记不存在' : '')
      return
    }

    setNoteName(selectedNote.name)
    setNotePath(selectedNote.path || '')
    setIsSecret(
      selectedNote.isSecret === true ||
        selectedNote.content.startsWith('mp://1')
    )

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
  }, [cid, localDataReady, selectedNote, wallet])

  function requireWallet() {
    if (wallet) return true
    addToast('请先登录 Web3 账号', 'warning')
    openLoginModal()
    return false
  }

  function closeEditor() {
    router.push(selectedNote ? `/note/?cid=${encodeURIComponent(selectedNote.cid)}` : '/note/')
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
      const storedContent = isSecret
        ? mostEncode(markdown, wallet.danger)
        : markdown
      const nextCid = await saveNote({
        cid: selectedNote.cid,
        name: noteName,
        path: notePath,
        content: storedContent,
        isSecret,
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

  const headerTitle = (
    <div className="note-header-title">
      <h2 className="header-title">编辑笔记</h2>
      <span>{selectedNote?.name || '未命名笔记'}</span>
    </div>
  )

  const headerRight = (
    <div className="note-theme-wrap">
      <div className="note-header-actions">
        <button className="btn btn-secondary" onClick={closeEditor}>
          <X size={16} />
          取消
        </button>
        <button
          className="btn btn-primary"
          onClick={handleSaveEditor}
          disabled={saving || !!decryptError || !selectedNote}
        >
          <Save size={16} />
          {saving ? '保存中' : '保存'}
        </button>
      </div>
      <NoteMoreMenu sync={backupSync} />
    </div>
  )

  return (
    <AppShell
      sidebar={() => <NoteSidebar />}
      headerTitle={headerTitle}
      headerRight={headerRight}
    >
      <main className="note-page note-edit-page">
        <section className="note-edit-workspace">
          <section className="note-editor-panel note-editor-panel-standalone">
            <div className="note-editor-panel-header">
              <div className="note-editor-title-area">
                <span className="note-kicker">编辑模式</span>
                <input
                  className="note-title-input"
                  value={noteName}
                  onChange={event => setNoteName(event.target.value)}
                  placeholder="笔记名称"
                  disabled={!selectedNote}
                />
              </div>

              <div className="note-editor-actions">
                <button className="btn btn-secondary" onClick={closeEditor}>
                  <ArrowLeft size={16} />
                  返回
                </button>
              </div>
            </div>

            <div className="note-editor-fields">
              <input
                className="input"
                value={notePath}
                onChange={event => setNotePath(event.target.value)}
                placeholder="目录路径"
                disabled={!selectedNote}
              />
              <button
                className={`btn ${isSecret ? 'btn-warning' : 'btn-secondary'}`}
                onClick={() => setIsSecret(!isSecret)}
                disabled={!selectedNote}
              >
                {isSecret ? <Lock size={16} /> : <Eye size={16} />}
                {isSecret ? '私密' : '公开'}
              </button>
            </div>

            {decryptError ? (
              <div className="note-empty-state editor-error">
                <Lock size={36} />
                <p>{decryptError}</p>
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
            )}
          </section>
        </section>
      </main>
    </AppShell>
  )
}

export default function NoteEditPage() {
  return (
    <Suspense fallback={<div className="note-editor-loading">加载中...</div>}>
      <NoteEditPageContent />
    </Suspense>
  )
}
