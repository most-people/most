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

function createAddressAvatar(address) {
  const seed = `most.box@${address}`
  let state = 2166136261
  for (let index = 0; index < seed.length; index += 1) {
    state = Math.imul(state ^ seed.charCodeAt(index), 16777619) >>> 0
  }

  const nextByte = () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return state & 0xff
  }

  const color = `hsl(${((nextByte() << 8) | nextByte()) % 360} 58% 42%)`
  const cells = []

  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      if ((nextByte() & 1) === 0) continue
      cells.push(`<rect x="${column}" y="${row}" width="1" height="1"/>`)
      if (column !== 2) {
        cells.push(`<rect x="${4 - column}" y="${row}" width="1" height="1"/>`)
      }
    }
  }

  if (cells.length === 0) {
    cells.push('<rect x="2" y="2" width="1" height="1"/>')
  }

  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 5 5" shape-rendering="crispEdges">' +
    '<rect width="5" height="5" fill="#f1f5f9"/>' +
    `<g fill="${color}">${cells.join('')}</g>` +
    '</svg>'
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
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
