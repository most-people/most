import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  Check,
  ChevronRight,
  Download,
  ExternalLink,
  Loader,
  LogOut,
  Upload,
  User,
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
import { ProfileCollapsible } from '~/features/profile/ProfileCollapsible'
import { ProfileAccountSyncPanel } from '~/features/profile/ProfileAccountSyncPanel'
import { ProfileDeviceCertPanel } from '~/features/profile/ProfileDeviceCertPanel'
import { getCachedAvatar } from '~/lib/avatarCache'
import {
  loadRecentCustomAvatar,
  saveRecentCustomAvatar,
} from '~/lib/recentCustomAvatar'
import { api, getApiErrorMessage } from '~server/src/utils/api'
import {
  getDefaultAvatarValue,
  isDefaultAvatarValue,
  normalizeDefaultAvatarValue,
} from '~server/src/utils/avatar.js'

type AvatarOption = {
  value: string
  labelKey: MessageKey
}

const profileDefaultAvatarIds = [
  'sweater-cat',
  'meadow',
  'underwater',
  'starlight',
  'flower-cat',
  'cat-and-bird',
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

export default function ProfilePage() {
  const { locale, localeName, t } = useI18n()
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
  // Last custom avatar URL (localStorage, cleared on logout), so picking a
  // built-in avatar keeps the "custom" option to switch back.
  const [recentCustomAvatar, setRecentCustomAvatar] = useState('')
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
    const avatar =
      normalizeDefaultAvatarValue(identity.avatar) || identity.avatar || ''
    setAvatarUrlDraft(avatar)
    setAvatarUrlError('')
    if (avatar && !isDefaultAvatarValue(avatar)) {
      saveRecentCustomAvatar(avatar)
      setRecentCustomAvatar(avatar)
    } else {
      const stored = loadRecentCustomAvatar()
      setRecentCustomAvatar(
        stored &&
          !isDefaultAvatarValue(stored) &&
          isSupportedAvatarValue(stored)
          ? stored
          : ''
      )
    }
  }, [identity])

  useEffect(() => {
    setTagDraft(selectExactLocalizedTag(identity?.tag, locale))
    setTagError('')
  }, [identity?.tag, locale])

  const keys = identity?.publicKeys
    ? {
        ed_public_key: identity.publicKeys.ed25519,
        public_key: identity.publicKeys.x25519,
      }
    : null

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
    activeAvatar && !isDefaultAvatarValue(activeAvatar)
      ? activeAvatar
      : recentCustomAvatar
  const customAvatarOption = {
    value: customAvatarValue,
    labelKey: 'profile.avatar.custom' as MessageKey,
  }
  const displayedAvatarOptions = [
    avatarOptions[0],
    ...(customAvatarValue ? [customAvatarOption] : []),
    ...avatarOptions.slice(1),
  ]
  const avatarSrc = getCachedAvatar(identity.address, identity.avatar)
  const displayTag = selectLocalizedTag(identity.tag, locale)
  const shortAddress = `${address.slice(0, 6)}…${address.slice(-4)}`
  const savedDisplayName = identity.displayName || identity.username
  const savedTag = selectExactLocalizedTag(identity.tag, locale)
  const profileDirty =
    displayNameDraft.trim() !== savedDisplayName || tagDraft.trim() !== savedTag
  const canSaveAvatarUrl = avatarUrlDraft.trim().length > 0
  const exportWorking = accountBackup.action === 'export'
  const importWorking = accountBackup.action === 'import'
  const backupDisabled = accountBackup.busy || accountBackup.hasBackend !== true

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

  function handleSaveProfile() {
    if (!identity) return
    const displayName = displayNameDraft.trim() || identity.username
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
      displayName,
      tag: normalizeLocalizedTag(nextTagValues) || null,
      profileUpdatedAt: Date.now(),
    }
    setUserIdentity(nextIdentity)
    void saveBackendProfile(nextIdentity)
    setDisplayNameDraft(displayName)
    setTagError('')
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

  function handleLogout() {
    logoutUser()
    setShowLogoutConfirm(false)
  }

  return (
    <MarketingLayout header={header}>
      <section className="profile-page">
        <div className="profile-container">
          <header className="profile-hero">
            <SafeImage
              className="profile-hero-avatar"
              src={avatarSrc}
              alt=""
              referrerPolicy="no-referrer"
            />
            <div className="profile-hero-main">
              <div className="profile-hero-name">
                <h1>{savedDisplayName}</h1>
                {displayTag && (
                  <span className="profile-user-tag" translate="no">
                    {displayTag}
                  </span>
                )}
              </div>
              <div className="profile-hero-address">
                <code translate="no" title={address}>
                  {shortAddress}
                </code>
                <CopyButton text={address} className="profile-hero-action" />
                <a
                  href={`https://debank.com/profile/${identity.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="profile-hero-action"
                >
                  {t('web3.action.view')}
                  <ExternalLink size={12} />
                </a>
              </div>
            </div>
          </header>

          <ProfileCollapsible title={t('profile.section.profile')}>
            <form
              onSubmit={event => {
                event.preventDefault()
                handleSaveProfile()
              }}
            >
              <div className="profile-row is-field">
                <span className="profile-row-label">
                  {t('profile.section.avatar')}
                </span>
                <div className="profile-field-stack">
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
                          aria-label={t(option.labelKey)}
                          title={t(option.labelKey)}
                        >
                          <SafeImage
                            src={getCachedAvatar(
                              identity.address,
                              option.value
                            )}
                            alt=""
                            referrerPolicy="no-referrer"
                          />
                          {selected && (
                            <span className="profile-avatar-check">
                              <Check size={10} strokeWidth={3} />
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                  <div className="profile-inline-field">
                    <input
                      id="profile-avatar-url"
                      className="input"
                      value={avatarUrlDraft}
                      onChange={event => {
                        setAvatarUrlDraft(event.target.value)
                        setAvatarUrlError('')
                      }}
                      onKeyDown={event => {
                        if (event.key !== 'Enter') return
                        event.preventDefault()
                        if (canSaveAvatarUrl) handleSaveAvatarUrl()
                      }}
                      placeholder={t('profile.label.customAvatar')}
                      aria-label={t('profile.label.customAvatar')}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleSaveAvatarUrl}
                      disabled={!canSaveAvatarUrl}
                    >
                      {t('profile.action.save')}
                    </button>
                  </div>
                  {avatarUrlError && (
                    <p className="profile-error">{avatarUrlError}</p>
                  )}
                </div>
              </div>

              <label className="profile-row is-field">
                <span className="profile-row-label">
                  {t('profile.label.displayName')}
                </span>
                <input
                  className="input"
                  value={displayNameDraft}
                  onChange={event => setDisplayNameDraft(event.target.value)}
                  placeholder={t('nav.displayNamePlaceholder')}
                />
              </label>

              <label className="profile-row is-field">
                <span className="profile-row-label">
                  {t('profile.label.tag', { locale: localeName })}
                </span>
                <span className="profile-field-stack">
                  <span className="profile-tag-input-control">
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
                        <X size={14} />
                      </button>
                    )}
                  </span>
                  {tagError && (
                    <span id="profile-tag-error" className="profile-error">
                      {tagError}
                    </span>
                  )}
                </span>
              </label>

              <div className="profile-row is-field">
                <span className="profile-row-label">
                  {t('profile.label.username')}
                </span>
                <code className="profile-row-value" translate="no">
                  {identity.username}
                </code>
              </div>

              <div className="profile-card-footer">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!profileDirty}
                >
                  {t('profile.action.save')}
                </button>
              </div>
            </form>
          </ProfileCollapsible>

          <ProfileCollapsible title={t('profile.section.accountGroup')}>
            <ProfileAccountSyncPanel />
            <ProfileDeviceCertPanel />
            <div className="profile-row">
              <div className="profile-row-text">
                <h3>{t('profile.section.backup')}</h3>
                <p>{t('profile.section.backup.desc')}</p>
                {accountBackup.hasBackend === false && (
                  <p className="profile-row-note">
                    {t('profile.backup.needsNode')}
                  </p>
                )}
              </div>
              <div className="profile-row-control">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={backupDisabled}
                  onClick={() => void accountBackup.exportLocalBackup()}
                >
                  {exportWorking ? (
                    <Loader size={15} className="ui-spinner" />
                  ) : (
                    <Download size={15} />
                  )}
                  {exportWorking
                    ? t('profile.backup.status.exporting')
                    : t('profile.backup.action.exportLocal')}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={backupDisabled}
                  onClick={handleImportLocalBackup}
                >
                  {importWorking ? (
                    <Loader size={15} className="ui-spinner" />
                  ) : (
                    <Upload size={15} />
                  )}
                  {importWorking
                    ? t('profile.backup.status.importing')
                    : t('profile.backup.action.importLocal')}
                </button>
              </div>
            </div>
          </ProfileCollapsible>

          <ProfileAppearanceSettings />

          <ProfileCollapsible title={t('profile.section.advanced')}>
            {keys && (
              <>
                <ProfileKeyRow
                  title={t('web3.label.ed25519Public')}
                  value={keys.ed_public_key}
                />
                <ProfileKeyRow
                  title={t('web3.label.x25519Public')}
                  value={keys.public_key}
                />
              </>
            )}
            <Link
              to="/web3/"
              hash="wallet"
              className="profile-row profile-row-link"
            >
              <div className="profile-row-text">
                <h3>{t('profile.action.openWallet')}</h3>
              </div>
              <ChevronRight size={16} className="profile-row-chevron" />
            </Link>
          </ProfileCollapsible>

          <button
            type="button"
            className="btn profile-logout ui-glass-surface"
            onClick={() => setShowLogoutConfirm(true)}
          >
            <LogOut size={16} />
            {t('account.logoutTitle')}
          </button>
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

function ProfileKeyRow({ title, value }: { title: string; value: string }) {
  return (
    <div className="profile-row">
      <div className="profile-row-text">
        <h3>{title}</h3>
        <code className="profile-row-value" translate="no">
          {value}
        </code>
      </div>
      <CopyButton text={value} />
    </div>
  )
}
