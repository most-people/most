import path from 'node:path'

import { CHANNEL_NAME_REGEX } from '../config.js'
import {
  buildChannelKey,
  normalizeChannelId,
  normalizeChannelKey,
  uniqueStrings,
} from '../core/channelIdentity.js'
import { readMetadataFile } from './metadataFile.js'

export function getChannelsMetadataPath(dataPath) {
  return path.join(dataPath, 'channels.json')
}

export function getChannelConfigPath(dataPath) {
  return path.join(dataPath, 'channel-config.json')
}

export function loadChannelConfig(dataPath) {
  return readMetadataFile(getChannelConfigPath(dataPath), {
    label: 'channel config',
    fallback: () => ({}),
    parse: data => {
      const parsed = JSON.parse(data)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new TypeError('channel config metadata must be an object')
      }
      return parsed
    },
  })
}

export function loadChannelsMetadata(dataPath) {
  return readMetadataFile(getChannelsMetadataPath(dataPath), {
    label: 'channels',
    fallback: () => [],
    parse: data => {
      const channels = JSON.parse(data)
      if (!Array.isArray(channels)) {
        throw new TypeError('channels metadata must be an array')
      }
      return channels
        .filter(channel => channel && typeof channel === 'object')
        .map(channel => {
          const channelId = normalizeChannelId(channel.channelId)
          const channelKey = normalizeChannelKey(channel.channelKey)
          return {
            ...channel,
            channelId,
            channelKey,
            expectedChannelKey: buildChannelKey(channelId),
            name: channelId,
            writerCoreKeys: uniqueStrings(channel.writerCoreKeys),
          }
        })
        .filter(
          channel =>
            CHANNEL_NAME_REGEX.test(channel.channelId) &&
            channel.channelKey === channel.expectedChannelKey &&
            channel.writerId &&
            channel.localWriterCoreKey
        )
        .map(
          ({ expectedChannelKey: _expectedChannelKey, ...channel }) => channel
        )
    },
  })
}

export function serializeChannelsMetadata(channels) {
  return JSON.stringify(
    channels.map(channel => ({
      channelId: channel.channelId,
      channelKey: channel.channelKey,
      name: channel.channelId,
      type: channel.type,
      createdAt: channel.createdAt,
      lastMessageAt: channel.lastMessageAt || '',
      writerId: channel.writerId,
      localWriterCoreKey: channel.localWriterCoreKey,
      writerCoreKeys: uniqueStrings(channel.writerCoreKeys),
      members: Array.isArray(channel.members) ? channel.members : [],
      remarks: channel.remarks,
      pinnedBy: channel.pinnedBy,
    })),
    null,
    2
  )
}
