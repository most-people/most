import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildNodeHistory,
  getRemoteUrlCandidates,
  normalizeRemoteUrl,
  normalizeRemoteNodes,
  saveRemoteNode,
} from './connectionHistory'

describe('remote node history', () => {
  it('builds HTTPS-first candidates for addresses without a protocol', () => {
    assert.deepEqual(getRemoteUrlCandidates(' x.most.red:1976/base/ '), [
      'https://x.most.red:1976/base',
      'http://x.most.red:1976/base',
    ])
    assert.equal(
      normalizeRemoteUrl('x.most.red:1976/base/'),
      'https://x.most.red:1976/base'
    )
  })

  it('preserves explicit protocols and rejects invalid node addresses', () => {
    assert.deepEqual(getRemoteUrlCandidates('http://node.example.com/base/'), [
      'http://node.example.com/base',
    ])
    assert.deepEqual(getRemoteUrlCandidates('https://node.example.com/base'), [
      'https://node.example.com/base',
    ])
    assert.deepEqual(getRemoteUrlCandidates('not a host'), [])
    assert.deepEqual(getRemoteUrlCandidates('ftp://node.example.com'), [])
  })

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

  it('deduplicates a bare hostname against its normalized HTTPS URL', () => {
    const nodes = normalizeRemoteNodes([
      {
        url: 'node.example.com/base',
        invite: 'old',
        preferred: false,
        updatedAt: 1,
      },
      {
        url: 'https://node.example.com/base/',
        invite: 'new',
        preferred: true,
        updatedAt: 2,
      },
    ])

    assert.equal(nodes.length, 1)
    assert.equal(nodes[0].url, 'https://node.example.com/base')
    assert.equal(nodes[0].invite, 'new')
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
