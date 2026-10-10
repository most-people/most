import { Avatar, Style } from '@dicebear/core'
import planetsDefinition from '@dicebear/styles/planets.json' with { type: 'json' }

export const defaultAvatarIds = [
  'panda',
  'owl',
  'dolphin',
  'tiger',
  'turtle',
  'snow-mountain',
]

function normalizeDefaultAvatarId(id) {
  const value = typeof id === 'string' ? id.trim() : ''
  if (defaultAvatarIds.includes(value)) return value
  return ''
}

export function getDefaultAvatarValue(id) {
  return getDefaultAvatarPath(normalizeDefaultAvatarId(id) || id)
}

export function getDefaultAvatarPath(id) {
  return `/avatars/default/${id}.svg`
}

function getDefaultAvatarId(avatar) {
  if (typeof avatar !== 'string') return ''
  const value = avatar.trim()
  const match = /^\/avatars\/default\/([^/]+)\.svg$/.exec(value)
  return normalizeDefaultAvatarId(match?.[1] || '')
}

export function isDefaultAvatarValue(avatar) {
  return Boolean(getDefaultAvatarId(avatar))
}

export function normalizeDefaultAvatarValue(avatar) {
  const id = getDefaultAvatarId(avatar)
  return id ? getDefaultAvatarPath(id) : ''
}

export function createAddressAvatar(address) {
  const avatar = new Avatar(new Style(planetsDefinition), {
    seed: 'most.box@' + address,
  })
  return avatar.toDataUri()
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
