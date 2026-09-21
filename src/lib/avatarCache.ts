/**
 * Memoised `generateAvatar` for the browser.
 *
 * `generateAvatar` builds a DiceBear SVG and base64-encodes it whenever a user
 * has neither a custom avatar nor a default avatar chosen — which is the common
 * case, because `channelPresence` stores an empty string for those users. That
 * costs ~1.75 ms per call, and the chat message list calls it once per row on
 * every render, so typing in the composer regenerated 100 avatars per keystroke.
 *
 * The derived value is a pure function of the address, so caching is safe and
 * unbounded only in theory: the cache is capped to keep memory bounded.
 *
 * The fast paths are deliberately delegated rather than reimplemented so this
 * module cannot drift from `generateAvatar`'s behaviour.
 */
import { generateAvatar } from '~server/src/utils/avatar.js'

/**
 * Upper bound on cached data URIs.
 *
 * Each entry is a base64 SVG of roughly 1–3 KB, so this caps the cache at a few
 * megabytes even in a very large workspace.
 */
export const AVATAR_CACHE_LIMIT = 500

/** address -> data URI, in least-recently-used order (oldest first). */
const cache = new Map<string, string>()

function readCache(key: string) {
  const cached = cache.get(key)
  if (cached === undefined) return undefined
  // Refresh recency so long-lived channels keep their avatars cached.
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

/**
 * Same result as `generateAvatar`, but derived avatars are computed once per
 * address.
 *
 * Only the "no avatar chosen" path is cached. A chosen default avatar and an
 * explicit avatar both depend on the `avatar` argument rather than the address,
 * so caching them under the address would serve a stale value after the user
 * changes their avatar.
 *
 * `generate` is injectable purely so tests can count how often the expensive
 * path runs: a spy on the `avatar.js` export cannot intercept the module's own
 * internal call. Production callers omit it.
 */
export function getCachedAvatar(
  address?: string,
  avatar?: string,
  generate: (address?: string, avatar?: string) => string = generateAvatar
) {
  // Mirrors `generateAvatar`: these two branches never derive from the address,
  // so they are delegated and left uncached.
  if (avatar || !address) return generate(address, avatar)

  const cached = readCache(address)
  if (cached !== undefined) return cached

  return writeCache(address, generate(address, avatar))
}

/** Number of cached entries. Exposed for tests. */
export function getAvatarCacheSize() {
  return cache.size
}

/** Clears the cache. Exposed for tests. */
export function clearAvatarCache() {
  cache.clear()
}
