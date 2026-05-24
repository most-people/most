import { mostWallet } from './mostWallet.js'

export function createLoginIdentity(username, password) {
  const { address, danger } = mostWallet(username, password)
  return {
    username,
    password,
    address,
    danger,
    displayName: `${username}#${address.slice(-4).toUpperCase()}`,
  }
}

export function loadIdentity() {
  if (typeof localStorage === 'undefined') return null
  try {
    const data = localStorage.getItem('mostbox_identity')
    if (!data) return null
    return JSON.parse(data)
  } catch {
    return null
  }
}

export function saveIdentity(identity) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem('mostbox_identity', JSON.stringify(identity))
}

export function clearIdentity() {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem('mostbox_identity')
  localStorage.removeItem('mostbox_guest_identity')
}

export function getDisplayName(address, username) {
  if (!username) {
    return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : ''
  }
  return `${username}#${address.slice(-4).toUpperCase()}`
}
