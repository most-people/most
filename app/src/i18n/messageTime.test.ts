import assert from 'node:assert/strict'
import test from 'node:test'
import { formatMessageTime } from './messageTime'

const now = new Date(2026, 10, 17, 9, 30)

test('formats message time by calendar day', () => {
  const format = (value: Date) => formatMessageTime(value, 'zh-CN', '昨天', now)

  assert.equal(format(new Date(2026, 10, 17, 0, 5)), '00:05')
  assert.equal(format(new Date(2026, 10, 16, 23, 59)), '昨天 23:59')
  assert.equal(format(new Date(2026, 10, 15, 14, 9)), '11月15日 14:09')
  assert.equal(format(new Date(2025, 10, 3, 14, 9)), '2025年11月3日 14:09')
  assert.equal(formatMessageTime('not a date', 'zh-CN', '昨天', now), '')
})
