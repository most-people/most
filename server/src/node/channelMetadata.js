import path from 'node:path'

import { CHANNEL_NAME_REGEX } from '../config.js'
import {
  buildChannelKey,
  normalizeChannelId,
  normalizeChannelKey,
  uniqueStrings,
} from '../core/channelIdentity.js'
import { normalizeOwnerAddress } from '../core/ownerMetadata.js'
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
        .reduce(mergeDuplicateChannel, [])
    },
  })
}

// 旧版本并发创建可能留下同一 channelKey 的多条记录：保留第一条作为本地写入者，
// 其余记录的写入 core 并入 writerCoreKeys，成员、备注和置顶按地址合并。
function mergeDuplicateChannel(channels, channel) {
  const existing = channels.find(item => item.channelKey === channel.channelKey)
  if (!existing) {
    channels.push(channel)
    return channels
  }

  existing.writerCoreKeys = uniqueStrings([
    ...existing.writerCoreKeys,
    ...channel.writerCoreKeys,
    channel.localWriterCoreKey,
  ])
  existing.members = mergeMembers(existing.members, channel.members)
  existing.remarks = mergeAddressMap(existing.remarks, channel.remarks)
  existing.pinnedBy = mergeAddressMap(existing.pinnedBy, channel.pinnedBy)
  if (channel.createdAt && !(existing.createdAt <= channel.createdAt)) {
    existing.createdAt = channel.createdAt
  }
  if (
    channel.lastMessageAt &&
    !(existing.lastMessageAt >= channel.lastMessageAt)
  ) {
    existing.lastMessageAt = channel.lastMessageAt
  }
  return channels
}

function mergeMembers(current, incoming) {
  const members = Array.isArray(current) ? [...current] : []
  for (const member of Array.isArray(incoming) ? incoming : []) {
    const address = normalizeOwnerAddress(member?.address)
    if (!address) continue
    if (
      !members.some(item => normalizeOwnerAddress(item?.address) === address)
    ) {
      members.push(member)
    }
  }
  return members
}

function mergeAddressMap(current, incoming) {
  if (!incoming || typeof incoming !== 'object') return current
  return {
    ...incoming,
    ...(current && typeof current === 'object' ? current : {}),
  }
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
