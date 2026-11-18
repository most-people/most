import { create } from 'zustand'
import {
  IDENTITY_VERSION,
  createLoginIdentity,
  createLoginSession,
  loadIdentity,
  clearIdentity,
  saveIdentity,
} from '~server/src/utils/userIdentity.js'
import {
  issueDeviceCert,
  readDeviceCertExpiry,
} from '~server/src/utils/auth.js'
import {
  chatAccountFromSeed,
  deriveChatSeed,
} from '~server/src/utils/chatIdentity.js'
import { mostWallet } from '~server/src/utils/mostWallet.js'
import { api } from '~server/src/utils/api'
import type { ChatJoinInvitePayload } from '~/lib/chatJoinInvite'
import type { MessageKey } from '~/lib/i18n'
import { normalizeLocalizedTag, type LocalizedTag } from '~/lib/localizedTag'

type UserIdentityTheme = NonNullable<ChatJoinInvitePayload['theme']>

const DEVICE_CERT_RENEW_BEFORE_MS = 3 * 24 * 60 * 60 * 1000

export interface DeviceCredential {
  publicKey: string
  secretKey: string
  cert: string
}

/** 持久化的身份只含设备密钥证书和子密钥，不含账号种子。 */
export interface UserIdentity {
  /** v2 chat identity; stored identities without it sign in again. */
  version: number
  username: string
  address: string
  device: DeviceCredential
  syncKey: string
  syncTopic: string
  publicKeys?: { x25519: string; ed25519: string }
  displayName?: string
  logo?: string
  logo_dark?: string
  data?: string
  avatar?: string
  tag?: LocalizedTag | null
  profileUpdatedAt?: number
  theme?: UserIdentityTheme
}

interface UserState {
  identity: UserIdentity | null
  wallet?: UserIdentity
  firstPath: string
  showLoginModal: boolean
  loginUsername: string
  loginPassword: string
  showPassword: boolean
  loginPreviewAddress: string
  hasPreviewedAvatar: boolean
  loginLoading: boolean
  loginError: MessageKey | ''
  /** v1 wallet seed, in memory only, to open account backups made before v2. */
  legacySeed: string | null
  seed: string | null
  unlockOpen: boolean
  unlockError: MessageKey | ''
  setFirstPath: (path: string) => void
  initializeUser: () => void
  openLoginModal: () => void
  closeLoginModal: () => void
  setLoginUsername: (username: string) => void
  setLoginPassword: (password: string) => void
  togglePassword: () => void
  previewLoginIdentity: () => Promise<Pick<
    UserIdentity,
    'username' | 'address'
  > | null>
  loginUser: () => Promise<UserIdentity | null>
  setUserIdentity: (identity: UserIdentity, seed?: string) => void
  logoutUser: () => void
  unlockSeed: () => Promise<string | null>
  submitUnlock: (password: string) => Promise<void>
  cancelUnlock: () => void
  renewDeviceCertIfNeeded: () => Promise<void>
}

let unlockWaiters: Array<(seed: string | null) => void> = []
let inviteCheckRunning = false

function settleUnlock(seed: string | null) {
  const waiters = unlockWaiters
  unlockWaiters = []
  for (const resolve of waiters) resolve(seed)
}

// 邀请链接身份由 uid 和空密码生成，用户不知道也无法输入“密码”。
async function deriveEmptyPasswordSeed(identity: UserIdentity) {
  try {
    const seed = await deriveChatSeed(identity.username, '')
    return chatAccountFromSeed(seed).address.toLowerCase() ===
      identity.address.toLowerCase()
      ? seed
      : null
  } catch {
    return null
  }
}

/**
 * Hands the v1 account's data on the connected node to the v2 identity
 * (POST /api/user/migrate). Best effort: an empty v1 account is a no-op, and
 * a node that is not reachable now keeps the old data until the next login.
 */
export async function migrateLegacyAccount(migration?: {
  oldAddress: string
  signature: string
}) {
  if (!migration) return
  try {
    await api.post('/api/user/migrate', { json: migration }).json()
  } catch {
    // Ignored on purpose; see above.
  }
}

