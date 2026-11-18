import assert from 'node:assert/strict'
import test from 'node:test'
import b4a from 'b4a'
import { Wallet } from 'ethers'
import { signedMessageError } from '../../backend/channel-signed-entry.mjs'
import { deviceFor } from '../../backend/signed-message.test-helper.mjs'
import { buildMessageBody, signChatBody } from './chatSigning'

const CID = 'bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e'
const LINK = `most://${CID}?filename=photo.png`
const channelId = 'ab'.repeat(32)

test('cores accept messages the app signs', async () => {
  const wallet = Wallet.createRandom()
  const device = await deviceFor(wallet)
  const identity = {
    device: {
      publicKey: device.publicKey,
      secretKey: b4a.toString(device.secretKey, 'hex'),
      cert: device.cert,
    },
  }
  const text = buildMessageBody({
    channelId,
    author: wallet.address,
    id: crypto.randomUUID(),
    content: '  hello  ',
    authorName: '  Android  ',
  })
  assert.equal(text.authorName, 'Android')
  assert.equal(
    signedMessageError(signChatBody(text, identity), { channelId }),
    ''
  )

  const photo = buildMessageBody({
    channelId,
    author: wallet.address,
    id: crypto.randomUUID(),
    content: LINK,
    attachment: {
      kind: 'image',
      cid: CID,
      fileName: 'photo.png',
      link: LINK,
      mimeType: undefined,
      size: 42,
    },
  })
  const signed = signChatBody(photo, identity)
  assert.equal(signedMessageError(signed, { channelId }), '')
  assert.equal(
    signedMessageError(signed, { channelId: 'cd'.repeat(32) }),
    'channel mismatch'
  )
  assert.throws(() =>
    buildMessageBody({
      channelId: 'room',
      author: wallet.address,
      id: crypto.randomUUID(),
      content: 'x',
    })
  )
})
