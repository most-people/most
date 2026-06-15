import { createAvatar } from '@dicebear/core'
import { botttsNeutral } from '@dicebear/collection'

export const DEFAULT_AVATAR_PREFIX = 'most-avatar:'

export const defaultAvatarIds = [
  'mint',
  'violet',
  'ocean',
  'ember',
  'sage',
  'dusk',
]

export function getDefaultAvatarValue(id) {
  return `${DEFAULT_AVATAR_PREFIX}${id}`
}

export function getDefaultAvatarPath(id) {
  return `/avatars/default/${id}.svg`
}

function getDefaultAvatarId(avatar) {
  if (typeof avatar !== 'string') return ''
  if (!avatar.startsWith(DEFAULT_AVATAR_PREFIX)) return ''
  const id = avatar.slice(DEFAULT_AVATAR_PREFIX.length)
  return defaultAvatarIds.includes(id) ? id : ''
}

export function isDefaultAvatarValue(avatar) {
  return Boolean(getDefaultAvatarId(avatar))
}

function createAddressAvatar(address) {
  return createAvatar(botttsNeutral, {
    seed: 'most.box@' + address,
    flip: true,
    backgroundType: ['gradientLinear'],
  }).toDataUri()
}

export function generateAvatar(address, avatar) {
  const defaultAvatarId = getDefaultAvatarId(avatar)
  if (defaultAvatarId) {
    return getDefaultAvatarPath(defaultAvatarId)
  }
  if (typeof avatar === 'string' && avatar.startsWith(DEFAULT_AVATAR_PREFIX)) {
    return address ? createAddressAvatar(address) : '/avatar.png'
  }
  if (avatar) return avatar
  if (!address) return '/avatar.png'
  return createAddressAvatar(address)
}
