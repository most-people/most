import b4a from 'b4a'
import sodium from 'sodium-native'

class SodiumHash {
  #algorithm
  #chunks = []

  constructor(algorithm) {
    this.#algorithm = algorithm
  }

  update(input) {
    this.#chunks.push(b4a.from(input))
    return this
  }

  digest(encoding) {
    const input = b4a.concat(this.#chunks)
    const output = this.#algorithm === 'sha512' ? b4a.alloc(64) : b4a.alloc(32)

    if (this.#algorithm === 'sha512') {
      sodium.crypto_hash_sha512(output, input)
    } else {
      sodium.crypto_hash_sha256(output, input)
    }

    return encoding ? b4a.toString(output, encoding) : output
  }
}

class HmacSha256 {
  #key
  #chunks = []

  constructor(key) {
    const input = b4a.from(key)
    this.#key =
      input.length > 64 ? createHash('sha256').update(input).digest() : input
  }

  update(input) {
    this.#chunks.push(b4a.from(input))
    return this
  }

  digest(encoding) {
    const keyBlock = b4a.alloc(64)
    keyBlock.set(this.#key)

    const innerPad = b4a.alloc(64)
    const outerPad = b4a.alloc(64)
    for (let index = 0; index < keyBlock.length; index += 1) {
      innerPad[index] = keyBlock[index] ^ 0x36
      outerPad[index] = keyBlock[index] ^ 0x5c
    }

    const inner = createHash('sha256')
      .update(innerPad)
      .update(b4a.concat(this.#chunks))
      .digest()
    const output = createHash('sha256').update(outerPad).update(inner).digest()
    return encoding ? b4a.toString(output, encoding) : output
  }
}

export function createHash(algorithm) {
  const normalized = String(algorithm || '').toLowerCase()
  if (normalized !== 'sha256' && normalized !== 'sha512') {
    throw new Error(`Unsupported hash algorithm: ${algorithm}`)
  }
  return new SodiumHash(normalized)
}

export function createHmac(algorithm, key) {
  const normalized = String(algorithm || '').toLowerCase()
  if (normalized !== 'sha256') {
    throw new Error(`Unsupported HMAC algorithm: ${algorithm}`)
  }
  return new HmacSha256(key)
}

export function randomBytes(size) {
  const length = Number(size)
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new RangeError('Random byte size must be a non-negative integer')
  }
  const output = b4a.alloc(length)
  sodium.randombytes_buf(output)
  return output
}

export function timingSafeEqual(left, right) {
  const first = b4a.from(left)
  const second = b4a.from(right)
  if (first.length !== second.length) {
    throw new RangeError('Input buffers must have the same byte length')
  }
  return sodium.sodium_memcmp(first, second)
}

export default {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
}
