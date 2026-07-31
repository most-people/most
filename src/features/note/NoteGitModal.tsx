import { useEffect, useMemo, useState } from 'react'
import {
  Check,
  FileDiff,
  GitBranch,
  GitCommitHorizontal,
  History,
  Loader,
  RotateCcw,
  Settings,
  X,
} from 'lucide-react'
import { ModalOverlay } from '~/components/ui/ModalOverlay'
import { getApiErrorMessage } from '~server/src/utils/api.js'
import { useI18n } from '~/lib/i18n'
import {
  commitNoteGitChanges,
  configureNoteGitAuthor,
  getNoteGitDiff,
  getNoteGitStatus,
  initializeNoteGit,
  listNoteGitHistory,
  restoreNoteGitFile,
  type NoteGitAuthor,
  type NoteGitCommit,
  type NoteGitDiff,
  type NoteGitStatus,
} from './noteVaultApi'

type NoteGitModalProps = {
  status: NoteGitStatus | null
  defaultAuthor: NoteGitAuthor
  onClose: () => void
  onStatusChange: (status: NoteGitStatus) => void
  onFilesChanged: () => void | Promise<void>
}

type GitView = 'changes' | 'history'

function getChangeStatusKey(status: string) {
  if (status === 'added') return 'note.git.status.added' as const
  if (status === 'deleted') return 'note.git.status.deleted' as const
  return 'note.git.status.modified' as const
}

