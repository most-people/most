import { randomBytes } from 'node:crypto'
import { mostWallet } from './mostWallet.js'

export function createGuestIdentity(password) {
  const username = '匿名'
  const { address, danger } = mostWallet(username, password)
  return {
    username,
    password,
    address,
    danger,
    displayName: `匿名#${address.slice(2, 8)}`,
  }
}

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

export function generateGuestPassword() {
  return randomBytes(32).toString('hex')
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

export function saveGuestIdentity(guestIdentity) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem('mostbox_guest_identity', JSON.stringify(guestIdentity))
}

export function loadGuestIdentity() {
  if (typeof localStorage === 'undefined') return null
  try {
    const data = localStorage.getItem('mostbox_guest_identity')
    if (!data) return null
    return JSON.parse(data)
  } catch {
    return null
  }
}

export function getDisplayName(address, username = '匿名') {
  if (username === '匿名') {
    return `匿名#${address.slice(2, 8)}`
  }
  return `${username}#${address.slice(-4).toUpperCase()}`
}
