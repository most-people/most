import {
  normalizeChannelAvatar,
  normalizeChannelDisplayName,
  uniqueStrings,
} from './channelIdentity.js'
import { normalizeOwnerAddress } from './ownerMetadata.js'

export const CHANNEL_PRESENCE_HEARTBEAT_MS = 15 * 1000
export const CHANNEL_PRESENCE_TIMEOUT_MS = 45 * 1000

export class ChannelPresenceManager {
  #emitPresence
  #getChannelId
  #heartbeatMs
  #profiles = new Map()
  #sessions = new Map()
  #sweepTimer = null
  #timeoutMs

  constructor(options = {}) {
    this.#emitPresence = options.emitPresence || (() => {})
    this.#getChannelId = options.getChannelId || (channelKey => channelKey)
    this.#heartbeatMs = options.heartbeatMs ?? CHANNEL_PRESENCE_HEARTBEAT_MS
    this.#timeoutMs = options.timeoutMs ?? CHANNEL_PRESENCE_TIMEOUT_MS
  }

  list(channelKey) {
    const sessions = this.#sessions.get(channelKey)
    if (!sessions) return []
    const addresses = uniqueStrings(
      [...sessions.values()].map(session => session.address)
    )
    return addresses
      .map(address => this.format(channelKey, address))
      .filter(Boolean)
  }

  format(channelKey, address, status = 'online') {
    const normalizedAddress = normalizeOwnerAddress(address)
    if (!normalizedAddress) return null
    const sessions = [
      ...(this.#sessions.get(channelKey)?.values() || []),
    ].filter(session => session.address === normalizedAddress)
    const profile = this.#profiles.get(channelKey)?.get(normalizedAddress)
    const lastSeen = Math.max(
      0,
      Number(profile?.lastSeen) || 0,
      ...sessions.map(session => Number(session.lastSeen) || 0)
    )
    return {
      channelKey,
      channelId: this.#getChannelId(channelKey) || channelKey,
      address: normalizedAddress,
      displayName: profile?.displayName || undefined,
      avatar: profile?.avatar || undefined,
      profileUpdatedAt: profile?.profileUpdatedAt || undefined,
      lastSeen,
      online: sessions.length > 0,
      local: sessions.some(session => session.local),
      status,
    }
  }

  listLocal() {
    const entries = []
    const seen = new Set()
    for (const sessions of this.#sessions.values()) {
      for (const session of sessions.values()) {
        if (!session.local) continue
        const key = `${session.channelKey}:${session.address}`
        if (seen.has(key)) continue
        seen.add(key)
        const entry = this.format(session.channelKey, session.address, 'online')
        if (entry) entries.push(entry)
      }
    }
    return entries
  }

  join(channel, options = {}) {
    const address = normalizeOwnerAddress(options.address)
    if (!address) return null
    const now = Number(options.lastSeen) || Date.now()
    const channelKey = channel.channelKey
    const wasOnline = this.#isAddressOnline(channelKey, address)
    const session = {
      sessionId: this.#normalizeSessionId(options.sessionId),
      sourceId: this.#normalizeSourceId(options),
      address,
      channelKey,
      lastSeen: now,
      local: options.local === true,
      sourcePeerId: String(options.sourcePeerId || '').trim(),
    }
    this.#getSessionMap(channelKey).set(this.#getSessionKey(session), session)
    const profileChanged = this.#upsertProfile(
      channelKey,
      address,
      options,
      now
    )
    if (!wasOnline) return this.#emit(channelKey, address, 'online')
    if (profileChanged) return this.#emit(channelKey, address, 'profile')
    return null
  }

  heartbeat(channel, options = {}) {
    const address = normalizeOwnerAddress(options.address)
    if (!address) return null
    const channelKey = channel.channelKey
    const sessionKey = this.#getSessionKey({ ...options, address })
    const sessions = this.#getSessionMap(channelKey)
    const existing = sessions.get(sessionKey)
    if (!existing) return this.join(channel, { ...options, address })
    existing.lastSeen = Number(options.lastSeen) || Date.now()
    sessions.set(sessionKey, existing)
    return null
  }

