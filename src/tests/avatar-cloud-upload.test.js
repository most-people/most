import { describe, it } from 'node:test'
import assert from 'node:assert'
import { verifyMessage } from 'ethers'
import {
  ACCOUNT_AVATAR_API_URL,
  getAccountAvatarAuthHeaders,
  uploadAccountAvatar,
} from '../lib/avatarCloudUpload.js'
import { mostWallet } from '../../server/src/utils/mostWallet.js'

describe('avatar cloud upload', () => {
  it('signs avatar uploads against the cloud avatar path', async () => {
    const wallet = mostWallet('alice', 'secret')
    const headers = await getAccountAvatarAuthHeaders(
      wallet,
      'POST',
      ACCOUNT_AVATAR_API_URL
    )
    const [address, timestamp, signature] = headers.Authorization.split(',')

    assert.strictEqual(address, wallet.address)
    assert.strictEqual(
      verifyMessage(`${timestamp}:POST:/auth/avatar`, signature),
      wallet.address
    )
  })

  it('uploads account avatars through the authenticated cloud API', async () => {
    const originalFetch = globalThis.fetch
    const wallet = mostWallet('alice', 'secret')
    const avatarFile = new File([new Uint8Array([1, 2, 3])], 'avatar.png', {
      type: 'image/png',
    })

    globalThis.fetch = async (url, init) => {
      assert.strictEqual(url, ACCOUNT_AVATAR_API_URL)
      assert.strictEqual(init.method, 'POST')
      assert.ok(init.body instanceof FormData)
      assert.match(init.headers.Authorization, /^[^,]+,\d+,0x[a-fA-F0-9]+$/)
      return new Response(
        JSON.stringify({
          success: true,
          key: 'avatars/bafkreiavatar.png',
          url: 'https://api.most.box/avatar/avatars/bafkreiavatar.png',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      )
    }

    try {
      const result = await uploadAccountAvatar(wallet, avatarFile)
      assert.strictEqual(
        result.url,
        'https://api.most.box/avatar/avatars/bafkreiavatar.png'
      )
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
