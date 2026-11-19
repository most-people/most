import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildChatSharePath,
  buildChatShareUrl,
  createRandomChannelId,
  getChannelIdFromHash,
  isChannelCredential,
  normalizeChatChannelId,
  parseChatChannelInput,
} from '../lib/chatRoom.js'

test('creates a 52-character private channel credential from 32 random bytes', () => {
  let requestedLength = 0
  const id = createRandomChannelId(bytes => {
    requestedLength = bytes.length
    bytes.fill(255)
  })

  assert.equal(requestedLength, 32)
  assert.equal(id.length, 52)
  assert.equal(isChannelCredential(id), true)
  // Matches the v2 credential encoding (docs/protocol/vectors/v2/channel.json).
  assert.equal(id, `${'7'.repeat(51)}q`)
  assert.equal(isChannelCredential('room_123'), false)
})

test('normalizes case when building and parsing chat share links', () => {
  assert.equal(normalizeChatChannelId(' Room_123 '), 'room_123')
  assert.equal(buildChatSharePath('Room_123'), '/chat/#room_123')
  assert.equal(
    buildChatShareUrl('ROOM_123', 'https://most.example/'),
    'https://most.example/chat/#room_123'
  )
  assert.equal(getChannelIdFromHash('#Room_123'), 'room_123')
  assert.equal(
    parseChatChannelInput(
      'https://most.example/chat/#ROOM_123',
      'https://most.example'
    ),
    'room_123'
  )
  assert.equal(parseChatChannelInput('Room_123'), 'room_123')
  assert.equal(
    parseChatChannelInput('https://most.example/files/#room_123'),
    ''
  )
})
