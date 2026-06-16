import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  Check,
  ExternalLink,
  Fingerprint,
  KeyRound,
  LogOut,
  Save,
  ShieldCheck,
  User,
  WalletCards,
} from 'lucide-react'
import { CopyButton } from '~/components/CopyButton'
import { MarketingHeader } from '~/components/MarketingHeader'
import { MarketingLayout } from '~/components/MarketingLayout'
import { ConfirmModal } from '~/components/ui'
import { useAppStore } from '~/stores/useAppStore'
import { useUserStore } from '~/stores/userStore'
import { useI18n, type MessageKey } from '~/lib/i18n'
import { syncUserProfileMetadata } from '~/lib/userSync'
import { getApiErrorMessage } from '~server/src/utils/api'
import {
  defaultAvatarIds,
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

const avatarOptions: AvatarOption[] = [
  {
    value: '',
    labelKey: 'profile.avatar.address',
  },
  ...defaultAvatarIds.map(id => ({
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
  const { t } = useI18n()
  const addToast = useAppStore(s => s.addToast)
  const hasBackend = useAppStore(s => s.hasBackend)
  const identity = useUserStore(s => s.identity)
  const openLoginModal = useUserStore(s => s.openLoginModal)
  const setUserIdentity = useUserStore(s => s.setUserIdentity)
  const logoutUser = useUserStore(s => s.logoutUser)
  const [displayNameDraft, setDisplayNameDraft] = useState('')
  const [avatarUrlDraft, setAvatarUrlDraft] = useState('')
  const [avatarUrlError, setAvatarUrlError] = useState('')
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
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
  const avatarSrc = generateAvatar(identity.address, identity.avatar)
  const address = identity.address.toLowerCase()
  const canSaveAvatarUrl = avatarUrlDraft.trim().length > 0

  async function syncSavedProfile(nextIdentity) {
    if (hasBackend !== true) return
    try {
      await syncUserProfileMetadata(nextIdentity)
    } catch (err) {
      addToast(
        await getApiErrorMessage(err, t('appGlobals.syncStartFailed')),
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
    void syncSavedProfile(nextIdentity)
    setAvatarUrlError('')
    addToast(t('profile.toast.avatarUpdated'), 'success')
  }

  function handleSaveDisplayName() {
    if (!identity) return
    const displayName = displayNameDraft.trim() || identity.username
    const nextIdentity = { ...identity, displayName, profileUpdatedAt: Date.now() }
    setUserIdentity(nextIdentity)
    void syncSavedProfile(nextIdentity)
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

  function handleLogout() {
    logoutUser()
    setShowLogoutConfirm(false)
  }

  return (
    <MarketingLayout header={header}>
      <section className="profile-page">
        <div className="profile-container">
          <header className="profile-header">
            <img className="profile-avatar-large" src={avatarSrc} alt="" />
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
                <ProfileFact
                  label={t('web3.label.address')}
                  value={identity.address}
                  copy
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
                {avatarOptions.map(option => {
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
                        aria-hidden="true"
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
      {showLogoutConfirm && (
        <ConfirmModal
          title={t('account.logoutTitle')}
          message={t('account.logoutConfirm')}
          confirmText={t('account.logout')}
          danger
          onConfirm={handleLogout}
          onClose={() => setShowLogoutConfirm(false)}
        />
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
