import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildNodeHistory,
  normalizeRemoteNodes,
  saveRemoteNode,
} from './connectionHistory'

describe('remote node history', () => {
  it('normalizes, deduplicates, and caps history at eight nodes', () => {
    const nodes = normalizeRemoteNodes(
      Array.from({ length: 10 }, (_, index) => ({
        url: `https://node-${index}.example.com/`,
        invite: String(index),
        preferred: index === 9,
        updatedAt: index,
      }))
    )
    assert.equal(nodes.length, 8)
    assert.equal(nodes[0].url, 'https://node-9.example.com')
    assert.equal(nodes.filter(node => node.preferred).length, 1)
  })

  it('switches the preferred node and preserves the local entry', () => {
    const first = saveRemoteNode(
      [],
      { url: 'https://one.example.com/base/', invite: 'one' },
      true,
      1
    )
    const nodes = saveRemoteNode(
      first,
      { url: 'http://two.example.com', invite: 'two' },
      true,
      2
    )
    const history = buildNodeHistory(nodes, 'remote', nodes[0].url)
    assert.equal(history[0].local, true)
    assert.equal(history[1].current, true)
    assert.equal(history[1].invite, 'two')
  })
})
