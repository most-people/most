/**
 * Memoised `generateAvatar` for the browser.
 *
 * Derived avatars are deterministic for an address, but generating the SVG is
 * relatively expensive and chat lists may ask for the same avatar repeatedly
 * while the composer is updating. Keep only the address based path cached;
 * explicit avatars remain delegated to `generateAvatar` so avatar changes are
 * reflected immediately.
 */
import { generateAvatar } from '~server/src/utils/avatar.js'

export const AVATAR_CACHE_LIMIT = 500

const cache = new Map<string, string>()

function readCache(key: string) {
  const cached = cache.get(key)
  if (cached === undefined) return undefined
  cache.delete(key)
  cache.set(key, cached)
  return cached
}

function writeCache(key: string, value: string) {
  cache.set(key, value)
  while (cache.size > AVATAR_CACHE_LIMIT) {
    const oldest = cache.keys().next()
    if (oldest.done) break
    cache.delete(oldest.value)
  }
  return value
}

export function getCachedAvatar(
  address?: string,
  avatar?: string,
  generate: (address?: string, avatar?: string) => string = generateAvatar
) {
  if (avatar || !address) return generate(address, avatar)

  const cached = readCache(address)
  if (cached !== undefined) return cached

  return writeCache(address, generate(address, avatar))
}

export function getAvatarCacheSize() {
  return cache.size
}

export function clearAvatarCache() {
  cache.clear()
}
