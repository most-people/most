import { randomBytes } from 'node:crypto'
import { pbkdf2, sha256, getBytes, Mnemonic, HDNodeWallet, toUtf8Bytes } from 'ethers'

const SALT_PREFIX = '/most.box/'
const PBKDF2_ITERATIONS = 3
const PBKDF2_KEY_LENGTH = 32

function generateAddress(username, password) {
  const salt = toUtf8Bytes(SALT_PREFIX + username)
  const p = toUtf8Bytes(password)
  const kdf = pbkdf2(p, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_LENGTH, 'sha512')
  const seed = getBytes(sha256(getBytes(kdf)))
  const mnemonic = Mnemonic.entropyToPhrase(seed)
  const account = HDNodeWallet.fromPhrase(mnemonic)
  return account.address
}

export function createGuestIdentity(password) {
  const username = '匿名'
  const address = generateAddress(username, password)
  return {
    username,
    password,
    address,
    displayName: `匿名#${address.slice(2, 8)}`
  }
}

export function createLoginIdentity(username, password) {
  const address = generateAddress(username, password)
  return {
    username,
    password,
    address,
    displayName: `${username}#${address.slice(-4).toUpperCase()}`
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