function getDefaultDisplayName(
  identity: Pick<UserIdentity, 'username' | 'address'>
) {
  return `${identity.username}#${identity.address.slice(-4).toUpperCase()}`
}

function getDisplayName(identity: UserIdentity) {
  if (identity.displayName) return identity.displayName
  return getDefaultDisplayName(identity)
}

function normalizeIdentity(input: unknown): UserIdentity | null {
  if (!input || typeof input !== 'object') return null
  const value = input as Partial<UserIdentity>
  const device = value.device
  if (
    value.version !== IDENTITY_VERSION ||
    !value.username ||
    !value.address ||
    !device?.cert ||
    !device.secretKey ||
    !device.publicKey ||
    !value.syncKey ||
    !value.syncTopic
  ) {
    return null
  }
  const address = value.address
  const displayName = getDisplayName(value as UserIdentity)
  const avatar =
    typeof value.avatar === 'string'
      ? value.avatar.trim() || undefined
      : undefined
  const profileUpdatedAt = Number(value.profileUpdatedAt)
  const tag = Object.prototype.hasOwnProperty.call(value, 'tag')
    ? value.tag === null
      ? null
      : normalizeLocalizedTag(value.tag)
    : undefined
  return {
    version: IDENTITY_VERSION,
    username: value.username,
    address,
    device: {
      publicKey: device.publicKey,
      secretKey: device.secretKey,
      cert: device.cert,
    },
    syncKey: value.syncKey,
    syncTopic: value.syncTopic,
    publicKeys: value.publicKeys,
    displayName,
    logo: typeof value.logo === 'string' ? value.logo : undefined,
    logo_dark:
      typeof value.logo_dark === 'string' ? value.logo_dark : undefined,
    data:
      typeof value.data === 'string'
        ? value.data.trim() || undefined
        : undefined,
    avatar,
    tag,
    profileUpdatedAt:
      Number.isFinite(profileUpdatedAt) && profileUpdatedAt > 0
        ? Math.floor(profileUpdatedAt)
        : undefined,
    theme: value.theme === 'st' ? value.theme : undefined,
  }
}

function resetLoginForm() {
  return {
    loginUsername: '',
    loginPassword: '',
    showPassword: false,
    loginPreviewAddress: '',
    hasPreviewedAvatar: false,
    loginLoading: false,
    loginError: '' as const,
  }
}

