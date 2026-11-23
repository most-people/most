import path from 'node:path'

import b4a from 'b4a'
import { uniqueStrings } from '../core/channelIdentity.js'
import {
  channelIdFromKey,
  resolveChannelHandle,
} from '../core/channelKeysV2.js'
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
        .map(normalizeChannelRecord)
        .filter(Boolean)
        .reduce(mergeDuplicateChannel, [])
    },
  })
}

const HEX_64_REGEX = /^[0-9a-f]{64}$/

// v2 records carry the channel secret key and derive the public channel key
// from it. v1 records (no secretKey) are migrated: the old ID is resolved as a
// channel handle (channel-keys.md §3.1, §7); its writer cores stay readable and
// a new v2 writer core is opened on next start.
function normalizeChannelRecord(channel) {
  const writerCoreKeys = uniqueStrings(channel.writerCoreKeys)
  if (
    typeof channel.secretKey === 'string' &&
    HEX_64_REGEX.test(channel.secretKey)
  ) {
    const channelKey = channelIdFromKey(b4a.from(channel.secretKey, 'hex'))
    if (channel.channelKey !== channelKey || !channel.channelId) return null
    return {
      ...channel,
      name: channel.channelId,
      writerGeneration: Number.isInteger(channel.writerGeneration)
        ? channel.writerGeneration
        : 0,
      writerCoreKeys,
    }
  }

  const resolved = resolveChannelHandle(channel.channelId)
  if (!resolved) return null
  const rest = { ...channel }
  delete rest.writerId
  return {
    ...rest,
    channelId: resolved.handle,
    channelKey: resolved.channelKey,
    name: resolved.handle,
    secretKey: b4a.toString(resolved.key, 'hex'),
    kind: resolved.kind,
    writerGeneration: 0,
    localWriterCoreKey: '',
    writerCoreKeys: [],
    legacyOwners: uniqueStrings(
      (channel.members || []).map(m => normalizeOwnerAddress(m?.address))
    ),
    legacyWriterCoreKeys: uniqueStrings([
      ...writerCoreKeys,
      channel.localWriterCoreKey,
    ]),
  }
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
  if (channel.legacyWriterCoreKeys) {
    existing.legacyWriterCoreKeys = uniqueStrings([
      ...(existing.legacyWriterCoreKeys || []),
      ...channel.legacyWriterCoreKeys,
    ])
    existing.legacyOwners = uniqueStrings([
      ...(existing.legacyOwners || []),
      ...channel.legacyOwners,
    ])
  }
  existing.remarks = mergeAddressMap(existing.remarks, channel.remarks)
  existing.pinnedBy = mergeAddressMap(existing.pinnedBy, channel.pinnedBy)
  const foldedBy = mergeAddressMap(existing.foldedBy, channel.foldedBy)
  if (foldedBy) existing.foldedBy = foldedBy
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
      secretKey: channel.secretKey,
      kind: channel.kind,
      type: channel.type,
      createdAt: channel.createdAt,
      lastMessageAt: channel.lastMessageAt || '',
      writerGeneration: channel.writerGeneration || 0,
      localWriterCoreKey: channel.localWriterCoreKey,
      writerCoreKeys: uniqueStrings(channel.writerCoreKeys),
      legacyWriterCoreKeys: channel.legacyWriterCoreKeys,
      legacyOwners: channel.legacyOwners,
      members: Array.isArray(channel.members) ? channel.members : [],
      remarks: channel.remarks,
      pinnedBy: channel.pinnedBy,
      foldedBy: channel.foldedBy,
    })),
    null,
    2
  )
}
