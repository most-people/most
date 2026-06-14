import crypto from 'node:crypto'

export function createOfflineSwarm() {
  return {
    connections: new Set(),
    keyPair: {
      publicKey: crypto.randomBytes(32),
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
