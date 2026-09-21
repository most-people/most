import { afterEach, describe, expect, it, vi } from 'vitest'

import { generateAvatar } from '~server/src/utils/avatar.js'
import {
  AVATAR_CACHE_LIMIT,
  clearAvatarCache,
  getAvatarCacheSize,
  getCachedAvatar,
} from '~/lib/avatarCache'

const ADDRESS_A = '0x1111111111111111111111111111111111111111'
const ADDRESS_B = '0x2222222222222222222222222222222222222222'
const DEFAULT_AVATAR = '/avatars/default/panda.svg'

afterEach(() => {
  clearAvatarCache()
  vi.restoreAllMocks()
})

/**
 * A counting stand-in for `generateAvatar`.
 *
 * Injection is required because a spy on the `avatar.js` export cannot intercept
 * the module's own internal call.
 */
function countingGenerator() {
  return vi.fn(generateAvatar)
}

/**
 * A cheap deterministic stand-in used to fill the cache.
 *
 * Real DiceBear generation costs ~1.75 ms, so building a 500 entry cache with it
 * would add seconds to this file for no extra coverage.
 */
function stubGenerator() {
  return vi.fn((address?: string) => `data:stub,${address}`)
}

describe('getCachedAvatar', () => {
  it('generates once per address and reuses the result', () => {
    const generate = countingGenerator()

    const first = getCachedAvatar(ADDRESS_A, undefined, generate)
    const second = getCachedAvatar(ADDRESS_A, undefined, generate)
    const third = getCachedAvatar(ADDRESS_A, undefined, generate)

    expect(second).toBe(first)
    expect(third).toBe(first)
    expect(generate).toHaveBeenCalledTimes(1)
  })

  it('generates separately for different addresses', () => {
    const generate = countingGenerator()

    const a = getCachedAvatar(ADDRESS_A, undefined, generate)
    const b = getCachedAvatar(ADDRESS_B, undefined, generate)

    expect(a).not.toBe(b)
    expect(generate).toHaveBeenCalledTimes(2)
  })

  it('produces the same value as generateAvatar', () => {
    expect(getCachedAvatar(ADDRESS_A)).toBe(generateAvatar(ADDRESS_A))
  })

  it('does not cache a chosen default avatar under the address', () => {
    const generate = countingGenerator()

    // A chosen default avatar depends on the argument, not the address. If it
    // were cached by address, switching avatars would keep returning the old one.
    expect(getCachedAvatar(ADDRESS_A, DEFAULT_AVATAR, generate)).toBe(
      DEFAULT_AVATAR
    )
    expect(getAvatarCacheSize()).toBe(0)

    expect(
      getCachedAvatar(ADDRESS_A, '/avatars/default/owl.svg', generate)
    ).toBe('/avatars/default/owl.svg')
    expect(getAvatarCacheSize()).toBe(0)
    // Delegated, so it still runs, but nothing is retained.
    expect(generate).toHaveBeenCalledTimes(2)
  })

  it('does not cache an explicit avatar', () => {
    const generate = countingGenerator()
    const custom = 'data:image/svg+xml;base64,AAAA'

    expect(getCachedAvatar(ADDRESS_A, custom, generate)).toBe(custom)
    expect(getAvatarCacheSize()).toBe(0)

    expect(
      getCachedAvatar(ADDRESS_A, 'data:image/svg+xml;base64,BBBB', generate)
    ).toBe('data:image/svg+xml;base64,BBBB')
    expect(getAvatarCacheSize()).toBe(0)
    expect(generate).toHaveBeenCalledTimes(2)
  })

  it('falls back without caching when there is no address', () => {
    expect(getCachedAvatar(undefined)).toBe('/avatar.png')
    expect(getCachedAvatar('')).toBe('/avatar.png')
    expect(getAvatarCacheSize()).toBe(0)
  })

  it('treats an empty-string avatar as "not chosen" and caches it', () => {
    const generate = countingGenerator()

    // channelPresence stores '' for users without a chosen avatar, which is the
    // common case and the one this cache exists for.
    const first = getCachedAvatar(ADDRESS_A, '', generate)
    const second = getCachedAvatar(ADDRESS_A, '', generate)

    expect(second).toBe(first)
    expect(generate).toHaveBeenCalledTimes(1)
    expect(getAvatarCacheSize()).toBe(1)
  })

  it('evicts the oldest entry past the limit', () => {
    const generate = stubGenerator()
    for (let i = 0; i < AVATAR_CACHE_LIMIT + 10; i += 1) {
      getCachedAvatar(`0x${String(i).padStart(40, '0')}`, undefined, generate)
    }
    expect(getAvatarCacheSize()).toBe(AVATAR_CACHE_LIMIT)
  })

  it('regenerates at most once per author across 1000 row renders', () => {
    const generate = countingGenerator()

    // Mirrors the failing scenario: a 100-row list re-rendering ten times, with
    // every row resolving the same author.
    for (let render = 0; render < 10; render += 1) {
      for (let row = 0; row < 100; row += 1) {
        getCachedAvatar(ADDRESS_A, '', generate)
      }
    }

    expect(generate).toHaveBeenCalledTimes(1)
  })

  it('keeps a recently used entry when evicting', () => {
    // Every entry is filled with the same cheap stub value, so the test can tell
    // eviction apart only by counting regenerations below.
    const fill = stubGenerator()
    const addresses = Array.from(
      { length: AVATAR_CACHE_LIMIT },
      (_, i) => `0x${String(i).padStart(40, '0')}`
    )
    for (const address of addresses) getCachedAvatar(address, undefined, fill)

    // Touch the oldest entry so it becomes the most recently used.
    getCachedAvatar(addresses[0], undefined, fill)
    // Push one new entry in, forcing a single eviction.
    getCachedAvatar(
      '0xffffffffffffffffffffffffffffffffffffffff',
      undefined,
      fill
    )

    const generate = stubGenerator()
    getCachedAvatar(addresses[0], undefined, generate)
    expect(generate).not.toHaveBeenCalled()
  })

  it('recomputes an evicted entry rather than returning a stale value', () => {
    const fill = stubGenerator()
    const firstAddress = '0x0000000000000000000000000000000000000000'

    // The real generator verifies the recomputed value is still deterministic.
    const original = getCachedAvatar(firstAddress)
    for (let i = 0; i < AVATAR_CACHE_LIMIT + 1; i += 1) {
      getCachedAvatar(`0x${String(i).padStart(40, 'f')}`, undefined, fill)
    }

    const reload = countingGenerator()
    expect(getCachedAvatar(firstAddress, undefined, reload)).toBe(original)
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
