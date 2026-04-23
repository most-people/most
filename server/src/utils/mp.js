import { getBytes, ZeroAddress } from 'ethers'
import dayjs from 'dayjs'
import nacl from 'tweetnacl'
import { generateAvatar } from './avatar.js'

const BASE36_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'

// Ed25519 变长整型编码（protobuf varint）
const encodeVarint = (value) => {
  const bytes = []
  while (value >= 0x80) {
    bytes.push((value & 0x7f) | 0x80)
    value >>= 7
  }
  bytes.push(value)
  return bytes
}

// Ed25519 libp2p-protobuf-cleartext 公钥
const marshalLibp2pPublicKeyEd25519 = (publicKey) => {
  const header = new Uint8Array([
    0x08,
    0x01,
    0x12,
    ...encodeVarint(publicKey.length),
  ])
  const out = new Uint8Array(header.length + publicKey.length)
  out.set(header, 0)
  out.set(publicKey, header.length)
  return out
}

// 通用 BaseX 编码（用于 base36）
const baseXEncode = (bytes, alphabet) => {
  if (bytes.length === 0) return ''
  const base = alphabet.length
  let zeros = 0
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++

  const digits = [0]
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i]
    for (let j = 0; j < digits.length; j++) {
      const val = digits[j] * 256 + carry
      digits[j] = val % base
      carry = Math.floor(val / base)
    }
    while (carry > 0) {
      digits.push(carry % base)
      carry = Math.floor(carry / base)
    }
  }

  let result = ''
  for (let i = 0; i < zeros; i++) result += alphabet[0]
  for (let i = digits.length - 1; i >= 0; i--) result += alphabet[digits[i]]
  return result
}

export const getEdKeyPair = (private_key, ed_public_key) => {
  const public_key = ed_public_key.slice(2)
  const secretKey = new Uint8Array(getBytes(private_key + public_key))
  return nacl.sign.keyPair.fromSecretKey(secretKey)
}

export const getIPNS = (private_key, ed_public_key) => {
  const EdKeyPair = getEdKeyPair(private_key, ed_public_key)
  const pubProto = marshalLibp2pPublicKeyEd25519(EdKeyPair.publicKey)
  const mh = new Uint8Array(2 + pubProto.length)
  mh[0] = 0x00
  mh[1] = 0x24
  mh.set(pubProto, 2)
  const cidHeader = new Uint8Array([0x01, 0x72])
  const cidBytes = new Uint8Array(cidHeader.length + mh.length)
  cidBytes.set(cidHeader, 0)
  cidBytes.set(mh, cidHeader.length)
  return 'k' + baseXEncode(cidBytes, BASE36_ALPHABET)
}

export const formatTime = (time) => {
  if (!time) return ''
  const date = dayjs(Number(time))
  const hour = date.hour()
  let timeOfDay
  if (hour >= 0 && hour < 3) {
    timeOfDay = '凌晨'
  } else if (hour >= 3 && hour < 6) {
    timeOfDay = '拂晓'
  } else if (hour >= 6 && hour < 9) {
    timeOfDay = '早晨'
  } else if (hour >= 9 && hour < 12) {
    timeOfDay = '上午'
  } else if (hour >= 12 && hour < 15) {
    timeOfDay = '下午'
  } else if (hour >= 15 && hour < 18) {
    timeOfDay = '傍晚'
  } else if (hour >= 18 && hour < 21) {
    timeOfDay = '薄暮'
  } else {
    timeOfDay = '深夜'
  }
  return date.format(`YYYY年M月D日 ${timeOfDay}h点`)
}

export const avatar = generateAvatar

export { ZeroAddress }

const mp = {
  avatar: generateAvatar,
  formatTime,
  getEdKeyPair,
  getIPNS,
  ZeroAddress,
}

export default mp
