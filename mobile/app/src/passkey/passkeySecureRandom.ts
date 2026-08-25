import * as Crypto from 'expo-crypto'

export function fillPasskeySecureRandom(bytes: Uint8Array<ArrayBuffer>) {
  Crypto.getRandomValues(bytes)
}
