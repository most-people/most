import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ChatNotificationCursor,
  getNotificationChannel,
} from './chatNotificationModel'
import type { ChatMessage } from '../../chat/chatProtocol'

const ownAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
const message = (
  id: string,
  timestamp: number,
  author = 'peer'
): ChatMessage => ({
  id,
  timestamp,
  author,
  authorName: author,
  content: id,
})
const input = (messages: ChatMessage[]) => ({
  channels: ['qa'],
  messages: { qa: messages },
  ownAddress,
  hidden: [] as string[],
  enabled: true,
  foreground: false,
})

test('notifications skip initial and delayed old history, then deduplicate live messages', () => {
  const cursor = new ChatNotificationCursor(1000)
  assert.deepEqual(cursor.observe(input([])), [])
  assert.deepEqual(cursor.observe(input([message('old', 999)])), [])
  assert.deepEqual(
    cursor.observe(input([message('old', 999), message('new', 1001)])),
    ['qa']
  )
  assert.deepEqual(cursor.observe(input([message('new', 1001)])), [])
  assert.deepEqual(
    cursor.observe(input([message('same-time', 1001), message('new', 1001)])),
    ['qa']
  )
  assert.deepEqual(cursor.observe(input([message('same-time', 1001)])), [])
})

test('own messages, system events, hidden channels and foreground changes stay quiet', () => {
  const cursor = new ChatNotificationCursor(1000)
  cursor.observe(input([]))
  assert.deepEqual(
    cursor.observe(
      input([
        message('own', 1001, ownAddress.toUpperCase().replace('0X', '0x')),
      ])
    ),
    []
  )
  assert.deepEqual(
    cursor.observe(input([{ ...message('system', 1002), type: 'system' }])),
    []
  )
  assert.deepEqual(
    cursor.observe({ ...input([message('hidden', 1003)]), hidden: ['qa'] }),
    []
  )
  assert.deepEqual(cursor.observe(input([message('hidden', 1003)])), [])
  assert.deepEqual(
    cursor.observe({
      ...input([message('foreground', 1004)]),
      foreground: true,
    }),
    []
  )
  assert.deepEqual(cursor.observe(input([message('foreground', 1004)])), [])
})

test('live messages arriving out of timestamp order still notify once', () => {
  const cursor = new ChatNotificationCursor(1000)
  cursor.observe(input([]))
  assert.deepEqual(cursor.observe(input([message('later', 1100)])), ['qa'])
  assert.deepEqual(
    cursor.observe(input([message('earlier', 1050), message('later', 1100)])),
    ['qa']
  )
  assert.deepEqual(cursor.observe(input([message('earlier', 1050)])), [])
})

test('enabling reminders does not replay messages received while disabled or across scopes', () => {
  const cursor = new ChatNotificationCursor(1000)
  cursor.observe(input([]))
  assert.deepEqual(
    cursor.observe({ ...input([message('disabled', 1001)]), enabled: false }),
    []
  )
  assert.deepEqual(cursor.observe(input([message('disabled', 1001)])), [])
  assert.deepEqual(
    new ChatNotificationCursor(1002).observe(
      input([message('disabled', 1001)])
    ),
    []
  )
  cursor.observe({ ...input([]), channels: [] })
  assert.deepEqual(cursor.observe(input([message('rejoin', 1003)])), [])
})

test('notification taps only open joined channels belonging to the current node and account', () => {
  const data = { kind: 'mostbox-chat', scope: 'local:account', channel: '#QA' }
  assert.equal(getNotificationChannel(data, 'local:account', ['qa']), 'qa')
  assert.equal(getNotificationChannel(data, 'remote:account', ['qa']), null)
  assert.equal(getNotificationChannel(data, 'local:other', ['qa']), null)
  assert.equal(getNotificationChannel(data, 'local:account', []), null)
  assert.equal(
    getNotificationChannel(
      { ...data, channel: 'https://example.com' },
      'local:account',
      ['qa']
    ),
    null
  )
  for (const invalid of [
    null,
    [],
    { ...data, kind: 'other' },
    { ...data, channel: 1 },
  ])
    assert.equal(getNotificationChannel(invalid, 'local:account', ['qa']), null)
})