export function NoteGitModal({
  status: initialStatus,
  defaultAuthor,
  onClose,
  onStatusChange,
  onFilesChanged,
}: NoteGitModalProps) {
  const { t, formatDate } = useI18n()
  const [status, setStatus] = useState(initialStatus)
  const [view, setView] = useState<GitView>('changes')
  const [history, setHistory] = useState<NoteGitCommit[]>([])
  const [selectedDiff, setSelectedDiff] = useState<NoteGitDiff | null>(null)
  const [selectedDiffKey, setSelectedDiffKey] = useState('')
  const [commitMessage, setCommitMessage] = useState('')
  const [authorName, setAuthorName] = useState(
    initialStatus?.author?.name || defaultAuthor.name
  )
  const [authorEmail, setAuthorEmail] = useState(
    initialStatus?.author?.email || defaultAuthor.email
  )
  const [showSettings, setShowSettings] = useState(
    initialStatus?.initialized === true && !initialStatus.author
  )
  const [loading, setLoading] = useState(!initialStatus)
  const [diffLoading, setDiffLoading] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [restoreConfirmation, setRestoreConfirmation] = useState('')

  const hasChanges = Boolean(status?.changes.length)
  const canCommit =
    status?.initialized === true &&
    status.author !== null &&
    status.stagedCount === 0 &&
    hasChanges &&
    Boolean(commitMessage.trim()) &&
    !working

  const selectedHistoryVersion = useMemo(() => {
    if (!selectedDiff?.oid) return null
    const commit = history.find(item => item.oid === selectedDiff.oid)
    return commit ? { commit, key: `${commit.oid}:${selectedDiff.path}` } : null
  }, [history, selectedDiff])

  function applyStatus(nextStatus: NoteGitStatus) {
    setStatus(nextStatus)
    onStatusChange(nextStatus)
  }

  function changeView(nextView: GitView) {
    setView(nextView)
    setSelectedDiff(null)
    setSelectedDiffKey('')
    setRestoreConfirmation('')
  }

  async function loadStatus() {
    setLoading(true)
    setError('')
    try {
      const nextStatus = await getNoteGitStatus()
      applyStatus(nextStatus)
      setAuthorName(nextStatus.author?.name || defaultAuthor.name)
      setAuthorEmail(nextStatus.author?.email || defaultAuthor.email)
      setShowSettings(nextStatus.initialized && !nextStatus.author)
    } catch (err: unknown) {
      setError(await getApiErrorMessage(err, t('note.git.error.loadFailed')))
    } finally {
      setLoading(false)
    }
  }

  async function loadHistory() {
    setLoading(true)
    setError('')
    try {
      setHistory(await listNoteGitHistory())
    } catch (err: unknown) {
      setError(await getApiErrorMessage(err, t('note.git.error.loadFailed')))
    } finally {
      setLoading(false)
    }
  }

  async function loadDiff(path: string, oid = '') {
    const key = `${oid || 'working'}:${path}`
    setSelectedDiffKey(key)
    setDiffLoading(true)
    setError('')
    setRestoreConfirmation('')
    try {
      setSelectedDiff(await getNoteGitDiff(path, oid))
    } catch (err: unknown) {
      setSelectedDiff(null)
      setError(await getApiErrorMessage(err, t('note.git.error.diffFailed')))
    } finally {
      setDiffLoading(false)
    }
  }

  useEffect(() => {
    void loadStatus()
  }, [])

  useEffect(() => {
    if (view === 'history' && status?.initialized) void loadHistory()
  }, [view, status?.initialized])

  useEffect(() => {
    if (view !== 'changes' || !status?.changes.length) {
      if (view === 'changes') {
        setSelectedDiff(null)
        setSelectedDiffKey('')
      }
      return
    }
    const firstPath = status.changes[0].path
    const selectedPath = selectedDiffKey.startsWith('working:')
      ? selectedDiffKey.slice('working:'.length)
      : ''
    if (!status.changes.some(change => change.path === selectedPath)) {
      void loadDiff(firstPath)
    }
  }, [status?.changes, view])

  async function handleInitialize() {
    setWorking(true)
    setError('')
    try {
      const nextStatus = await initializeNoteGit({
        name: authorName,
        email: authorEmail,
      })
      applyStatus(nextStatus)
      setShowSettings(false)
    } catch (err: unknown) {
      setError(await getApiErrorMessage(err, t('note.git.error.initFailed')))
    } finally {
      setWorking(false)
    }
  }

  async function handleSaveAuthor() {
    setWorking(true)
    setError('')
    try {
      const author = await configureNoteGitAuthor({
        name: authorName,
        email: authorEmail,
      })
      if (status) applyStatus({ ...status, author })
      setShowSettings(false)
    } catch (err: unknown) {
      setError(await getApiErrorMessage(err, t('note.git.error.authorFailed')))
    } finally {
      setWorking(false)
    }
  }

  async function handleCommit() {
    if (!canCommit) return
    setWorking(true)
    setError('')
    try {
      const result = await commitNoteGitChanges(commitMessage.trim())
      applyStatus(result.status)
      setCommitMessage('')
      setSelectedDiff(null)
      setSelectedDiffKey('')
      await loadHistory()
    } catch (err: unknown) {
      setError(await getApiErrorMessage(err, t('note.git.error.commitFailed')))
    } finally {
      setWorking(false)
    }
  }

  async function handleRestore() {
    if (!selectedHistoryVersion) return
    if (restoreConfirmation !== selectedHistoryVersion.key) {
      setRestoreConfirmation(selectedHistoryVersion.key)
      return
    }

    setWorking(true)
    setError('')
    try {
      const result = await restoreNoteGitFile(
        selectedDiff?.path || '',
        selectedHistoryVersion.commit.oid
      )
      applyStatus(result.status)
      await onFilesChanged()
      setView('changes')
      setRestoreConfirmation('')
      await loadDiff(result.path)
    } catch (err: unknown) {
      setError(await getApiErrorMessage(err, t('note.git.error.restoreFailed')))
    } finally {
      setWorking(false)
    }
  }

  const authorForm = (
    <div className="note-git-author-form">
      <label>
        <span>{t('note.git.author.name')}</span>
        <input
          className="input"
          value={authorName}
          onChange={event => setAuthorName(event.target.value)}
          disabled={working}
        />
      </label>
      <label>
        <span>{t('note.git.author.email')}</span>
        <input
          className="input"
          type="email"
          value={authorEmail}
          onChange={event => setAuthorEmail(event.target.value)}
          disabled={working}
        />
      </label>
    </div>
  )

  return (
    <ModalOverlay
      onClose={working ? undefined : onClose}
      className="note-git-overlay"
    >
      <section
        className="note-git-modal"
        onClick={event => event.stopPropagation()}
      >
        <header className="note-git-header">
          <div>
            <h2>
              <GitBranch size={20} />
              {t('note.git.title')}
            </h2>
            {status?.initialized && (
              <p translate="no">
                {status.branch}
                {status.headOid ? ` · ${status.headOid.slice(0, 8)}` : ''}
              </p>
            )}
          </div>
          <div className="note-git-header-actions">
            {status?.initialized && (
              <button
                type="button"
                className="btn btn-icon btn-secondary"
                onClick={() => setShowSettings(value => !value)}
                title={t('note.git.settings')}
                aria-label={t('note.git.settings')}
              >
                <Settings size={17} />
              </button>
            )}
            <button
              type="button"
              className="btn btn-icon"
              onClick={onClose}
              disabled={working}
              title={t('common.close')}
              aria-label={t('common.close')}
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {error && <div className="note-git-error">{error}</div>}

        {loading && !status ? (
          <div className="ui-empty-state note-git-empty">
            <Loader size={24} className="ui-spinner" />
            <p>{t('note.loading')}</p>
          </div>
        ) : status?.initialized !== true ? (
          <div className="note-git-setup">
            <GitBranch size={32} />
            <h3>{t('note.git.setup.title')}</h3>
            <p>{t('note.git.setup.desc')}</p>
            {authorForm}
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleInitialize}
              disabled={working || !authorName.trim() || !authorEmail.trim()}
            >
              {working ? (
                <Loader size={16} className="ui-spinner" />
              ) : (
                <GitBranch size={16} />
              )}
              {t('note.git.setup.action')}
            </button>
          </div>
        ) : (
          <>
            {showSettings && (
              <div className="note-git-settings">
                {authorForm}
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleSaveAuthor}
                  disabled={
                    working || !authorName.trim() || !authorEmail.trim()
                  }
                >
                  <Check size={16} />
                  {t('note.git.author.save')}
                </button>
              </div>
            )}

            <div className="note-git-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={view === 'changes'}
                className={view === 'changes' ? 'is-active' : ''}
                onClick={() => changeView('changes')}
              >
                <FileDiff size={16} />
                {t('note.git.changes')}
                <span>{status.changes.length}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === 'history'}
                className={view === 'history' ? 'is-active' : ''}
                onClick={() => changeView('history')}
              >
                <History size={16} />
                {t('note.git.history')}
              </button>
            </div>

            {status.stagedCount > 0 && (
              <div className="note-git-warning">
                {t('note.git.stagedWarning', { count: status.stagedCount })}
              </div>
            )}

            <div className="note-git-body">
              <aside className="note-git-list">
                {view === 'changes' ? (
                  status.changes.length > 0 ? (
                    status.changes.map(change => {
                      const key = `working:${change.path}`
                      return (
                        <button
                          type="button"
                          key={change.path}
                          className={selectedDiffKey === key ? 'is-active' : ''}
                          onClick={() => loadDiff(change.path)}
                        >
                          <span translate="no">{change.path}</span>
                          <small>{t(getChangeStatusKey(change.status))}</small>
                        </button>
                      )
                    })
                  ) : (
                    <div className="note-git-list-empty">
                      <Check size={22} />
                      <span>{t('note.git.clean')}</span>
                    </div>
                  )
                ) : history.length > 0 ? (
                  history.map(commit => (
                    <div className="note-git-commit" key={commit.oid}>
                      <div className="note-git-commit-meta">
                        <strong>{commit.message}</strong>
                        <span>{formatDate(commit.timestamp)}</span>
                        <code>{commit.oid.slice(0, 8)}</code>
                      </div>
                      {commit.changes.map(change => {
                        const key = `${commit.oid}:${change.path}`
                        return (
                          <button
                            type="button"
                            key={key}
                            className={
                              selectedDiffKey === key ? 'is-active' : ''
                            }
                            onClick={() => loadDiff(change.path, commit.oid)}
                          >
                            <span translate="no">{change.path}</span>
                            <small>
                              {t(getChangeStatusKey(change.status))}
                            </small>
                          </button>
                        )
                      })}
                    </div>
                  ))
                ) : (
                  <div className="note-git-list-empty">
                    <History size={22} />
                    <span>{t('note.git.historyEmpty')}</span>
                  </div>
                )}
              </aside>

              <section
                className="note-git-diff"
                aria-label={t('note.git.diff')}
              >
                {diffLoading ? (
                  <div className="ui-empty-state note-git-empty">
                    <Loader size={22} className="ui-spinner" />
                  </div>
                ) : selectedDiff ? (
                  <>
                    <div className="note-git-diff-header">
                      <span translate="no">{selectedDiff.path}</span>
                      {selectedHistoryVersion && (
                        <button
                          type="button"
                          className={`btn btn-sm ${
                            restoreConfirmation === selectedHistoryVersion.key
                              ? 'btn-warning'
                              : 'btn-secondary'
                          }`}
                          onClick={handleRestore}
                          disabled={working}
                        >
                          <RotateCcw size={15} />
                          {restoreConfirmation === selectedHistoryVersion.key
                            ? t('note.git.restoreConfirm')
                            : t('note.git.restore')}
                        </button>
                      )}
                    </div>
                    <pre>
                      {selectedDiff.parts.map((part, index) => (
                        <span
                          key={`${index}:${part.count}`}
                          className={
                            part.added
                              ? 'is-added'
                              : part.removed
                                ? 'is-removed'
                                : ''
                          }
                        >
                          {part.value}
                        </span>
                      ))}
                    </pre>
                  </>
                ) : (
                  <div className="ui-empty-state note-git-empty">
                    <FileDiff size={24} />
                    <p>{t('note.git.diffEmpty')}</p>
                  </div>
                )}
              </section>
            </div>

            {view === 'changes' && (
              <footer className="note-git-commit-bar">
                <input
                  className="input"
                  value={commitMessage}
                  onChange={event => setCommitMessage(event.target.value)}
                  placeholder={t('note.git.commitPlaceholder')}
                  maxLength={500}
                  onKeyDown={event => {
                    if (
                      (event.metaKey || event.ctrlKey) &&
                      event.key === 'Enter'
                    ) {
                      void handleCommit()
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleCommit}
                  disabled={!canCommit}
                >
                  {working ? (
                    <Loader size={16} className="ui-spinner" />
                  ) : (
                    <GitCommitHorizontal size={16} />
                  )}
                  {t('note.git.commit')}
                </button>
              </footer>
            )}
          </>
        )}
      </section>
    </ModalOverlay>
  )
}
