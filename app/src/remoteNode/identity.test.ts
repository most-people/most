import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { verifyMessage } from 'ethers'
import {
  buildAuthMessage,
  buildMobileAuthHeader,
  createMobileIdentity,
} from './identity'

describe('mobile remote identity', () => {
  it('matches the desktop identity golden sample', () => {
    assert.deepEqual(
      createMobileIdentity('alice', 'correct horse battery staple'),
      {
        username: 'alice',
        address: '0x023B10b4e691580966D160FbF50Dce5596A97D4C',
        danger:
          '0x4b3dc89d94ac8b7dfac567f811278e08d853af3be74ee0582e75350edb831dbf',
      }
    )
  })

  it('creates a signature accepted for the canonical request path', async () => {
    const identity = createMobileIdentity('alice', 'password')
    const header = await buildMobileAuthHeader(
      identity,
      'POST',
      '/api/download',
      123456
    )
    const [address, timestamp, signature] = header.split(',')
    assert.equal(address, identity.address)
    assert.equal(
      verifyMessage(
        buildAuthMessage(timestamp, 'POST', '/api/download'),
        signature
      ),
      identity.address
    )
  })
})
