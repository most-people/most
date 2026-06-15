import { createAvatar } from '@dicebear/core'
import { botttsNeutral } from '@dicebear/collection'

export const defaultAvatarIds = [
  'mint',
  'violet',
  'ocean',
  'ember',
  'sage',
  'dusk',
]

export function getDefaultAvatarValue(id) {
  return getDefaultAvatarPath(id)
}

export function getDefaultAvatarPath(id) {
  return `/avatars/default/${id}.svg`
}

function getDefaultAvatarId(avatar) {
  if (typeof avatar !== 'string') return ''
  const value = avatar.trim()
  const match = /^\/avatars\/default\/([^/]+)\.svg$/.exec(value)
  const id = match?.[1] || ''
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
  if (avatar) return avatar
  if (!address) return '/avatar.png'
  return createAddressAvatar(address)
}
