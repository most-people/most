import { create } from 'zustand'
import {
  createLoginIdentity,
  loadIdentity,
  clearIdentity,
  saveIdentity,
} from '~/server/src/utils/userIdentity.js'

export interface UserIdentity {
  username: string
  address: string
  danger: string
  displayName?: string
  password?: string
}

interface UserState {
  identity: UserIdentity | null
  wallet?: UserIdentity
  showLoginModal: boolean
  loginUsername: string
  loginPassword: string
  showPassword: boolean
  loginPreviewAddress: string
  hasPreviewedAvatar: boolean
  loginLoading: boolean
  loginError: string
  initializeUser: () => void
  openLoginModal: () => void
  closeLoginModal: () => void
  setLoginUsername: (username: string) => void
  setLoginPassword: (password: string) => void
  togglePassword: () => void
  previewLoginIdentity: () => UserIdentity | null
  loginUser: () => UserIdentity | null
  setUserIdentity: (identity: UserIdentity) => void
  logoutUser: () => void
}

function getDisplayName(identity: UserIdentity) {
  if (identity.displayName) return identity.displayName
  return `${identity.username}#${identity.address.slice(-4).toUpperCase()}`
}

function normalizeIdentity(input: unknown): UserIdentity | null {
  if (!input || typeof input !== 'object') return null
  const value = input as Partial<UserIdentity>
  if (!value.username || !value.address || !value.danger) return null
  if (value.username === '匿名') return null
  return {
    username: value.username,
    address: value.address,
    danger: value.danger,
    password: value.password,
    displayName: getDisplayName(value as UserIdentity),
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
    loginError: '',
  }
}

export const useUserStore = create<UserState>((set, get) => ({
  identity: null,
  wallet: undefined,
  showLoginModal: false,
  loginUsername: '',
  loginPassword: '',
  showPassword: false,
  loginPreviewAddress: '',
  hasPreviewedAvatar: false,
  loginLoading: false,
  loginError: '',

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
      set({ loginError: '请输入用户名和密码' })
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
      set({ loginError: '请输入用户名和密码' })
      return null
    }
    if (!hasPreviewedAvatar) {
      set({ loginError: '请先预览并确认头像' })
      return null
    }

    set({ loginLoading: true, loginError: '' })
    try {
      const nextIdentity = createLoginIdentity(loginUsername.trim(), loginPassword)
      saveIdentity(nextIdentity)
      set({
        identity: nextIdentity,
        wallet: nextIdentity,
        showLoginModal: false,
        ...resetLoginForm(),
      })
      return nextIdentity
    } catch (error) {
      set({
        loginLoading: false,
        loginError: error instanceof Error ? error.message : '登录失败',
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

  logoutUser: () => {
    clearIdentity()
    set({ identity: null, wallet: undefined })
  },
}))
