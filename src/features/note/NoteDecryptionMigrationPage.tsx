import { Link } from '@tanstack/react-router'
import {
  Archive,
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  Database,
  FolderOpen,
  KeyRound,
  Loader,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AppShell from '~/components/AppShell'
import { NoteSidebar } from '~/components/NoteSidebar'
import { ConfirmModal } from '~/components/ui'
import { useIsDesktopClient } from '~/hooks'
import { useI18n } from '~/lib/i18n'
import { useAppStore, type NoteItem } from '~/stores/useAppStore'
import { useUserStore } from '~/stores/userStore'
import {
  getNoteVaultStatus,
  getNoteVaultSnapshot,
  saveNoteVaultFile,
} from './noteVaultApi'
import {
  decryptLegacyBrowserNotes,
  inspectLegacyEncryptedNote,
} from '~server/src/utils/noteMigration.js'

type MigrationSource = 'browser' | 'vault'

interface MigrationItem {
  key: string
  source: MigrationSource
  path: string
  originalContent: string
  decryptable: boolean
}

interface MigrationResult {
  saved: number
  failed: number
}

function getBrowserMigrationItems(notes: NoteItem[], danger: string) {
  return notes.flatMap<MigrationItem>(note => {
    const inspection = inspectLegacyEncryptedNote(note.content, danger)
    if (!inspection.encrypted) return []
    const path = note.path ? `${note.path}/${note.name}` : note.name
    return [
      {
        key: `browser:${note.cid}:${path}`,
        source: 'browser',
        path,
        originalContent: note.content,
        decryptable: inspection.decryptable,
      },
    ]
  })
}

export default function NoteDecryptionMigrationPage() {
  const { t } = useI18n()
  const wallet = useUserStore(state => state.wallet)
  const openLoginModal = useUserStore(state => state.openLoginModal)
  const hasBackend = useAppStore(state => state.hasBackend)
  const loadUserNotes = useAppStore(state => state.loadUserNotes)
  const replaceNotes = useAppStore(state => state.replaceNotes)
  const isDesktopClient = useIsDesktopClient()
  const scanRevision = useRef(0)
  const [items, setItems] = useState<MigrationItem[]>([])
  const [scanLoading, setScanLoading] = useState(false)
  const [working, setWorking] = useState(false)
  const [backupConfirmed, setBackupConfirmed] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [error, setError] = useState('')
  const [vaultNotice, setVaultNotice] = useState('')
  const [result, setResult] = useState<MigrationResult | null>(null)

  const browserCount = items.filter(item => item.source === 'browser').length
  const vaultCount = items.filter(item => item.source === 'vault').length
  const decryptableCount = items.filter(item => item.decryptable).length
  const failedCount = items.length - decryptableCount

  const scan = useCallback(
    async (clearResult = true) => {
      const revision = ++scanRevision.current
      if (!wallet) {
        setItems([])
        setScanLoading(false)
        return
      }

      setScanLoading(true)
      setError('')
      setVaultNotice('')
      if (clearResult) setResult(null)

      try {
        await loadUserNotes(wallet.address)
        const currentNotes = useAppStore.getState().notes
        const nextItems = getBrowserMigrationItems(currentNotes, wallet.danger)
        let nextVaultNotice = ''

        if (isDesktopClient && hasBackend === true) {
          try {
            const status = await getNoteVaultStatus()
            if (status.configured) {
              const snapshot = await getNoteVaultSnapshot()
              for (const file of snapshot.files) {
                const inspection = inspectLegacyEncryptedNote(
                  file.content,
                  wallet.danger
                )
                if (!inspection.encrypted) continue
                nextItems.push({
                  key: `vault:${file.path}`,
                  source: 'vault',
                  path: file.path,
                  originalContent: file.content,
                  decryptable: inspection.decryptable,
                })
              }
            } else {
              nextVaultNotice = t('note.migration.vaultNotConfigured')
            }
          } catch {
            nextVaultNotice = t('note.migration.vaultUnavailable')
          }
        } else if (isDesktopClient) {
          nextVaultNotice = t('note.migration.vaultUnavailable')
        }

        if (revision !== scanRevision.current) return
        setItems(nextItems)
        setVaultNotice(nextVaultNotice)
      } catch {
        if (revision !== scanRevision.current) return
        setItems([])
        setError(t('note.migration.scanFailed'))
      } finally {
        if (revision === scanRevision.current) setScanLoading(false)
      }
    },
    [hasBackend, isDesktopClient, loadUserNotes, t, wallet]
  )

  useEffect(() => {
    void scan()
  }, [scan])

  const groupedItems = useMemo(
    () =>
      [...items].sort((left, right) => {
        if (left.source !== right.source) {
          return left.source === 'browser' ? -1 : 1
        }
        return left.path.localeCompare(right.path)
      }),
    [items]
  )

  async function migrateVaultItems(danger: string) {
    let saved = 0
    let failed = items.filter(
      item => item.source === 'vault' && !item.decryptable
    ).length

    for (const item of items) {
      if (item.source !== 'vault' || !item.decryptable) continue
      try {
        const inspection = inspectLegacyEncryptedNote(
          item.originalContent,
          danger
        )
        if (!inspection.decryptable) {
          failed += 1
          continue
        }
        await saveNoteVaultFile(
          item.path,
          inspection.content,
          item.originalContent
        )
        saved += 1
      } catch {
        failed += 1
      }
    }

    return { saved, failed }
  }

  async function handleMigration() {
    if (!wallet || !backupConfirmed || decryptableCount === 0) return
    setShowConfirmation(false)
    setWorking(true)
    setError('')

    try {
      await loadUserNotes(wallet.address)
      const currentState = useAppStore.getState()
      const browserMigration = await decryptLegacyBrowserNotes(
        currentState.notes,
        wallet.danger
      )
      if (browserMigration.decryptedPaths.length > 0) {
        await replaceNotes(browserMigration.notes)
      }

      const vaultMigration = await migrateVaultItems(wallet.danger)
      setResult({
        saved: browserMigration.decryptedPaths.length + vaultMigration.saved,
        failed: browserMigration.failedPaths.length + vaultMigration.failed,
      })
      setBackupConfirmed(false)
      await scan(false)
    } catch {
      setError(t('note.migration.saveFailed'))
    } finally {
      setWorking(false)
    }
  }

  const sidebar = (
    <nav className="note-migration-nav">
      <Link to="/note/">
        <ArrowLeft size={16} />
        {t('note.migration.backToNotes')}
      </Link>
      <Link to="/profile/">
        <Archive size={16} />
        {t('note.migration.openBackup')}
      </Link>
    </nav>
  )

  return (
    <AppShell
      className="note-migration-layout"
      defaultHide
      sidebar={() => <NoteSidebar>{sidebar}</NoteSidebar>}
      headerTitle={
        <div className="note-migration-header-title">
          <KeyRound size={18} />
          <h2 className="header-title">{t('note.migration.title')}</h2>
          <span>{t('note.migration.temporary')}</span>
        </div>
      }
      headerRight={
        <Link
          className="btn btn-sm"
          to="/note/"
          title={t('note.migration.backToNotes')}
          aria-label={t('note.migration.backToNotes')}
        >
          <ArrowLeft size={16} />
          <span>{t('note.migration.backToNotes')}</span>
        </Link>
      }
    >
      <main className="note-migration-page">
        <div className="note-migration-content">
          <section className="ui-notice warning note-migration-backup">
            <ShieldAlert size={22} />
            <div>
              <h3>{t('note.migration.backupTitle')}</h3>
              <p>{t('note.migration.backupDescription')}</p>
              <Link className="btn btn-sm btn-secondary" to="/profile/">
                <Archive size={15} />
                {t('note.migration.openBackup')}
              </Link>
            </div>
          </section>

          {!wallet ? (
            <section className="note-migration-tool ui-glass-surface">
              <div className="ui-empty-state note-migration-empty">
                <KeyRound size={28} />
                <h3>{t('note.migration.loginTitle')}</h3>
                <p>{t('note.migration.loginDescription')}</p>
                <button className="btn btn-primary" onClick={openLoginModal}>
                  {t('login.preview')}
                </button>
              </div>
            </section>
          ) : (
            <section className="note-migration-tool ui-glass-surface">
              <div className="note-migration-toolbar">
                <div className="note-migration-summary">
                  <span>
                    <Database size={15} />
                    {t('note.migration.browserCount', {
                      count: browserCount,
                    })}
                  </span>
                  <span>
                    <FolderOpen size={15} />
                    {t('note.migration.vaultCount', { count: vaultCount })}
                  </span>
                  {failedCount > 0 && (
                    <span className="is-danger">
                      <CircleAlert size={15} />
                      {t('note.migration.failedCount', { count: failedCount })}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="btn btn-icon"
                  onClick={() => void scan()}
                  disabled={scanLoading || working}
                  title={t('note.migration.rescan')}
                  aria-label={t('note.migration.rescan')}
                >
                  <RefreshCw
                    size={16}
                    className={scanLoading ? 'ui-spinner' : ''}
                  />
                </button>
              </div>

              {error && <div className="ui-notice error">{error}</div>}
              {vaultNotice && (
                <div className="ui-notice note-migration-vault-notice">
                  <FolderOpen size={16} />
                  {vaultNotice}
                </div>
              )}
              {result && (
                <div
                  className={`ui-notice ${result.failed > 0 ? 'warning' : 'success'}`}
                >
                  <CheckCircle2 size={16} />
                  {t('note.migration.result', {
                    saved: result.saved,
                    failed: result.failed,
                  })}
                </div>
              )}

              <div className="note-migration-list" role="list">
                {scanLoading ? (
                  <div className="ui-empty-state note-migration-empty">
                    <Loader size={24} className="ui-spinner" />
                    <p>{t('note.migration.scanning')}</p>
                  </div>
                ) : groupedItems.length === 0 ? (
                  <div className="ui-empty-state note-migration-empty">
                    <CheckCircle2 size={28} />
                    <h3>{t('note.migration.emptyTitle')}</h3>
                    <p>{t('note.migration.emptyDescription')}</p>
                  </div>
                ) : (
                  groupedItems.map(item => (
                    <div
                      className="note-migration-row"
                      role="listitem"
                      key={item.key}
                    >
                      <span className="note-migration-source">
                        {item.source === 'browser' ? (
                          <Database size={15} />
                        ) : (
                          <FolderOpen size={15} />
                        )}
                        {item.source === 'browser'
                          ? t('note.migration.source.browser')
                          : t('note.migration.source.vault')}
                      </span>
                      <code translate="no">{item.path}</code>
                      <span
                        className={
                          item.decryptable
                            ? 'note-migration-status is-ready'
                            : 'note-migration-status is-failed'
                        }
                      >
                        {item.decryptable ? (
                          <CheckCircle2 size={15} />
                        ) : (
                          <CircleAlert size={15} />
                        )}
                        {item.decryptable
                          ? t('note.migration.status.ready')
                          : t('note.migration.status.failed')}
                      </span>
                    </div>
                  ))
                )}
              </div>

              <div className="note-migration-actions">
                <label>
                  <input
                    type="checkbox"
                    checked={backupConfirmed}
                    onChange={event => setBackupConfirmed(event.target.checked)}
                    disabled={working}
                  />
                  <span>{t('note.migration.backupConfirmed')}</span>
                </label>
                <button
                  type="button"
                  className="btn btn-warning"
                  disabled={
                    !backupConfirmed ||
                    decryptableCount === 0 ||
                    scanLoading ||
                    working
                  }
                  onClick={() => setShowConfirmation(true)}
                >
                  {working ? (
                    <Loader size={16} className="ui-spinner" />
                  ) : (
                    <KeyRound size={16} />
                  )}
                  {working
                    ? t('note.migration.saving')
                    : t('note.migration.action', {
                        count: decryptableCount,
                      })}
                </button>
              </div>
            </section>
          )}
        </div>
      </main>

      {showConfirmation && (
        <ConfirmModal
          title={t('note.migration.confirmTitle')}
          message={t('note.migration.confirmDescription', {
            count: decryptableCount,
          })}
          confirmText={t('note.migration.confirmAction')}
          onConfirm={handleMigration}
          onClose={() => setShowConfirmation(false)}
        />
      )}
    </AppShell>
  )
}
