export function getChannelSubscriptionNames(
  channelName = '',
  extraSubscribedChannelNames = []
) {
  const names = [channelName, ...extraSubscribedChannelNames]
  return [...new Set(names.filter(Boolean))]
}

export function getChannelSubscriptionKey(extraSubscribedChannelNames = []) {
  return getChannelSubscriptionNames('', extraSubscribedChannelNames).join('\n')
}

export function getChannelSubscriptionChanges(previousNames, nextNames) {
  const previous = new Set(previousNames)
  const next = new Set(nextNames)
  return {
    subscribe: [...next].filter(name => !previous.has(name)),
    unsubscribe: [...previous].filter(name => !next.has(name)),
  }
}
