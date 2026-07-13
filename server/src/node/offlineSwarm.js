import crypto from 'node:crypto'

export function createOfflineSwarm(seed) {
  return {
    connections: new Set(),
    keyPair: {
      publicKey: seed
        ? crypto.createHash('sha256').update(seed).digest()
        : crypto.randomBytes(32),
    },
    on() {},
    join() {
      return {}
    },
    leave() {
      return Promise.resolve()
    },
    destroy() {
      return Promise.resolve()
    },
  }
}