export const useUserStore = create<UserState>((set, get) => ({
  identity: null,
  wallet: undefined,
  firstPath: '',
  showLoginModal: false,
  loginUsername: '',
  loginPassword: '',
  showPassword: false,
  loginPreviewAddress: '',
  hasPreviewedAvatar: false,
  loginLoading: false,
  loginError: '',
  seed: null,
  legacySeed: null,
  unlockOpen: false,
  unlockError: '',

  setFirstPath: path => {
    set({ firstPath: path || '/' })
  },

  initializeUser: () => {
    const identity = normalizeIdentity(loadIdentity())
    if (!identity) {
      clearIdentity()
    }
    set({ identity, wallet: identity || undefined, seed: null })
    if (identity) void get().renewDeviceCertIfNeeded()
  },

  openLoginModal: () => {
    set({ showLoginModal: true, loginError: '' })
  },

  closeLoginModal: () => {
    set({ showLoginModal: false, ...resetLoginForm() })
  },

  setLoginUsername: username => {
    set({
      loginUsername: username,
      loginPreviewAddress: '',
      hasPreviewedAvatar: false,
      loginError: '',
    })
  },

  setLoginPassword: password => {
    set({
      loginPassword: password,
      loginPreviewAddress: '',
      hasPreviewedAvatar: false,
      loginError: '',
    })
  },

  togglePassword: () => {
    set(state => ({ showPassword: !state.showPassword }))
  },

  previewLoginIdentity: async () => {
    const { loginUsername, loginPassword } = get()
    if (!loginUsername.trim() || !loginPassword.trim()) {
      set({ loginError: 'login.error.credentialsRequired' })
      return null
    }
    set({ loginLoading: true, loginError: '' })
    const identity = await createLoginIdentity(
      loginUsername.trim(),
      loginPassword
    )
    set({
      loginLoading: false,
      loginPreviewAddress: identity.address,
      hasPreviewedAvatar: true,
      loginError: '',
    })
    return { username: identity.username, address: identity.address }
  },

  loginUser: async () => {
    const { loginUsername, loginPassword, hasPreviewedAvatar } = get()
    if (!loginUsername.trim() || !loginPassword.trim()) {
      set({ loginError: 'login.error.credentialsRequired' })
      return null
    }
    if (!hasPreviewedAvatar) {
      set({ loginError: 'login.error.previewRequired' })
      return null
    }

    set({ loginLoading: true, loginError: '' })
    try {
      const { identity, danger, legacySeed, migration } =
        await createLoginSession(loginUsername.trim(), loginPassword)
      saveIdentity(identity)
      set({
        identity,
        wallet: identity,
        seed: danger,
        legacySeed,
        showLoginModal: false,
        ...resetLoginForm(),
      })
      void migrateLegacyAccount(migration)
      return identity
    } catch {
      set({
        loginLoading: false,
        loginError: 'login.error.failed',
      })
      return null
    }
  },

  setUserIdentity: (identity, seed) => {
    const nextIdentity = normalizeIdentity(identity)
    if (!nextIdentity) return
    saveIdentity(nextIdentity)
    set(state => ({
      identity: nextIdentity,
      wallet: nextIdentity,
      seed: seed ?? state.seed,
    }))
  },

  logoutUser: () => {
    clearIdentity()
    settleUnlock(null)
    set({
      identity: null,
      wallet: undefined,
      seed: null,
      legacySeed: null,
      unlockOpen: false,
      unlockError: '',
    })
  },

  unlockSeed: () => {
    const { seed, identity } = get()
    if (seed) return Promise.resolve(seed)
    if (!identity) return Promise.resolve(null)
    // Register the caller first, so logging out or cancelling during the
    // invite check below still settles it.
    const pending = new Promise<string | null>(resolve => {
      unlockWaiters.push(resolve)
    })
    if (!inviteCheckRunning) {
      inviteCheckRunning = true
      void deriveEmptyPasswordSeed(identity).then(inviteSeed => {
        inviteCheckRunning = false
        if (get().identity !== identity || unlockWaiters.length === 0) return
        if (inviteSeed) {
          set({ seed: inviteSeed })
          settleUnlock(inviteSeed)
        } else {
          set({ unlockOpen: true, unlockError: '' })
        }
      })
    }
    return pending
  },

  submitUnlock: async password => {
    const { identity } = get()
    if (!identity || !password) {
      set({ unlockError: 'unlock.error.passwordRequired' })
      return
    }
    try {
      const seed = await deriveChatSeed(identity.username, password)
      const { address } = chatAccountFromSeed(seed)
      if (address.toLowerCase() !== identity.address.toLowerCase()) {
        set({ unlockError: 'unlock.error.wrongPassword' })
        return
      }
      set({
        seed,
        legacySeed: mostWallet(identity.username, password).danger,
        unlockOpen: false,
        unlockError: '',
      })
      settleUnlock(seed)
    } catch {
      set({ unlockError: 'unlock.error.wrongPassword' })
    }
  },

  cancelUnlock: () => {
    set({ unlockOpen: false, unlockError: '' })
    settleUnlock(null)
  },

  renewDeviceCertIfNeeded: async () => {
    const { identity } = get()
    if (!identity) return
    const expiresAt = readDeviceCertExpiry(identity.device.cert)
    if (expiresAt - Date.now() > DEVICE_CERT_RENEW_BEFORE_MS) return
    const seed = await get().unlockSeed()
    const current = get().identity
    if (!seed || !current || current.address !== identity.address) return
    const cert = await issueDeviceCert(seed, current.device.publicKey)
    const renewed = { ...current, device: { ...current.device, cert } }
    saveIdentity(renewed)
    set({ identity: renewed, wallet: renewed })
  },
}))
