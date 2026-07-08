import { Link } from '@tanstack/react-router'
import { User } from 'lucide-react'
import { SafeImage } from '~/components/SafeImage'
import { useI18n } from '~/lib/i18n'
import { useUserStore } from '~/stores/userStore'
import { generateAvatar } from '~server/src/utils/avatar.js'

export function AccountMenuButton() {
  const { t } = useI18n()
  const identity = useUserStore(s => s.identity)
  const avatarSrc = generateAvatar(identity?.address, identity?.avatar)
  const profileLabel = t('nav.profile')

  return (
    <Link
      to="/profile/"
      className="account-profile-link"
      title={profileLabel}
      aria-label={profileLabel}
    >
      {identity ? (
        <SafeImage
          className="account-profile-link-avatar"
          src={avatarSrc}
          alt=""
          referrerPolicy="no-referrer"
        />
      ) : (
        <User size={18} />
      )}
    </Link>
  )
}
