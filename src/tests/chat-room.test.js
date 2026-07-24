import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildChatSharePath,
  buildChatShareUrl,
  createRandomChannelId,
  getChannelIdFromHash,
  normalizeChatChannelId,
  parseChatChannelInput,
} from '../lib/chatRoom.js'

test('creates a 26-character lowercase base32 channel ID from 16 random bytes', () => {
  let requestedLength = 0
  const id = createRandomChannelId(bytes => {
    requestedLength = bytes.length
    bytes.fill(255)
  })

  assert.equal(requestedLength, 16)
  assert.equal(id.length, 26)
  assert.match(id, /^[a-z2-7]{26}$/)
  assert.equal(id, `${'7'.repeat(25)}4`)
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
