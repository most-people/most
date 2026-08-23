import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

async function importTokenModule() {
  globalThis.self ||= globalThis
  const result = await build({
    entryPoints: [
      fileURLToPath(new URL('../lib/chatJoinToken.ts', import.meta.url)),
    ],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    logLevel: 'silent',
  })
  const source = result.outputFiles[0].text
  return import(
    `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
  )
}

test('packs a locally decryptable chat invite into one fragment token', async () => {
  const {
    buildChatJoinUrl,
    decryptChatJoinToken,
    encryptChatJoinToken,
    getChatJoinTokenFromHash,
    parseChatJoinTokenInput,
  } = await importTokenModule()
  let call = 0
  const token = encryptChatJoinToken(
    {
      channels: [{ id: 'abcdefghijklmnopqrstuvwxyz' }],
      node_url: 'https://node.example.com',
      node_invite: 'scoped-invite',
    },
    length => new Uint8Array(length).fill(++call)
  )
  const link = buildChatJoinUrl(token, 'https://most.box/')
  const url = new URL(link)

  assert.equal(url.pathname, '/chat/join')
  assert.equal(url.search, '')
  assert.equal(getChatJoinTokenFromHash(url.hash), token)
  assert.equal(parseChatJoinTokenInput(link), token)
  assert.equal(
    parseChatJoinTokenInput(
      `https://most.box/chat/join?token=${token}&pub=legacy`
    ),
    ''
  )
  assert.deepEqual(decryptChatJoinToken(token), {
    channels: [{ id: 'abcdefghijklmnopqrstuvwxyz' }],
    node_url: 'https://node.example.com',
    node_invite: 'scoped-invite',
  })
})

test('rejects malformed or modified chat invite tokens', async () => {
  const { decryptChatJoinToken, encryptChatJoinToken } =
    await importTokenModule()
  const token = encryptChatJoinToken({ channels: [{ id: 'room' }] }, length =>
    new Uint8Array(length).fill(7)
  )
  const replacement = token.endsWith('A') ? 'B' : 'A'

  assert.equal(
    decryptChatJoinToken(`${token.slice(0, -1)}${replacement}`),
    null
  )
  assert.equal(decryptChatJoinToken('not-a-valid-token'), null)
})
