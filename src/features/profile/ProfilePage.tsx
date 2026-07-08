import type { ChangeEvent, ReactNode, SyntheticEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  Check,
  CheckCircle2,
  CircleAlert,
  CloudDownload,
  CloudUpload,
  Download,
  ExternalLink,
  Fingerprint,
  KeyRound,
  Loader,
  LogOut,
  Save,
  ShieldCheck,
  Upload,
  User,
  WalletCards,
  X,
} from 'lucide-react'
import { CopyButton } from '~/components/CopyButton'
import { MarketingHeader } from '~/components/MarketingHeader'
import { MarketingLayout } from '~/components/MarketingLayout'
import { ConfirmModal, ModalOverlay } from '~/components/ui'
import { useAppStore } from '~/stores/useAppStore'
import { useUserStore } from '~/stores/userStore'
import { useI18n, type MessageKey } from '~/lib/i18n'
import { useAccountBackup } from '~/features/profile/useAccountBackup'
import {
  getAccountAvatarUrl,
  uploadAccountAvatar,
} from '~/lib/avatarCloudUpload.js'
import {
  AvatarUploadSizeError,
  prepareAvatarUploadFile,
} from '~/lib/avatarUpload.js'
import { api, getApiErrorMessage } from '~server/src/utils/api'
import {
  generateAvatar,
  getDefaultAvatarValue,
  isDefaultAvatarValue,
  normalizeDefaultAvatarValue,
} from '~server/src/utils/avatar.js'
import { most25519 } from '~server/src/utils/mostWallet.js'
import { getIPNS } from '~server/src/utils/mp.js'

type AvatarOption = {
  value: string
  labelKey: MessageKey
}

const profileDefaultAvatarIds = [
  'panda',
  'owl',
  'dolphin',
  'tiger',
  'turtle',
  'snow-mountain',
]

const FALLBACK_AVATAR_SRC = '/avatars/fallback-broken.svg'

type BackupConfirm = {
  title: string
  message: string
  confirmText: string
  danger?: boolean
  onConfirm: () => void | Promise<void>
  onClose?: () => void
}

const avatarOptions: AvatarOption[] = [
  {
    value: '',
    labelKey: 'profile.avatar.address',
  },
  ...profileDefaultAvatarIds.map(id => ({
    value: getDefaultAvatarValue(id),
    labelKey: `profile.avatar.${id}` as MessageKey,
  })),
]

