import type { UserIdentity } from '~/stores/userStore'
import { normalizeVisibleChatLabel } from '~server/src/utils/chatLabels.js'

export function getUserDisplayName(identity: UserIdentity) {
  return identity.displayName || identity.username
}

export function getUserChannelProfile(identity: UserIdentity) {
  const normalizedIdentity = normalizeVisibleChatLabel(identity.identity)
  return {
    displayName: getUserDisplayName(identity),
    avatar: identity.avatar || '',
    ...(normalizedIdentity ? { identity: normalizedIdentity } : {}),
    ...(identity.profileUpdatedAt
      ? { profileUpdatedAt: identity.profileUpdatedAt }
      : {}),
  }
}

export function getUserMessageIdentity(identity: UserIdentity) {
  const normalizedIdentity = normalizeVisibleChatLabel(identity.identity)
  return {
    author: identity.address,
    authorName: getUserDisplayName(identity),
    avatar: identity.avatar || '',
    ...(normalizedIdentity ? { authorIdentity: normalizedIdentity } : {}),
  }
}

export function getNextProfileUpdatedAt(previousProfileUpdatedAt?: number) {
  const previous = Number(previousProfileUpdatedAt)
  return Math.max(
    Date.now(),
    Number.isFinite(previous) && previous > 0 ? Math.floor(previous) + 1 : 1
  )
}
