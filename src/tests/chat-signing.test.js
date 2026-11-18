import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { Wallet } from 'ethers'
import {
  createDeviceKey,
  issueDeviceCertWithSigner,
} from '../../server/src/utils/auth.js'
import {
  signedMessageError,
  signedProfileError,
} from '../../server/src/core/channelSignedEntry.js'

async function importSigningModule() {
  const result = await build({
    entryPoints: [
      fileURLToPath(new URL('../lib/chatSigning.ts', import.meta.url)),
    ],
    bundle: true,
    format: 'esm',
    platform: 'node',
    // tweetnacl calls require('crypto') under Node; give the bundle one.
    banner: {
      js: "import { createRequire } from 'node:module'; const require = createRequire(process.cwd() + '/');",
    },
    write: false,
    logLevel: 'silent',
  })
  return import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`
  )
}

const { buildMessageBody, buildProfileBody, signChatBody } =
  await importSigningModule()
const wallet = Wallet.createRandom()
const key = createDeviceKey()
const device = {
  ...key,
  cert: await issueDeviceCertWithSigner(wallet, key.publicKey),
}
const channelId = 'ab'.repeat(32)
const cid = 'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku'

test('the node accepts messages the web client signs', () => {
  const plain = buildMessageBody({
    channelId,
    author: wallet.address,
    id: randomUUID(),
    content: '  hi @Visitor  ',
    authorName: '  Web User  ',
    avatar: '/avatars/default/mint.svg',
    authorTag: { en: ' Mentioned ' },
    mentions: [
      {
        address: '0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD',
        label: 'Visitor',
        start: 3,
        end: 11,
      },
    ],
  })
  assert.equal(
    signedMessageError(signChatBody(plain, device), { channelId }),
    ''
  )

  const link = `most://${cid}?filename=a.txt`
  const withFile = buildMessageBody({
    channelId,
    author: wallet.address,
    id: randomUUID(),
    content: link,
    authorName: '',
    attachment: {
      kind: 'text',
      cid,
      fileName: 'a.txt',
      link,
      mimeType: undefined,
      size: 3,
    },
  })
  assert.equal(
    signedMessageError(signChatBody(withFile, device), { channelId }),
    ''
  )
})

test('a signed message does not verify for another channel', () => {
  const body = buildMessageBody({
    channelId,
    author: wallet.address,
    id: randomUUID(),
    content: 'hello',
  })
  assert.equal(
    signedMessageError(signChatBody(body, device), {
      channelId: 'cd'.repeat(32),
    }),
    'channel mismatch'
  )
  assert.throws(() =>
    buildMessageBody({
      channelId: 'room',
      author: wallet.address,
      id: randomUUID(),
      content: 'x',
    })
  )
})

test('the node accepts profiles the web client signs', () => {
  for (const tag of [{ en: ' Host ' }, null, undefined]) {
    const body = buildProfileBody({
      channelId,
      author: wallet.address,
      id: randomUUID(),
      displayName: '  Web User ',
      avatar: '',
      tag,
    })
    assert.equal(
      signedProfileError(signChatBody(body, device), { channelId }),
      ''
    )
  }
})
