import type { UserIdentity } from '~/stores/userStore'

export function getUserDisplayName(identity: UserIdentity) {
  return identity.displayName || identity.username
}

export function getUserChannelProfile(identity: UserIdentity) {
  return {
    displayName: getUserDisplayName(identity),
    avatar: identity.avatar || '',
  }
}

export function getUserMessageIdentity(identity: UserIdentity) {
  return {
    author: identity.address,
    authorName: getUserDisplayName(identity),
    avatar: identity.avatar || '',
  }
}