function isSupportedAvatarValue(value: string) {
  if (isDefaultAvatarValue(value)) return true
  if (value.startsWith('/avatar/')) return true
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function handleAvatarImageError(
  event: SyntheticEvent<HTMLImageElement, Event>
) {
  const image = event.currentTarget
  if (
    image.getAttribute('src') === FALLBACK_AVATAR_SRC ||
    image.src.endsWith(FALLBACK_AVATAR_SRC)
  ) {
    return
  }
  image.src = FALLBACK_AVATAR_SRC
}

function getBackupStatusClass(status: string) {
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

export default function ProfilePage() {
  const { formatNumber, t } = useI18n()
  const addToast = useAppStore(s => s.addToast)
  const hasBackend = useAppStore(s => s.hasBackend)
  const identity = useUserStore(s => s.identity)
  const openLoginModal = useUserStore(s => s.openLoginModal)
  const setUserIdentity = useUserStore(s => s.setUserIdentity)
  const logoutUser = useUserStore(s => s.logoutUser)
  const accountBackup = useAccountBackup()
  const [displayNameDraft, setDisplayNameDraft] = useState('')
  const [avatarUrlDraft, setAvatarUrlDraft] = useState('')
  const [avatarUrlError, setAvatarUrlError] = useState('')
  const [avatarUploadFile, setAvatarUploadFile] = useState<File | null>(null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [backupConfirm, setBackupConfirm] = useState<BackupConfirm | null>(null)
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null)
  const header = <MarketingHeader />

  useEffect(() => {
    if (!identity) {
      setDisplayNameDraft('')
      setAvatarUrlDraft('')
      setAvatarUrlError('')
      setAvatarUploadFile(null)
      if (avatarFileInputRef.current) avatarFileInputRef.current.value = ''
      return
    }
    setDisplayNameDraft(identity.displayName || identity.username)
    setAvatarUrlDraft(
      normalizeDefaultAvatarValue(identity.avatar) || identity.avatar || ''
    )
    setAvatarUrlError('')
  }, [identity])

  useEffect(() => {
    if (!identity) return
    void accountBackup.refreshBackupSummary()
  }, [accountBackup.refreshBackupSummary, hasBackend, identity])

  const keys = useMemo(() => {
    if (!identity) return null
    return most25519(identity.danger)
  }, [identity])

  const ipns = useMemo(() => {
    if (!keys) return ''
    return getIPNS(keys.private_key, keys.ed_public_key)
  }, [keys])

  if (!identity) {
    return (
      <MarketingLayout header={header}>
        <section className="profile-page">
          <div className="profile-container narrow">
            <div className="profile-empty glass">
              <div className="profile-empty-icon">
                <User size={34} />
              </div>
              <h1>{t('profile.signedOut.title')}</h1>
              <p>{t('profile.signedOut.desc')}</p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={openLoginModal}
              >
                <User size={16} />
                {t('account.signIn')}
              </button>
            </div>
          </div>
        </section>
      </MarketingLayout>
    )
  }

  const activeAvatar =
    normalizeDefaultAvatarValue(identity.avatar) || identity.avatar || ''
  const address = identity.address.toLowerCase()
  const customAvatarValue =
    activeAvatar && !isDefaultAvatarValue(activeAvatar)
      ? activeAvatar
      : getAccountAvatarUrl(identity.address)
  const customAvatarOption = {
    value: customAvatarValue,
    labelKey: 'profile.avatar.custom' as MessageKey,
  }
  const displayedAvatarOptions = [
    avatarOptions[0],
    customAvatarOption,
    ...avatarOptions.slice(1),
  ]
  const avatarSrc = generateAvatar(identity.address, identity.avatar)
  const canSaveAvatarUrl = avatarUrlDraft.trim().length > 0
  const canUploadAvatar = Boolean(avatarUploadFile) && !avatarUploading
  const backupStatusClass = getBackupStatusClass(accountBackup.status)
  const cloudBackupWorking = accountBackup.action === 'backup'
  const cloudRestoreWorking = accountBackup.action === 'restore'
  const exportWorking = accountBackup.action === 'export'
  const importWorking = accountBackup.action === 'import'
  const backupSummaryItems = [
    {
      key: 'notes',
      label: t('profile.backup.summary.notes'),
      value: accountBackup.notesCount,
    },
    {
      key: 'files',
      label: t('profile.backup.summary.files'),
      value: accountBackup.backupSummary.filesCount,
    },
    {
      key: 'trash',
      label: t('profile.backup.summary.trash'),
      value: accountBackup.backupSummary.trashFilesCount,
    },
    {
      key: 'channels',
      label: t('profile.backup.summary.channels'),
      value: accountBackup.backupSummary.channelsCount,
    },
  ]

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

  const backupActions = [
    {
      key: 'cloud-backup',
      tone: 'cloud-backup',
      label: cloudBackupWorking
        ? t('profile.backup.status.backingUp')
        : t('profile.backup.action.cloudBackup'),
      icon: cloudBackupWorking ? (
        <Loader size={16} className="ui-spinner" />
      ) : (
        <CloudUpload size={16} />
      ),
      onClick: openCloudBackupConfirm,
    },
    {
      key: 'cloud-restore',
      tone: 'cloud-restore',
      label: cloudRestoreWorking
        ? t('profile.backup.status.restoring')
        : t('profile.backup.action.cloudRestore'),
      icon: cloudRestoreWorking ? (
        <Loader size={16} className="ui-spinner" />
      ) : (
        <CloudDownload size={16} />
      ),
      onClick: openCloudRestoreConfirm,
    },
    {
      key: 'export-local',
      tone: 'export-local',
      label: exportWorking
        ? t('profile.backup.status.exporting')
        : t('profile.backup.action.exportLocal'),
      icon: exportWorking ? (
        <Loader size={16} className="ui-spinner" />
      ) : (
        <Download size={16} />
      ),
      onClick: accountBackup.exportLocalBackup,
    },
    {
      key: 'import-local',
      tone: 'import-local',
      label: importWorking
        ? t('profile.backup.status.importing')
        : t('profile.backup.action.importLocal'),
      icon: importWorking ? (
        <Loader size={16} className="ui-spinner" />
      ) : (
        <Upload size={16} />
      ),
      onClick: handleImportLocalBackup,
    },
  ]
  const backupActionGroups = [
    {
      key: 'cloud',
      label: t('profile.backup.group.cloud'),
      actions: backupActions.slice(0, 2),
    },
    {
      key: 'local',
      label: t('profile.backup.group.local'),
      actions: backupActions.slice(2),
    },
  ]

  async function saveBackendProfile(nextIdentity) {
    if (hasBackend !== true) return
    try {
      await api
        .put('/api/user/profile', {
          json: {
            displayName: nextIdentity.displayName || nextIdentity.username,
            avatar: nextIdentity.avatar || '',
            updatedAt: nextIdentity.profileUpdatedAt || Date.now(),
          },
        })
        .json()
    } catch (err) {
      addToast(
        await getApiErrorMessage(
          err,
          t('profile.backup.error.profileSaveFailed')
        ),
        'error'
      )
    }
  }

  function updateAvatar(nextAvatar?: string) {
    if (!identity) return
    const nextIdentity = {
      ...identity,
      avatar: nextAvatar || undefined,
      profileUpdatedAt: Date.now(),
    }
    setUserIdentity(nextIdentity)
    void saveBackendProfile(nextIdentity)
    setAvatarUrlError('')
    addToast(t('profile.toast.avatarUpdated'), 'success')
  }

  function handleSaveDisplayName() {
    if (!identity) return
    const displayName = displayNameDraft.trim() || identity.username
    const nextIdentity = {
      ...identity,
      displayName,
      profileUpdatedAt: Date.now(),
    }
    setUserIdentity(nextIdentity)
    void saveBackendProfile(nextIdentity)
    setDisplayNameDraft(displayName)
    addToast(t('profile.toast.saved'), 'success')
  }

  function handleSaveAvatarUrl() {
    const nextUrl = avatarUrlDraft.trim()
    if (!nextUrl) {
      updateAvatar(undefined)
      return
    }
    if (!isSupportedAvatarValue(nextUrl)) {
      setAvatarUrlError(t('nav.avatarUrlInvalid'))
      return
    }
    updateAvatar(nextUrl)
  }

  function handleAvatarFileChange(event: ChangeEvent<HTMLInputElement>) {
    setAvatarUploadFile(event.target.files?.[0] || null)
    setAvatarUrlError('')
  }

  async function handleUploadAvatar() {
    if (!avatarUploadFile) return
    setAvatarUploading(true)
    setAvatarUrlError('')
    try {
      const prepared = await prepareAvatarUploadFile(avatarUploadFile)
      const data = await uploadAccountAvatar(identity, prepared.file)
      setAvatarUrlDraft(data.url)
      updateAvatar(data.url)
      setAvatarUploadFile(null)
      if (avatarFileInputRef.current) avatarFileInputRef.current.value = ''
    } catch (err) {
      if (err instanceof AvatarUploadSizeError) {
        addToast(t('profile.avatar.tooLarge'), 'error')
        return
      }
      if (err?.code === 'AVATAR_COMPRESSION_FAILED') {
        addToast(t('profile.avatar.compressionFailed'), 'error')
        return
      }
      const message = await getApiErrorMessage(
        err,
        t('profile.avatar.uploadFailed')
      )
      addToast(message, 'error')
    } finally {
      setAvatarUploading(false)
    }
  }

  function handleLogout() {
    logoutUser()
    setShowLogoutConfirm(false)
  }

  return (
    <MarketingLayout header={header}>
      <section className="profile-page">
        <div className="profile-container">
          <section className="profile-panel profile-backup-card">
            <div className="profile-panel-header profile-backup-header">
              <div>
                <h2>{t('profile.section.backup')}</h2>
                <p>{t('profile.section.backup.desc')}</p>
              </div>
              <span className={`profile-backup-status ${backupStatusClass}`}>
                <AccountBackupStatusIcon
                  status={accountBackup.status}
                  busy={accountBackup.busy}
                />
                {accountBackup.statusLabel}
              </span>
            </div>
            <div
              className="profile-backup-summary"
              aria-label={t('profile.backup.summary.label')}
            >
              {backupSummaryItems.map(item => (
                <div key={item.key} className="profile-backup-stat">
                  <span className="profile-backup-stat-value">
                    {item.value === null
                      ? accountBackup.backupSummary.loading
                        ? '...'
                        : '-'
                      : formatNumber(item.value)}
                  </span>
                  <span className="profile-backup-stat-label">{item.label}</span>
                </div>
              ))}
            </div>
            <div className="profile-backup-actions">
              {backupActionGroups.map(group => (
                <section
                  key={group.key}
                  className="profile-backup-action-group"
                  aria-label={group.label}
                >
                  <h3 className="profile-backup-action-group-title">
                    {group.label}
                  </h3>
                  <div className="profile-backup-action-list">
                    {group.actions.map(action => (
                      <button
                        key={action.key}
                        type="button"
                        className={[
                          'btn',
                          'profile-backup-action',
                          `is-${action.tone}`,
                        ].join(' ')}
                        disabled={accountBackup.busy}
                        onClick={action.onClick}
                      >
                        {action.icon}
                        {action.label}
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </section>

          <header className="profile-header">
            <img
              className="profile-avatar-large"
              src={avatarSrc}
              alt=""
              referrerPolicy="no-referrer"
              onError={handleAvatarImageError}
            />
            <div className="profile-heading">
              <p className="profile-kicker">{t('profile.kicker')}</p>
              <h1>{identity.displayName || identity.username}</h1>
              <div className="profile-address-line">
                <code translate="no">{address}</code>
                <CopyButton text={address} />
                <a
                  href={`https://debank.com/profile/${identity.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary btn-sm"
                >
                  <ExternalLink size={14} />
                  {t('web3.action.view')}
                </a>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-secondary profile-logout-btn"
              onClick={() => setShowLogoutConfirm(true)}
            >
              <LogOut size={16} />
              {t('account.logout')}
            </button>
          </header>

          <div className="profile-grid">
            <section className="profile-panel">
              <div className="profile-panel-header">
                <div>
                  <h2>{t('profile.section.account')}</h2>
                  <p>{t('profile.section.account.desc')}</p>
                </div>
              </div>
              <label className="profile-field">
                <span>{t('profile.label.displayName')}</span>
                <div className="profile-field-row">
                  <input
                    className="input"
                    value={displayNameDraft}
                    onChange={event => setDisplayNameDraft(event.target.value)}
                    placeholder={t('nav.displayNamePlaceholder')}
                  />
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleSaveDisplayName}
                  >
                    <Save size={16} />
                    {t('profile.action.save')}
                  </button>
                </div>
              </label>
              <div className="profile-facts">
                <ProfileFact
                  label={t('profile.label.username')}
                  value={identity.username}
                />
              </div>
            </section>

            <section className="profile-panel">
              <div className="profile-panel-header">
                <div>
                  <h2>{t('profile.section.avatar')}</h2>
                  <p>{t('profile.section.avatar.desc')}</p>
                </div>
              </div>
              <div className="profile-avatar-grid" role="list">
                {displayedAvatarOptions.map(option => {
                  const selected = activeAvatar === option.value
                  return (
                    <button
                      key={option.value || 'address'}
                      type="button"
                      className={[
                        'profile-avatar-option',
                        selected ? 'selected' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => updateAvatar(option.value)}
                      aria-pressed={selected}
                      title={t(option.labelKey)}
                    >
                      <img
                        src={generateAvatar(identity.address, option.value)}
                        alt=""
                        referrerPolicy="no-referrer"
                        onError={handleAvatarImageError}
                      />
                      <span>{t(option.labelKey)}</span>
                      {selected && (
                        <span className="profile-avatar-check">
                          <Check size={14} />
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
              <div className="profile-avatar-url">
                <label className="profile-field" htmlFor="profile-avatar-url">
                  <span>{t('profile.label.customAvatar')}</span>
                  <div className="profile-field-row">
                    <input
                      id="profile-avatar-url"
                      className="input"
                      value={avatarUrlDraft}
                      onChange={event => {
                        setAvatarUrlDraft(event.target.value)
                        setAvatarUrlError('')
                      }}
                      placeholder={t('nav.avatarUrlPlaceholder')}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleSaveAvatarUrl}
                      disabled={!canSaveAvatarUrl}
                    >
                      <Save size={16} />
                      {t('profile.action.save')}
                    </button>
                  </div>
                </label>
                {avatarUrlError && (
                  <p className="profile-error">{avatarUrlError}</p>
                )}
                <div className="profile-field">
                  <span>{t('profile.label.uploadAvatar')}</span>
                  <div className="profile-field-row">
                    <label
                      className="profile-avatar-file-control"
                      htmlFor="profile-avatar-file"
                    >
                      <input
                        id="profile-avatar-file"
                        ref={avatarFileInputRef}
                        className="profile-avatar-file-input"
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                        onChange={handleAvatarFileChange}
                      />
                      <Upload size={16} />
                      <span className="profile-avatar-file-name">
                        {avatarUploadFile?.name ||
                          t('profile.action.chooseAvatar')}
                      </span>
                    </label>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleUploadAvatar}
                      disabled={!canUploadAvatar}
                    >
                      {avatarUploading && (
                        <Loader size={16} className="ui-spinner" />
                      )}
                      {avatarUploading
                        ? t('profile.action.uploadingAvatar')
                        : t('profile.action.uploadAvatar')}
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <section className="profile-panel profile-identity-panel">
            <div className="profile-panel-header">
              <div>
                <h2>{t('profile.section.identity')}</h2>
                <p>{t('profile.section.identity.desc')}</p>
              </div>
              <Link to="/web3/" hash="wallet" className="btn btn-secondary">
                <WalletCards size={16} />
                {t('profile.action.openWallet')}
              </Link>
            </div>
            <div className="profile-key-grid">
              {keys && (
                <>
                  <ProfileKeyCard
                    title={t('web3.label.ed25519Public')}
                    icon={<Fingerprint size={18} />}
                    value={keys.ed_public_key}
                  />
                  <ProfileKeyCard
                    title={t('web3.label.x25519Public')}
                    icon={<KeyRound size={18} />}
                    value={keys.public_key}
                  />
                </>
              )}
              <ProfileKeyCard
                title="IPNS ID"
                icon={<ShieldCheck size={18} />}
                value={ipns || '-'}
              />
            </div>
          </section>
        </div>
      </section>
      {backupConfirm && (
        <ConfirmModal
          title={backupConfirm.title}
          message={backupConfirm.message}
          confirmText={backupConfirm.confirmText}
          danger={backupConfirm.danger}
          onConfirm={backupConfirm.onConfirm}
          onClose={backupConfirm.onClose || (() => setBackupConfirm(null))}
        />
      )}
      {showLogoutConfirm && (
        <ModalOverlay
          className="profile-logout-overlay"
          onClose={() => setShowLogoutConfirm(false)}
        >
          <div
            className="confirm-modal profile-logout-modal"
            onClick={event => event.stopPropagation()}
          >
            <div className="modal-header">
              <h3>{t('account.logoutTitle')}</h3>
              <button
                type="button"
                className="btn btn-icon"
                onClick={() => setShowLogoutConfirm(false)}
                aria-label={t('common.close')}
              >
                <X size={18} />
              </button>
            </div>
            <p className="profile-logout-reminder">
              {t('profile.logout.backupReminder')}
            </p>
            <div className="profile-logout-backup-actions">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={accountBackup.busy}
                onClick={() => void accountBackup.backupToCloud()}
              >
                {t('profile.backup.action.cloudBackup')}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={accountBackup.busy}
                onClick={() => void accountBackup.exportLocalBackup()}
              >
                {t('profile.backup.action.exportLocal')}
              </button>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowLogoutConfirm(false)}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleLogout}
              >
                {t('account.logout')}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </MarketingLayout>
  )
}

function ProfileFact({
  label,
  value,
  copy = false,
}: {
  label: string
  value: string
  copy?: boolean
}) {
  return (
    <div className="profile-fact">
      <span>{label}</span>
      <div className="profile-fact-value">
        <code translate="no">{value}</code>
        {copy && <CopyButton text={value} />}
      </div>
    </div>
  )
}

function ProfileKeyCard({
  title,
  icon,
  value,
}: {
  title: string
  icon: ReactNode
  value: string
}) {
  return (
    <div className="profile-key-card">
      <div className="profile-key-card-header">
        <span className="profile-key-card-icon">{icon}</span>
        <span>{title}</span>
      </div>
      <div className="mono-row">
        <code className="mono" translate="no">
          {value}
        </code>
        <CopyButton text={value} />
      </div>
    </div>
  )
}
