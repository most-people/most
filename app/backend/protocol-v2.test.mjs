// Checks the mobile protocol v2 primitives against the shared vectors in
// docs/protocol/vectors/v2/. The desktop test reads the same files.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import b4a from 'b4a'
import { H, KDF, MAC, label } from './protocol-v2.mjs'

function readVectors(name) {
  const url = new URL(`../../docs/protocol/vectors/v2/${name}`, import.meta.url)
  return JSON.parse(fs.readFileSync(url, 'utf8'))
}

function parts(list) {
  return list.map(part =>
    part.utf8 !== undefined
      ? b4a.from(part.utf8, 'utf8')
      : b4a.from(part.hex, 'hex')
  )
}

const hex = bytes => b4a.toString(bytes, 'hex')

describe('protocol v2 primitives (mobile core)', () => {
  const vectors = readVectors('envelope.json')

  it('builds labels and rejects invalid purposes', () => {
    for (const item of vectors.labels) {
      assert.equal(hex(label(item.purpose)), item.label)
    }
    for (const purpose of vectors.invalidPurposes) {
      assert.throws(() => label(purpose), TypeError, JSON.stringify(purpose))
    }
  })

  it('computes H, MAC and KDF', () => {
    for (const item of vectors.H) {
      assert.equal(hex(H(item.purpose, ...parts(item.parts))), item.output)
    }
    for (const item of vectors.MAC) {
      const key = b4a.from(item.key, 'hex')
      assert.equal(
        hex(MAC(key, item.purpose, ...parts(item.parts))),
        item.output
      )
    }
    for (const item of vectors.KDF) {
      const key = b4a.from(item.key, 'hex')
      assert.equal(hex(KDF(key, item.purpose)), item.output)
    }
  })
})
