import { useState } from 'react'
import {
  CheckCircle2,
  CircleAlert,
  CloudDownload,
  CloudUpload,
  Download,
  Loader,
  ShieldCheck,
  Upload,
} from 'lucide-react'
import { ActionMenu, ConfirmModal, type ActionMenuItem } from '~/components/ui'
import { useI18n } from '~/lib/i18n'
import { useAccountBackup } from '~/features/profile/useAccountBackup'

type BackupConfirm = {
  title: string
  message: string
  confirmText: string
  danger?: boolean
  onConfirm: () => void | Promise<void>
  onClose?: () => void
}

function getStatusClass(status: string) {
  if (status === 'disabled') return 'is-disabled'
  if (status === 'working') return 'is-working'
  if (status === 'synced') return 'is-synced'
  if (status === 'error') return 'is-error'
  return 'is-idle'
}

function AccountBackupStatusIcon({
  status,
  busy,
}: {
  status: string
  busy: boolean
}) {
  if (busy || status === 'working') {
    return <Loader size={16} className="ui-spinner" />
  }
  if (status === 'synced') return <CheckCircle2 size={16} />
  if (status === 'error') return <CircleAlert size={16} />
  return <ShieldCheck size={16} />
}

function useAccountBackupControls() {
  const { t } = useI18n()
  const accountBackup = useAccountBackup()
  const [backupConfirm, setBackupConfirm] = useState<BackupConfirm | null>(null)

  function openCloudBackupConfirm() {
    setBackupConfirm({
      title: t('profile.backup.confirm.backupTitle'),
      message: t('profile.backup.confirm.backupMessage'),
      confirmText: t('profile.backup.action.cloudBackup'),
      onConfirm: async () => {
        setBackupConfirm(null)
        await accountBackup.backupToCloud()
      },
    })
  }

  function openCloudRestoreConfirm() {
    setBackupConfirm({
      title: t('profile.backup.confirm.restoreTitle'),
      message: t('profile.backup.confirm.restoreMessage'),
      confirmText: t('profile.backup.action.cloudRestore'),
      onConfirm: async () => {
        setBackupConfirm(null)
        await accountBackup.restoreFromCloud({ confirm: false })
      },
    })
  }

  function requestImportBackupConfirm() {
    return new Promise<boolean>(resolve => {
      const close = (confirmed: boolean) => {
        setBackupConfirm(null)
        resolve(confirmed)
      }
      setBackupConfirm({
        title: t('profile.backup.confirm.importTitle'),
        message: t('profile.backup.confirm.restore'),
        confirmText: t('profile.backup.action.importLocal'),
        onConfirm: () => close(true),
        onClose: () => close(false),
      })
    })
  }

  function handleImportLocalBackup() {
    accountBackup.importLocalBackup({
      requestConfirm: requestImportBackupConfirm,
    })
  }

  const confirmModal = backupConfirm ? (
    <ConfirmModal
      title={backupConfirm.title}
      message={backupConfirm.message}
      confirmText={backupConfirm.confirmText}
      danger={backupConfirm.danger}
      onConfirm={backupConfirm.onConfirm}
      onClose={backupConfirm.onClose || (() => setBackupConfirm(null))}
    />
  ) : null

  return {
    accountBackup,
    confirmModal,
    cloudBackupWorking: accountBackup.action === 'backup',
    cloudRestoreWorking: accountBackup.action === 'restore',
    exportWorking: accountBackup.action === 'export',
    importWorking: accountBackup.action === 'import',
    openCloudBackupConfirm,
    openCloudRestoreConfirm,
    handleImportLocalBackup,
  }
}

