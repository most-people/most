export const CHAT_READ_STORAGE_PREFIX = 'mostbox.chat.lastReadAt'

export function getChannelActivityTime(channel) {
  return (
    Date.parse(channel?.lastMessageAt || '') ||
    Date.parse(channel?.createdAt || '') ||
    0
  )
}

export function getChatReadStorageKey(address) {
  const normalizedAddress = String(address || '').trim().toLowerCase()
  return normalizedAddress
    ? `${CHAT_READ_STORAGE_PREFIX}:${normalizedAddress}`
    : ''
}

export function getChannelReadTimestamp(timestamp, now = Date.now()) {
  const value = Number(timestamp)
  const nextValue = Number.isFinite(value) && value > 0 ? value : now
  return Math.max(0, Math.floor(nextValue))
}

export function readStoredChannelLastReadAt(storageKey, storage = getStorage()) {
  if (!storageKey || !storage) return {}
  try {
    const value = storage.getItem(storageKey)
    if (!value) return {}
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object') return {}

    return Object.entries(parsed).reduce((result, [name, timestamp]) => {
      const value = Number(timestamp)
      if (name && Number.isFinite(value) && value >= 0) {
        result[name] = value
      }
      return result
    }, {})
  } catch {
    return {}
  }
}

export function writeStoredChannelLastReadAt(
  storageKey,
  value,
  storage = getStorage()
) {
  if (!storageKey || !storage) return
  try {
    storage.setItem(storageKey, JSON.stringify(value))
  } catch {}
}

export function markChannelReadInMap(
  previous,
  channelName,
  timestamp = Date.now(),
  now = Date.now()
) {
  if (!channelName) return { changed: false, value: previous }
  const nextTimestamp = getChannelReadTimestamp(timestamp, now)
  if ((previous[channelName] || 0) >= nextTimestamp) {
    return { changed: false, value: previous }
  }
  return {
    changed: true,
    value: { ...previous, [channelName]: nextTimestamp },
  }
}

export function initializeChannelLastReadAt(previous, channels, now = Date.now()) {
  let changed = false
  const next = { ...previous }
  for (const channel of channels) {
    const channelKey = channel?.channelKey || channel?.name
    if (!channelKey || next[channelKey] !== undefined) continue
    next[channelKey] = getChannelReadTimestamp(
      getChannelActivityTime(channel),
      now
    )
    changed = true
  }
  return { changed, value: changed ? next : previous }
}

export function applyIncomingChannelMessageReadState(
  previous,
  {
    channelName,
    messageTime,
    activeChannelName = '',
    messageAuthor = '',
    userAddress = '',
    now = Date.now(),
  }
) {
  if (!channelName) {
    return { changed: false, notify: false, value: previous }
  }

  const timestamp = getChannelReadTimestamp(messageTime, now)
  const isActiveChannel = channelName === activeChannelName
  const isSelfMessage =
    String(messageAuthor || '').toLowerCase() ===
    String(userAddress || '').toLowerCase()

  if (isSelfMessage) {
    return {
      ...markChannelReadInMap(previous, channelName, timestamp, now),
      notify: false,
    }
  }

  if (isActiveChannel) {
    return {
      ...markChannelReadInMap(previous, channelName, timestamp, now),
      notify: true,
    }
  }

  const readAt = previous[channelName] || 0
  if (readAt < timestamp) {
    return { changed: false, notify: true, value: previous }
  }

  const nextTimestamp = Math.max(0, timestamp - 1)
  if (readAt === nextTimestamp) {
    return { changed: false, notify: true, value: previous }
  }

  return {
    changed: true,
    notify: true,
    value: { ...previous, [channelName]: nextTimestamp },
  }
}

export function hasUnreadChannelMessage(channel, channelLastReadAt) {
  const channelKey = channel?.channelKey || channel?.name
  const activityTime = getChannelActivityTime(channel)
  return activityTime > (channelLastReadAt[channelKey] || 0)
}

function getStorage() {
  if (typeof window === 'undefined') return undefined
  return window.localStorage
}
