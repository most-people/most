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

async function importInviteModule() {
  const result = await build({
    entryPoints: [
      fileURLToPath(new URL('../lib/chatJoinInvite.ts', import.meta.url)),
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

async function importInviteIdentityModule() {
  const result = await build({
    entryPoints: [
      fileURLToPath(new URL('../lib/chatJoinIdentity.ts', import.meta.url)),
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
      expires_at: 1893456000000,
      uid: 'demo-user',
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
    expires_at: 1893456000000,
    uid: 'demo-user',
    channels: [{ id: 'abcdefghijklmnopqrstuvwxyz' }],
    node_url: 'https://node.example.com',
    node_invite: 'scoped-invite',
  })
})

test('rejects malformed or modified chat invite tokens', async () => {
  const { decryptChatJoinToken, encryptChatJoinToken } =
    await importTokenModule()
  const token = encryptChatJoinToken(
    {
      expires_at: 1893456000000,
      uid: 'demo-user',
      channels: [{ id: 'room' }],
    },
    length => new Uint8Array(length).fill(7)
  )
  const replacement = token.endsWith('A') ? 'B' : 'A'

  assert.equal(
    decryptChatJoinToken(`${token.slice(0, -1)}${replacement}`),
    null
  )
  assert.equal(decryptChatJoinToken('not-a-valid-token'), null)
})

test('matches the documented ST compatibility vector', async () => {
  const { decryptChatJoinToken, encryptChatJoinToken } =
    await importTokenModule()
  const payload = {
    expires_at: 1893456000000,
    uid: 'demo-user',
    locale: 'zh-CN',
    channels: [
      {
        id: 'chatjoin_support',
        name: 'Chat Join Demo',
      },
    ],
  }
  let offset = 0
  const token = encryptChatJoinToken(payload, length => {
    const bytes = Uint8Array.from({ length }, (_, index) => offset + index)
    offset += length
    return bytes
  })

  assert.equal(
    token,
    'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIjJCUmJygpKissLS4vMDEyMzQ1Njfc5MOP_2K-ihkZ5XjjSUMEinso3T1OKPN6ajQaLnKGzICBib7HKRNEjEYDvuBuxZmVMfKnnsQW4tYdNvnX8Vw-3LXLpW0Uzt3TM1LY1ztgI8snfq8495hVOa48ACO9RZ9-qCDT_uw6LIIGJmSoqsVWpxlnxB_-xX4sofrfYZo00i21v01X0OblX48XhTjU'
  )
  assert.deepEqual(decryptChatJoinToken(token), payload)
})

test('requires an authenticated expiry and detects expired invites', async () => {
  const { isChatJoinInviteExpired, normalizeChatJoinInvitePayload } =
    await importInviteModule()
  const invite = normalizeChatJoinInvitePayload({
    expires_at: 2000,
    uid: 'demo-user',
    channels: [{ id: 'room' }],
  })

  assert.deepEqual(invite, {
    expires_at: 2000,
    uid: 'demo-user',
    channels: [{ id: 'room', name: undefined }],
    node_url: undefined,
    node_invite: undefined,
    locale: undefined,
    theme: undefined,
    appearance: undefined,
    logo: undefined,
    logo_dark: undefined,
    data: undefined,
    avatar: undefined,
    tag: undefined,
    name: undefined,
  })
  assert.equal(isChatJoinInviteExpired(invite, 1999), false)
  assert.equal(isChatJoinInviteExpired(invite, 2000), true)
  assert.equal(
    normalizeChatJoinInvitePayload({
      uid: 'demo-user',
      channels: [{ id: 'room' }],
    }),
    null
  )
  assert.equal(
    normalizeChatJoinInvitePayload({
      expires_at: 2000,
      channels: [{ id: 'room' }],
    }),
    null
  )
  assert.equal(
    normalizeChatJoinInvitePayload({
      expires_at: '2000',
      uid: 'demo-user',
      channels: [{ id: 'room' }],
    }),
    null
  )
})

test('creates and overrides the local identity from invite fields', async () => {
  const { createChatJoinInviteIdentity } = await importInviteIdentityModule()
  const identity = createChatJoinInviteIdentity({
    expires_at: 1893456000000,
    uid: 'demo-user',
    name: 'Demo User',
    avatar: 'https://example.com/avatar.png',
    logo: 'https://example.com/logo.svg',
    logo_dark: 'https://example.com/logo-dark.svg',
    theme: 'st',
    data: '{"source":"invite"}',
    tag: { 'zh-CN': '访客', en: 'Guest' },
    channels: [{ id: 'chatjoin_support' }],
  })

  assert.equal(identity.username, 'demo-user')
  assert.equal(identity.displayName, 'Demo User')
  assert.equal(identity.avatar, 'https://example.com/avatar.png')
  assert.equal(identity.logo, 'https://example.com/logo.svg')
  assert.equal(identity.logo_dark, 'https://example.com/logo-dark.svg')
  assert.equal(identity.theme, 'st')
  assert.equal(identity.data, '{"source":"invite"}')
  assert.deepEqual(identity.tag, { 'zh-CN': '访客', en: 'Guest' })
})