export function AccountBackupPanel() {
  const { t } = useI18n()
  const {
    accountBackup,
    confirmModal,
    cloudBackupWorking,
    cloudRestoreWorking,
    exportWorking,
    importWorking,
    openCloudBackupConfirm,
    openCloudRestoreConfirm,
    handleImportLocalBackup,
  } = useAccountBackupControls()
  const statusClass = getStatusClass(accountBackup.status)

  return (
    <>
      <section className="profile-panel profile-backup-panel">
        <div className="profile-panel-header">
          <div>
            <h2>{t('profile.section.backup')}</h2>
            <p>{t('profile.section.backup.desc')}</p>
          </div>
          <span className={`account-backup-status ${statusClass}`}>
            <span className={`account-backup-status-dot ${statusClass}`} />
            {accountBackup.statusLabel}
          </span>
        </div>
        <div className="profile-backup-actions">
          <button
            type="button"
            className={`btn btn-secondary ${exportWorking ? 'btn-loading' : ''}`}
            onClick={accountBackup.exportLocalBackup}
            disabled={accountBackup.busy}
          >
            {exportWorking ? (
              <Loader size={16} className="ui-spinner" />
            ) : (
              <Download size={16} />
            )}
            {exportWorking
              ? t('profile.backup.status.exporting')
              : t('profile.backup.action.exportLocal')}
          </button>
          <button
            type="button"
            className={`btn btn-secondary ${importWorking ? 'btn-loading' : ''}`}
            onClick={handleImportLocalBackup}
            disabled={accountBackup.busy}
          >
            {importWorking ? (
              <Loader size={16} className="ui-spinner" />
            ) : (
              <Upload size={16} />
            )}
            {importWorking
              ? t('profile.backup.status.importing')
              : t('profile.backup.action.importLocal')}
          </button>

          <button
            type="button"
            className={`btn btn-primary ${cloudBackupWorking ? 'btn-loading' : ''}`}
            onClick={openCloudBackupConfirm}
            disabled={accountBackup.busy}
          >
            {cloudBackupWorking ? (
              <Loader size={16} className="ui-spinner" />
            ) : (
              <CloudUpload size={16} />
            )}
            {cloudBackupWorking
              ? t('profile.backup.status.backingUp')
              : t('profile.backup.action.cloudBackup')}
          </button>
          <button
            type="button"
            className={`btn btn-secondary ${cloudRestoreWorking ? 'btn-loading' : ''}`}
            onClick={openCloudRestoreConfirm}
            disabled={accountBackup.busy}
          >
            {cloudRestoreWorking ? (
              <Loader size={16} className="ui-spinner" />
            ) : (
              <CloudDownload size={16} />
            )}
            {cloudRestoreWorking
              ? t('profile.backup.status.restoring')
              : t('profile.backup.action.cloudRestore')}
          </button>
        </div>
      </section>
      {confirmModal}
    </>
  )
}

export function AccountBackupMenuButton() {
  const { t } = useI18n()
  const {
    accountBackup,
    confirmModal,
    cloudBackupWorking,
    cloudRestoreWorking,
    exportWorking,
    importWorking,
    openCloudBackupConfirm,
    openCloudRestoreConfirm,
    handleImportLocalBackup,
  } = useAccountBackupControls()
  const statusClass = getStatusClass(accountBackup.status)
  const items: ActionMenuItem[] = [
    {
      key: 'status',
      label: (
        <span className={`account-backup-menu-status ${statusClass}`}>
          {accountBackup.statusLabel}
        </span>
      ),
      description: t('profile.section.backup.desc'),
      icon: (
        <AccountBackupStatusIcon
          status={accountBackup.status}
          busy={accountBackup.busy}
        />
      ),
      disabled: true,
      onSelect: () => {},
    },
    {
      key: 'cloud-backup',
      label: cloudBackupWorking
        ? t('profile.backup.status.backingUp')
        : t('profile.backup.action.cloudBackup'),
      icon: cloudBackupWorking ? (
        <Loader size={16} className="ui-spinner" />
      ) : (
        <CloudUpload size={16} />
      ),
      disabled: accountBackup.busy,
      onSelect: openCloudBackupConfirm,
    },
    {
      key: 'cloud-restore',
      label: cloudRestoreWorking
        ? t('profile.backup.status.restoring')
        : t('profile.backup.action.cloudRestore'),
      icon: cloudRestoreWorking ? (
        <Loader size={16} className="ui-spinner" />
      ) : (
        <CloudDownload size={16} />
      ),
      disabled: accountBackup.busy,
      onSelect: openCloudRestoreConfirm,
    },
    {
      key: 'export-local',
      label: exportWorking
        ? t('profile.backup.status.exporting')
        : t('profile.backup.action.exportLocal'),
      icon: exportWorking ? (
        <Loader size={16} className="ui-spinner" />
      ) : (
        <Download size={16} />
      ),
      disabled: accountBackup.busy,
      onSelect: accountBackup.exportLocalBackup,
    },
    {
      key: 'import-local',
      label: importWorking
        ? t('profile.backup.status.importing')
        : t('profile.backup.action.importLocal'),
      icon: importWorking ? (
        <Loader size={16} className="ui-spinner" />
      ) : (
        <Upload size={16} />
      ),
      disabled: accountBackup.busy,
      onSelect: handleImportLocalBackup,
    },
  ]

  return (
    <>
      <ActionMenu
        ariaLabel={t('profile.section.backup')}
        items={items}
        menuClassName="account-backup-menu"
        renderTrigger={triggerProps => (
          <button
            {...triggerProps}
            className={`btn btn-icon account-backup-trigger ${statusClass}`}
            title={`${t('profile.section.backup')} · ${accountBackup.statusLabel}`}
            aria-label={`${t('profile.section.backup')} · ${accountBackup.statusLabel}`}
          >
            {accountBackup.busy ? (
              <Loader size={16} className="ui-spinner" />
            ) : (
              <ShieldCheck size={16} />
            )}
            <span className={`account-backup-status-dot ${statusClass}`} />
          </button>
        )}
      />
      {confirmModal}
    </>
  )
}
