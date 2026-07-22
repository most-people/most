import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildChatSharePath,
  buildChatShareUrl,
  createRandomChannelId,
  getChannelIdFromHash,
  parseChatChannelInput,
} from '../lib/chatRoom.js'

test('creates a 22-character base64url channel ID from 16 random bytes', () => {
  let requestedLength = 0
  const id = createRandomChannelId(bytes => {
    requestedLength = bytes.length
    bytes.fill(255)
    return bytes
  })

  assert.equal(requestedLength, 16)
  assert.equal(id.length, 22)
  assert.match(id, /^[A-Za-z0-9_-]{22}$/)
  assert.equal(id, '_____________________w')
})

test('builds and parses hash-based chat share links', () => {
  assert.equal(buildChatSharePath('room_123'), '/chat/#room_123')
  assert.equal(
    buildChatShareUrl('room_123', 'https://most.example/'),
    'https://most.example/chat/#room_123'
  )
  assert.equal(getChannelIdFromHash('#room_123'), 'room_123')
  assert.equal(
    parseChatChannelInput(
      'https://most.example/chat/#room_123',
      'https://most.example'
    ),
    'room_123'
  )
  assert.equal(parseChatChannelInput('room_123'), 'room_123')
  assert.equal(
    parseChatChannelInput('https://most.example/files/#room_123'),
    ''
  )
})
