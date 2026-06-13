import { concat, getBytes, sha256, toUtf8Bytes } from 'ethers'
import { api } from '~/server/src/utils/api'
import type { UserIdentity } from '~/app/app/userStore'

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
