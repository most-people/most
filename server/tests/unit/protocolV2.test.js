// Checks the desktop protocol v2 primitives against the shared vectors in
// docs/protocol/vectors/v2/. The mobile core test reads the same files.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { H, KDF, MAC, label } from '../../src/core/protocolV2.js'

function readVectors(name) {
  const url = new URL(
    `../../../docs/protocol/vectors/v2/${name}`,
    import.meta.url
  )
  return JSON.parse(fs.readFileSync(url, 'utf8'))
}

function parts(list) {
  return list.map(part =>
    part.utf8 !== undefined
      ? Buffer.from(part.utf8, 'utf8')
      : Buffer.from(part.hex, 'hex')
  )
}

describe('protocol v2 primitives (desktop)', () => {
  const vectors = readVectors('envelope.json')

  it('builds labels and rejects invalid purposes', () => {
    for (const item of vectors.labels) {
      assert.equal(label(item.purpose).toString('hex'), item.label)
    }
    for (const purpose of vectors.invalidPurposes) {
      assert.throws(() => label(purpose), TypeError, JSON.stringify(purpose))
    }
  })

  it('computes H, MAC and KDF', () => {
    for (const item of vectors.H) {
      assert.equal(
        H(item.purpose, ...parts(item.parts)).toString('hex'),
        item.output
      )
    }
    for (const item of vectors.MAC) {
      const key = Buffer.from(item.key, 'hex')
      assert.equal(
        MAC(key, item.purpose, ...parts(item.parts)).toString('hex'),
        item.output
      )
    }
    for (const item of vectors.KDF) {
      const key = Buffer.from(item.key, 'hex')
      assert.equal(KDF(key, item.purpose).toString('hex'), item.output)
    }
  })
})
