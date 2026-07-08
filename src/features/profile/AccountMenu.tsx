import type { SyntheticEvent } from 'react'
import { Link } from '@tanstack/react-router'
import { User } from 'lucide-react'
import { useI18n } from '~/lib/i18n'
import { useUserStore } from '~/stores/userStore'
import { generateAvatar } from '~server/src/utils/avatar.js'

const FALLBACK_AVATAR_SRC = '/avatars/fallback-broken.svg'

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
        <img
          className="account-profile-link-avatar"
          src={avatarSrc}
          alt=""
          referrerPolicy="no-referrer"
          onError={handleAvatarImageError}
        />
      ) : (
        <User size={18} />
      )}
    </Link>
  )
}
