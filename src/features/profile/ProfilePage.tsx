import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  Check,
  CheckCircle2,
  CircleAlert,
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
import { SafeImage } from '~/components/SafeImage'
import { ConfirmModal, ModalOverlay } from '~/components/ui'
import { useAppStore } from '~/stores/useAppStore'
import { useUserStore } from '~/stores/userStore'
import { useI18n, type MessageKey } from '~/lib/i18n'
import {
  normalizeLocalizedTag,
  selectExactLocalizedTag,
  selectLocalizedTag,
} from '~/lib/localizedTag'
import { useAccountBackup } from '~/features/profile/useAccountBackup'
import { ProfileAppearanceSettings } from '~/features/profile/ProfileAppearanceSettings'
import { api, getApiErrorMessage } from '~server/src/utils/api'
import {
  generateAvatar,
  getDefaultAvatarValue,
  isDefaultAvatarValue,
  normalizeDefaultAvatarValue,
} from '~server/src/utils/avatar.js'
import { most25519 } from '~server/src/utils/mostWallet.js'

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
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
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
  const { formatNumber, locale, localeName, t } = useI18n()
  const addToast = useAppStore(s => s.addToast)
  const hasBackend = useAppStore(s => s.hasBackend)
  const identity = useUserStore(s => s.identity)
  const openLoginModal = useUserStore(s => s.openLoginModal)
  const setUserIdentity = useUserStore(s => s.setUserIdentity)
  const logoutUser = useUserStore(s => s.logoutUser)
  const accountBackup = useAccountBackup()
  const [displayNameDraft, setDisplayNameDraft] = useState('')
  const [tagDraft, setTagDraft] = useState('')
  const [tagError, setTagError] = useState('')
  const [avatarUrlDraft, setAvatarUrlDraft] = useState('')
  const [avatarUrlError, setAvatarUrlError] = useState('')
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [backupConfirm, setBackupConfirm] = useState<BackupConfirm | null>(null)
  const header = <MarketingHeader />

  useEffect(() => {
    if (!identity) {
      setDisplayNameDraft('')
      setAvatarUrlDraft('')
      setAvatarUrlError('')
      return
    }
    setDisplayNameDraft(identity.displayName || identity.username)
    setAvatarUrlDraft(
      normalizeDefaultAvatarValue(identity.avatar) || identity.avatar || ''
    )
    setAvatarUrlError('')
  }, [identity])

  useEffect(() => {
    setTagDraft(selectExactLocalizedTag(identity?.tag, locale))
    setTagError('')
  }, [identity?.tag, locale])

  useEffect(() => {
    if (!identity) return
    void accountBackup.refreshBackupSummary()
  }, [accountBackup.refreshBackupSummary, hasBackend, identity])

  const keys = useMemo(() => {
    if (!identity) return null
    return most25519(identity.danger)
  }, [identity])

  if (!identity) {
    return (
      <MarketingLayout header={header}>
        <section className="profile-page">
          <div className="profile-container">
            <div className="profile-empty profile-signed-out-card ui-glass-surface">
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
            <ProfileAppearanceSettings />
          </div>
        </section>
      </MarketingLayout>
    )
  }

  const activeAvatar =
    normalizeDefaultAvatarValue(identity.avatar) || identity.avatar || ''
  const address = identity.address.toLowerCase()
  const customAvatarValue =
    activeAvatar && !isDefaultAvatarValue(activeAvatar) ? activeAvatar : ''
  const customAvatarOption = {
    value: customAvatarValue,
    labelKey: 'profile.avatar.custom' as MessageKey,
  }
  const displayedAvatarOptions = [
    avatarOptions[0],
    ...(customAvatarValue ? [customAvatarOption] : []),
    ...avatarOptions.slice(1),
  ]
  const avatarSrc = generateAvatar(identity.address, identity.avatar)
  const displayTag = selectLocalizedTag(identity.tag, locale)
  const canSaveAvatarUrl = avatarUrlDraft.trim().length > 0
  const backupStatusClass = getBackupStatusClass(accountBackup.status)
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
      key: 'channels',
      label: t('profile.backup.summary.channels'),
      value: accountBackup.backupSummary.channelsCount,
    },
  ]

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
      key: 'local',
      label: t('profile.backup.group.local'),
      actions: backupActions,
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
            tag: nextIdentity.tag,
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

  function handleSaveTag() {
    if (!identity) return
    const normalizedDraft = normalizeLocalizedTag(tagDraft)
    if (tagDraft.trim() && !normalizedDraft?.default) {
      setTagError(t('profile.tag.invalid'))
      return
    }

    const nextTagValues = Object.fromEntries(
      Object.entries(identity.tag || {}).filter(
        ([key]) => key.toLowerCase() !== locale.toLowerCase()
      )
    )
    if (normalizedDraft?.default) {
      nextTagValues[locale] = normalizedDraft.default
    }
    const nextIdentity = {
      ...identity,
      tag: normalizeLocalizedTag(nextTagValues) || null,
      profileUpdatedAt: Date.now(),
    }
    setUserIdentity(nextIdentity)
    void saveBackendProfile(nextIdentity)
    setTagError('')
    addToast(t('profile.toast.tagUpdated'), 'success')
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

  function handleLogout() {
    logoutUser()
    setShowLogoutConfirm(false)
  }

  return (
    <MarketingLayout header={header}>
      <section className="profile-page">
        <div className="profile-container">
          <section className="profile-panel profile-backup-card ui-glass-surface">
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
                  <span className="profile-backup-stat-label">
                    {item.label}
                  </span>
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

          <header className="profile-header ui-glass-surface">
            <SafeImage
              className="profile-avatar-large"
              src={avatarSrc}
              alt=""
              referrerPolicy="no-referrer"
            />
            <div className="profile-heading">
              <p className="profile-kicker">{t('profile.kicker')}</p>
              <div className="profile-name-line">
                <h1>{identity.displayName || identity.username}</h1>
                {displayTag && (
                  <span className="profile-user-tag" translate="no">
                    {displayTag}
                  </span>
                )}
              </div>
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
              className="btn btn-danger profile-logout-btn"
              onClick={() => setShowLogoutConfirm(true)}
            >
              <LogOut size={16} />
              {t('account.logout')}
            </button>
          </header>

          <div className="profile-grid">
            <section className="profile-panel ui-glass-surface">
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
              <label className="profile-field profile-tag-field">
                <span>{t('profile.label.tag', { locale: localeName })}</span>
                <div className="profile-field-row">
                  <div className="profile-tag-input-control">
                    <input
                      className="input"
                      value={tagDraft}
                      onChange={event => {
                        setTagDraft(event.target.value)
                        setTagError('')
                      }}
                      placeholder={t('profile.tag.placeholder')}
                      aria-invalid={Boolean(tagError)}
                      aria-describedby={
                        tagError ? 'profile-tag-error' : undefined
                      }
                    />
                    {tagDraft && (
                      <button
                        type="button"
                        className="profile-tag-input-clear"
                        onClick={() => {
                          setTagDraft('')
                          setTagError('')
                        }}
                        aria-label={t('profile.action.clearTagInput')}
                        title={t('profile.action.clearTagInput')}
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleSaveTag}
                  >
                    <Save size={16} />
                    {t('profile.action.save')}
                  </button>
                </div>
                {tagError && (
                  <span id="profile-tag-error" className="profile-error">
                    {tagError}
                  </span>
                )}
              </label>
              <div className="profile-facts">
                <ProfileFact
                  label={t('profile.label.username')}
                  value={identity.username}
                />
              </div>
            </section>

            <section className="profile-panel ui-glass-surface">
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
                      <SafeImage
                        src={generateAvatar(identity.address, option.value)}
                        alt=""
                        referrerPolicy="no-referrer"
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
              </div>
            </section>
          </div>

          <section className="profile-panel profile-identity-panel ui-glass-surface">
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
            </div>
          </section>
          <ProfileAppearanceSettings />
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
          className="modal-overlay-wide"
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
                onClick={() => void accountBackup.exportLocalBackup()}
              >
                <Download size={16} />
                {t('profile.backup.action.exportLocal')}
              </button>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowLogoutConfirm(false)}
              >
                <X size={16} />
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleLogout}
              >
                <LogOut size={16} />
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
