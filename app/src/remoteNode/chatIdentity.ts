// v2 chat identity in JavaScript (docs/protocol/v2/signatures.md §7), the same
// as server/src/utils/chatIdentity.js. Used by the app's web build only: on
// phones the seed comes from the Bare core (native libsodium), because scrypt
// in Hermes takes tens of seconds.
import { concat, getBytes, hexlify, scrypt, sha256, toUtf8Bytes } from 'ethers'

const CHAT_IDENTITY_LOG_N = 17

function label(purpose: string) {
  return toUtf8Bytes(`most/v2/${purpose}\0`)
}

export async function deriveChatSeedJs(username: string, password: string) {
  return hexlify(
    await scrypt(
      getBytes(concat([label('password'), toUtf8Bytes(password)])),
      getBytes(sha256(concat([label('identity'), toUtf8Bytes(username)]))),
      2 ** CHAT_IDENTITY_LOG_N,
      8,
      1,
      32
    )
  )
}
