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

export function createHash(algorithm) {
  const normalized = String(algorithm || '').toLowerCase()
  if (normalized !== 'sha256' && normalized !== 'sha512') {
    throw new Error(`Unsupported hash algorithm: ${algorithm}`)
  }
  return new SodiumHash(normalized)
}

export default {
  createHash,
}
