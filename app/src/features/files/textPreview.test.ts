import assert from 'node:assert/strict'
import test from 'node:test'
import { decodeUnknownFileText } from './textPreview'

test('unknown files accept UTF-8 text, including empty files and line breaks', () => {
  for (const text of ['', 'node_modules/\n.env\r\n', '\t备注：忽略缓存 😀']) {
    assert.equal(
      decodeUnknownFileText(new TextEncoder().encode(text).buffer),
      text
    )
  }
})

test('unknown files reject invalid UTF-8 and binary control characters', () => {
  for (const bytes of [[0xff, 0xfe], [65, 0, 66], [80, 75, 3, 4], [127]]) {
    assert.equal(decodeUnknownFileText(new Uint8Array(bytes).buffer), null)
  }
})
