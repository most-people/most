import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Download, Image, LogOut, Pencil } from 'lucide-react'
import { ActionMenu, ConfirmModal, InputModal } from '~/components/ui'
import { LanguageToggle } from '~/components/LanguageToggle'
import { MarketingThemeToggle } from '~/components/MarketingThemeToggle'
import { LogoIcon } from '~/components/icons/LogoIcon'
import { useI18n } from '~/lib/i18n'
import { useUserStore } from '~/stores/userStore'
import { generateAvatar } from '~server/src/utils/avatar.js'

export function Nav() {
  const [accountModal, setAccountModal] = useState<
    'displayName' | 'avatar' | 'logout' | null
  >(null)
  const identity = useUserStore(s => s.identity)
  const openLoginModal = useUserStore(s => s.openLoginModal)
  const setUserIdentity = useUserStore(s => s.setUserIdentity)
  const logoutUser = useUserStore(s => s.logoutUser)
  const { t } = useI18n()
  const identityLabel =
    identity?.displayName || identity?.username || t('nav.openWeb')

  function updateDisplayName(displayName: string) {
    if (!identity) return
    setUserIdentity({ ...identity, displayName })
    setAccountModal(null)
  }

  function updateAvatar(avatar: string) {
    if (!identity) return
    setUserIdentity({ ...identity, avatar })
    setAccountModal(null)
  }

  function confirmLogout() {
    logoutUser()
    setAccountModal(null)
  }

  function validateAvatarUrl(value: string) {
    try {
      const url = new URL(value)
      return url.protocol === 'http:' || url.protocol === 'https:'
        ? ''
        : t('nav.avatarUrlInvalid')
    } catch {
      return t('nav.avatarUrlInvalid')
    }
  }

  return (
    <>
      <nav className="mkt-nav">
        <div className="mkt-nav-inner">
          <Link to="/" className="mkt-nav-logo">
            <LogoIcon />
            MOST PEOPLE
          </Link>

          <div className="mkt-nav-cta">
            <MarketingThemeToggle />
            <LanguageToggle className="mkt-theme-toggle" />
            <Link to="/download/" className="btn btn-primary mkt-nav-preview">
              <Download size={16} />
              {t('nav.downloadClient')}
            </Link>
            {identity ? (
              <ActionMenu
                ariaLabel={t('nav.accountMenu')}
                placement="bottom-end"
                items={[
                  {
                    key: 'displayName',
                    label: t('nav.editDisplayName'),
                    icon: <Pencil size={16} />,
                    onSelect: () => setAccountModal('displayName'),
                  },
                  {
                    key: 'avatar',
                    label: t('nav.changeAvatar'),
                    icon: <Image size={16} />,
                    onSelect: () => setAccountModal('avatar'),
                  },
                  {
                    key: 'logout',
                    label: t('account.logout'),
                    icon: <LogOut size={16} />,
                    danger: true,
                    onSelect: () => setAccountModal('logout'),
                  },
                ]}
                renderTrigger={triggerProps => (
                  <button
                    {...triggerProps}
                    className="mkt-nav-avatar-trigger"
                    aria-label={identityLabel}
                    title={identityLabel}
                  >
                    <img
                      className="mkt-nav-avatar"
                      src={generateAvatar(identity.address, identity.avatar)}
                      alt=""
                      aria-hidden="true"
                    />
                  </button>
                )}
              />
            ) : (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={openLoginModal}
              >
                {t('nav.getStarted')}
              </button>
            )}
          </div>
        </div>
      </nav>
      {accountModal === 'displayName' && identity && (
        <InputModal
          title={t('nav.editDisplayName')}
          placeholder={t('nav.displayNamePlaceholder')}
          defaultValue={identity.displayName || identity.username}
          confirmText={t('common.confirm')}
          onConfirm={updateDisplayName}
          onClose={() => setAccountModal(null)}
        />
      )}
      {accountModal === 'avatar' && identity && (
        <InputModal
          title={t('nav.changeAvatar')}
          placeholder={t('nav.avatarUrlPlaceholder')}
          defaultValue={identity.avatar || ''}
          confirmText={t('common.confirm')}
          validate={validateAvatarUrl}
          onConfirm={updateAvatar}
          onClose={() => setAccountModal(null)}
        />
      )}
      {accountModal === 'logout' && (
        <ConfirmModal
          title={t('account.logoutTitle')}
          message={t('account.logoutConfirm')}
          confirmText={t('account.logout')}
          danger
          onConfirm={confirmLogout}
          onClose={() => setAccountModal(null)}
        />
      )}
    </>
  )
}