  updateProfile(channel, options = {}) {
    const address = normalizeOwnerAddress(options.address)
    if (!address) return null
    const now = Number(options.lastSeen) || Date.now()
    const changed = this.#upsertProfile(
      channel.channelKey,
      address,
      options,
      now
    )
    if (changed && this.#isAddressOnline(channel.channelKey, address)) {
      return this.#emit(channel.channelKey, address, 'profile')
    }
    return null
  }

  leave(channelKey, options = {}) {
    const address = normalizeOwnerAddress(options.address)
    const sourceId = this.#normalizeSourceId(options)
    const sessionId = options.sessionId
      ? this.#normalizeSessionId(options.sessionId)
      : ''
    const sessions = this.#sessions.get(channelKey)
    if (!sessions || (!address && !sourceId)) return []

    const touchedAddresses = new Set()
    for (const [key, session] of [...sessions]) {
      if (address && session.address !== address) continue
      if (sourceId && session.sourceId !== sourceId) continue
      if (sessionId && session.sessionId !== sessionId) continue
      touchedAddresses.add(session.address)
      sessions.delete(key)
    }
    if (sessions.size === 0) this.#sessions.delete(channelKey)

    return [...touchedAddresses]
      .filter(item => !this.#isAddressOnline(channelKey, item))
      .map(item => this.#emit(channelKey, item, 'offline'))
      .filter(Boolean)
  }

  clearSource(sourceId) {
    const normalizedSourceId = String(sourceId || '').trim()
    if (!normalizedSourceId) return []
    const events = []
    for (const [channelKey, sessions] of [...this.#sessions]) {
      const touchedAddresses = new Set()
      for (const [key, session] of [...sessions]) {
        if (session.sourceId !== normalizedSourceId) continue
        touchedAddresses.add(session.address)
        sessions.delete(key)
      }
      if (sessions.size === 0) this.#sessions.delete(channelKey)
      for (const address of touchedAddresses) {
        if (!this.#isAddressOnline(channelKey, address)) {
          const event = this.#emit(channelKey, address, 'offline')
          if (event) events.push(event)
        }
      }
    }
    return events
  }

  prune(now = Date.now()) {
    const events = []
    for (const [channelKey, sessions] of [...this.#sessions]) {
      const touchedAddresses = new Set()
      for (const [key, session] of [...sessions]) {
        if (now - session.lastSeen <= this.#timeoutMs) continue
        touchedAddresses.add(session.address)
        sessions.delete(key)
      }
      if (sessions.size === 0) this.#sessions.delete(channelKey)
      for (const address of touchedAddresses) {
        if (!this.#isAddressOnline(channelKey, address)) {
          const event = this.#emit(channelKey, address, 'offline')
          if (event) events.push(event)
        }
      }
    }
    return events
  }

  start() {
    if (this.#sweepTimer) return
    this.#sweepTimer = setInterval(() => this.prune(), this.#heartbeatMs)
    this.#sweepTimer.unref?.()
  }

  clear() {
    if (this.#sweepTimer) {
      clearInterval(this.#sweepTimer)
      this.#sweepTimer = null
    }
    this.#sessions.clear()
    this.#profiles.clear()
  }

  #normalizeSessionId(sessionId) {
    return (
      String(sessionId || 'default')
        .trim()
        .slice(0, 120) || 'default'
    )
  }

  #normalizeSourceId(options = {}) {
    const sourceId = String(options.sourceId || '').trim()
    if (sourceId) return sourceId.slice(0, 160)
    const sourcePeerId = String(options.sourcePeerId || '').trim()
    if (sourcePeerId) return `peer:${sourcePeerId}`.slice(0, 180)
    return 'local'
  }

  #getSessionKey(options = {}) {
    return [
      this.#normalizeSourceId(options),
      normalizeOwnerAddress(options.address),
      this.#normalizeSessionId(options.sessionId),
    ].join(':')
  }

  #getSessionMap(channelKey) {
    if (!this.#sessions.has(channelKey))
      this.#sessions.set(channelKey, new Map())
    return this.#sessions.get(channelKey)
  }

  #getProfileMap(channelKey) {
    if (!this.#profiles.has(channelKey))
      this.#profiles.set(channelKey, new Map())
    return this.#profiles.get(channelKey)
  }

  #isAddressOnline(channelKey, address) {
    const normalizedAddress = normalizeOwnerAddress(address)
    if (!normalizedAddress) return false
    const sessions = this.#sessions.get(channelKey)
    if (!sessions) return false
    return [...sessions.values()].some(
      session => session.address === normalizedAddress
    )
  }

  #upsertProfile(channelKey, address, options = {}, now = Date.now()) {
    const normalizedAddress = normalizeOwnerAddress(address)
    if (!normalizedAddress) return false
    const hasDisplayName = Object.prototype.hasOwnProperty.call(
      options,
      'displayName'
    )
    const hasAvatar = Object.prototype.hasOwnProperty.call(options, 'avatar')
    const profileUpdatedAt = Number(options.profileUpdatedAt)
    const hasProfileUpdatedAt =
      Number.isFinite(profileUpdatedAt) && profileUpdatedAt > 0
    if (!hasDisplayName && !hasAvatar && !hasProfileUpdatedAt) return false

    const profiles = this.#getProfileMap(channelKey)
    const previous = profiles.get(normalizedAddress)
    const nextUpdatedAt = hasProfileUpdatedAt
      ? Math.floor(profileUpdatedAt)
      : now
    if (
      previous?.profileUpdatedAt &&
      hasProfileUpdatedAt &&
      nextUpdatedAt < previous.profileUpdatedAt
    ) {
      return false
    }

    const next = {
      address: normalizedAddress,
      displayName: previous?.displayName || '',
      avatar: previous?.avatar || '',
      profileUpdatedAt: nextUpdatedAt,
      lastSeen: now,
    }
    if (hasDisplayName) {
      next.displayName = normalizeChannelDisplayName(
        options.displayName,
        normalizedAddress
      )
    }
    if (hasAvatar) next.avatar = normalizeChannelAvatar(options.avatar)
    if (
      previous?.profileUpdatedAt &&
      hasProfileUpdatedAt &&
      nextUpdatedAt === previous.profileUpdatedAt &&
      (previous.displayName !== next.displayName ||
        previous.avatar !== next.avatar)
    ) {
      return false
    }

    const changed =
      !previous ||
      previous.displayName !== next.displayName ||
      previous.avatar !== next.avatar ||
      previous.profileUpdatedAt !== next.profileUpdatedAt
    profiles.set(normalizedAddress, next)
    return changed
  }

  #emit(channelKey, address, status) {
    const event = this.format(channelKey, address, status)
    if (event) this.#emitPresence(event)
    return event
  }
}
