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

export interface SyncedUserProfile {
  displayName: string
  avatar: string
  syncUpdatedAt: number
}

export interface UserProfileSyncResult {
  restoredIdentity: UserIdentity | null
  pushed: boolean
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

export function getSyncedUserProfile() {
  return api.get<SyncedUserProfile | null>('/api/user/profile').json()
}

export function getUserDisplayName(identity: UserIdentity) {
  return identity.displayName || identity.username
}

export function getUserProfileSyncKey(identity: UserIdentity) {
  return JSON.stringify([
    identity.address.toLowerCase(),
    getUserDisplayName(identity),
    identity.avatar || '',
  ])
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

function getLocalProfileUpdatedAt(identity: UserIdentity) {
  const value = Number(identity.profileUpdatedAt)
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

function getRemoteProfileUpdatedAt(profile: SyncedUserProfile | null) {
  const value = Number(profile?.syncUpdatedAt)
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

export function saveSyncedUserProfile(identity: UserIdentity) {
  const syncUpdatedAt = getLocalProfileUpdatedAt(identity) || Date.now()
  return api
    .put<{ success: boolean; profile: SyncedUserProfile }>('/api/user/profile', {
      json: {
        displayName: getUserDisplayName(identity),
        avatar: identity.avatar || '',
        syncUpdatedAt,
      },
    })
    .json()
}

function restoreIdentityFromProfile(
  identity: UserIdentity,
  profile: SyncedUserProfile | null
) {
  if (!profile) return null
  const remoteUpdatedAt = getRemoteProfileUpdatedAt(profile)
  if (remoteUpdatedAt <= getLocalProfileUpdatedAt(identity)) return null
  return {
    ...identity,
    displayName: profile.displayName || identity.username,
    avatar: profile.avatar || undefined,
    profileUpdatedAt: remoteUpdatedAt,
  }
}

export async function restoreUserProfileFromSync(identity: UserIdentity) {
  return restoreIdentityFromProfile(identity, await getSyncedUserProfile())
}

export async function reconcileUserProfileSync(
  identity: UserIdentity
): Promise<UserProfileSyncResult> {
  const remoteProfile = await getSyncedUserProfile()
  const restoredIdentity = restoreIdentityFromProfile(identity, remoteProfile)
  if (restoredIdentity) {
    return { restoredIdentity, pushed: false }
  }
  const localUpdatedAt = getLocalProfileUpdatedAt(identity)
  if (
    localUpdatedAt > 0 &&
    localUpdatedAt > getRemoteProfileUpdatedAt(remoteProfile)
  ) {
    await saveSyncedUserProfile(identity)
    return { restoredIdentity: null, pushed: true }
  }
  return { restoredIdentity: null, pushed: false }
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
  await saveSyncedUserProfile(identity)
  return refreshJoinedChannelProfiles(identity)
}
