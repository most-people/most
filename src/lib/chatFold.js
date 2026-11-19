/**
 * 频道是否折叠：用户手动设置（folded 为 true/false）优先；
 * 否则无消息且未置顶的群自动折叠。
 */
export function isChannelFolded(channel) {
  if (typeof channel?.folded === 'boolean') return channel.folded
  return !channel?.lastMessageAt && !channel?.pinned
}

/**
 * 按折叠状态拆分已排序的频道列表。
 * 当前打开的自动折叠频道留在用户正在看的视图里，避免刚创建的群立即消失。
 */
export function splitFoldedChannels(
  channels,
  {
    activeKey = '',
    view = 'main',
    getKey = channel => channel?.channelKey,
  } = {}
) {
  const main = []
  const folded = []
  for (const channel of channels) {
    const isActiveAutoFolded =
      Boolean(activeKey) &&
      getKey(channel) === activeKey &&
      typeof channel?.folded !== 'boolean'
    const target =
      isActiveAutoFolded && isChannelFolded(channel)
        ? view === 'folded'
          ? folded
          : main
        : isChannelFolded(channel)
          ? folded
          : main
    target.push(channel)
  }
  return { main, folded }
}
