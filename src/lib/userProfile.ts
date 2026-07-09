import type { UserIdentity } from '~/stores/userStore'
import type { LocalizedTag } from '~/lib/localizedTag'

export function getUserDisplayName(identity: UserIdentity) {
  return identity.displayName || identity.username
}

export function getUserChannelProfile(identity: UserIdentity) {
  return {
    displayName: getUserDisplayName(identity),
    avatar: identity.avatar || '',
    tag: identity.tag,
  }
}

export function getUserPresenceProfile(identity: UserIdentity) {
  return {
    displayName: getUserDisplayName(identity),
    avatar: identity.avatar || '',
  }
}

export function getUserMessageIdentity(identity: UserIdentity) {
  const authorTag =
    identity.tag && typeof identity.tag === 'object'
      ? (identity.tag as LocalizedTag)
      : undefined
  return {
    author: identity.address,
    authorName: getUserDisplayName(identity),
    avatar: identity.avatar || '',
    ...(authorTag ? { authorTag } : {}),
  }
}
