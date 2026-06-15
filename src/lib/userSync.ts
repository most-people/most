import { concat, getBytes, sha256, toUtf8Bytes } from 'ethers'
import { api } from '~server/src/utils/api'
import { channelApi } from '~/lib/channelApi'
import type { UserIdentity } from '~/stores/userStore'

export interface UserSyncStatus {
  success?: boolean
  enabled: boolean
  ownerAddress: string
  syncName: string
  syncId: string
  peerCount: number
  writerCoreKeys: string[]
  localWriterCoreKey: string
  lastSyncedAt: string
}

function deriveHex(identity: UserIdentity, label: string) {
  return sha256(
    concat([
      getBytes(identity.danger),
      toUtf8Bytes(`mostbox:user-sync:v1:${identity.address.toLowerCase()}:${label}`),
    ])
  )
}

export function deriveUserSyncKeys(identity: UserIdentity) {
  return {
    syncTopicKey: deriveHex(identity, 'topic'),
    syncCipherKey: deriveHex(identity, 'cipher'),
    syncMacKey: deriveHex(identity, 'mac'),
  }
}

export function startUserMetadataSync(identity: UserIdentity) {
  return api
    .post<UserSyncStatus>('/api/user/sync/start', {
      json: deriveUserSyncKeys(identity),
    })
    .json()
}

export function getUserMetadataSyncStatus() {
  return api.get<UserSyncStatus>('/api/user/sync/status').json()
}

export function getUserDisplayName(identity: UserIdentity) {
  return identity.displayName || identity.username
}

export function getUserChannelProfile(identity: UserIdentity) {
  return {
    displayName: getUserDisplayName(identity),
    avatar: identity.avatar || '',
  }
}

export function getUserMessageIdentity(identity: UserIdentity) {
  return {
    author: identity.address,
    authorName: getUserDisplayName(identity),
    avatar: identity.avatar || '',
  }
}

export async function refreshJoinedChannelProfiles(identity: UserIdentity) {
  const profile = getUserChannelProfile(identity)
  const channels = (await channelApi.getChannels()).filter(
    channel => channel.name || channel.channelId || channel.channelKey
  )
  const results = await Promise.allSettled(
    channels.map(channel =>
      channelApi.createChannel(
        channel.name || channel.channelId || channel.channelKey || '',
        channel.type || 'personal',
        profile
      )
    )
  )
  const failed = results.find(
    result => result.status === 'rejected'
  ) as PromiseRejectedResult | undefined
  if (failed) {
    throw failed.reason instanceof Error
      ? failed.reason
      : new Error('Failed to refresh joined channel profiles')
  }
  return { updated: channels.length }
}

export async function syncUserProfileMetadata(identity: UserIdentity) {
  await startUserMetadataSync(identity)
  return refreshJoinedChannelProfiles(identity)
}
