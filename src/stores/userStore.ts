import { create } from 'zustand'
import {
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
import { mostWallet } from '~server/src/utils/mostWallet.js'
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
  username: string
  address: string
  device: DeviceCredential
  syncKey: string
  syncTopic: string
  publicKeys?: { x25519: string; ed25519: string }
  iterations?: number
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
  previewLoginIdentity: () => Pick<UserIdentity, 'username' | 'address'> | null
  loginUser: () => Promise<UserIdentity | null>
  setUserIdentity: (identity: UserIdentity, seed?: string) => void
  logoutUser: () => void
  unlockSeed: () => Promise<string | null>
  submitUnlock: (password: string) => void
  cancelUnlock: () => void
  renewDeviceCertIfNeeded: () => Promise<void>
}

let unlockWaiters: Array<(seed: string | null) => void> = []

function settleUnlock(seed: string | null) {
  const waiters = unlockWaiters
  unlockWaiters = []
  for (const resolve of waiters) resolve(seed)
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
  const iterations = Number(value.iterations)
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
    iterations: Number.isSafeInteger(iterations) ? iterations : undefined,
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

  previewLoginIdentity: () => {
    const { loginUsername, loginPassword } = get()
    if (!loginUsername.trim() || !loginPassword.trim()) {
      set({ loginError: 'login.error.credentialsRequired' })
      return null
    }
    const identity = createLoginIdentity(loginUsername.trim(), loginPassword)
    set({
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
      const { identity, danger } = await createLoginSession(
        loginUsername.trim(),
        loginPassword
      )
      saveIdentity(identity)
      set({
        identity,
        wallet: identity,
        seed: danger,
        showLoginModal: false,
        ...resetLoginForm(),
      })
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
      unlockOpen: false,
      unlockError: '',
    })
  },

  unlockSeed: () => {
    const { seed, identity } = get()
    if (seed) return Promise.resolve(seed)
    if (!identity) return Promise.resolve(null)
    return new Promise(resolve => {
      unlockWaiters.push(resolve)
      set({ unlockOpen: true, unlockError: '' })
    })
  },

  submitUnlock: password => {
    const { identity } = get()
    if (!identity || !password) {
      set({ unlockError: 'unlock.error.passwordRequired' })
      return
    }
    try {
      const wallet = mostWallet(
        identity.username,
        password,
        identity.iterations
      )
      if (wallet.address.toLowerCase() !== identity.address.toLowerCase()) {
        set({ unlockError: 'unlock.error.wrongPassword' })
        return
      }
      set({ seed: wallet.danger, unlockOpen: false, unlockError: '' })
      settleUnlock(wallet.danger)
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
