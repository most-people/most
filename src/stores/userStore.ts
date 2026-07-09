import { create } from 'zustand'
import {
  createLoginIdentity,
  loadIdentity,
  clearIdentity,
  saveIdentity,
} from '~server/src/utils/userIdentity.js'
import type { ChatJoinInvitePayload } from '~/lib/chatJoinInvite'
import type { MessageKey } from '~/lib/i18n'
import { normalizeLocalizedTag, type LocalizedTag } from '~/lib/localizedTag'

type UserIdentityTheme = NonNullable<ChatJoinInvitePayload['theme']>

export interface UserIdentity {
  username: string
  address: string
  danger: string
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
  pendingCloudRestoreAddress: string | null
  setFirstPath: (path: string) => void
  initializeUser: () => void
  openLoginModal: () => void
  closeLoginModal: () => void
  setLoginUsername: (username: string) => void
  setLoginPassword: (password: string) => void
  togglePassword: () => void
  previewLoginIdentity: () => UserIdentity | null
  loginUser: () => UserIdentity | null
  setUserIdentity: (identity: UserIdentity) => void
  consumePendingCloudRestore: (address: string) => boolean
  logoutUser: () => void
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
  if (!value.username || !value.address || !value.danger) return null
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
    username: value.username,
    address,
    danger: value.danger,
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
    theme: value.theme === 'sparkbit' ? value.theme : undefined,
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
  pendingCloudRestoreAddress: null,

  setFirstPath: path => {
    set({ firstPath: path || '/' })
  },

  initializeUser: () => {
    const identity = normalizeIdentity(loadIdentity())
    if (!identity) {
      clearIdentity()
    }
    set({ identity, wallet: identity || undefined })
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
    return identity
  },

  loginUser: () => {
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
      const nextIdentity = createLoginIdentity(
        loginUsername.trim(),
        loginPassword
      )
      saveIdentity(nextIdentity)
      set({
        identity: nextIdentity,
        wallet: nextIdentity,
        pendingCloudRestoreAddress: nextIdentity.address,
        showLoginModal: false,
        ...resetLoginForm(),
      })
      return nextIdentity
    } catch {
      set({
        loginLoading: false,
        loginError: 'login.error.failed',
      })
      return null
    }
  },

  setUserIdentity: identity => {
    const nextIdentity = normalizeIdentity(identity)
    if (!nextIdentity) return
    saveIdentity(nextIdentity)
    set({ identity: nextIdentity, wallet: nextIdentity })
  },

  consumePendingCloudRestore: address => {
    const pendingAddress = get().pendingCloudRestoreAddress
    if (!pendingAddress) return false
    if (pendingAddress.toLowerCase() !== address.toLowerCase()) return false
    set({ pendingCloudRestoreAddress: null })
    return true
  },

  logoutUser: () => {
    clearIdentity()
    set({ identity: null, wallet: undefined, pendingCloudRestoreAddress: null })
  },
}))
