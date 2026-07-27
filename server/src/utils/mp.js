import { getBytes } from 'ethers'
import nacl from 'tweetnacl'
import { generateAvatar } from './avatar.js'
import { formatTime } from './dateTime.js'

export const getEdKeyPair = (private_key, ed_public_key) => {
  const public_key = ed_public_key.slice(2)
  const secretKey = new Uint8Array(getBytes(private_key + public_key))
  return nacl.sign.keyPair.fromSecretKey(secretKey)
}

export const avatar = generateAvatar
export { formatTime }
