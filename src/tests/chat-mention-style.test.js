import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

function readSource(path) {
  return fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf-8')
}

describe('chat mention styling', () => {
  it('highlights only the current user mention inside mentioned messages', () => {
    const chatStyles = readSource('src/styles/chat.css')

    assert.match(chatStyles, /\.chat-mention\.self\s*\{[\s\S]*color:\s*var\(--warning\)/)
    assert.doesNotMatch(
      chatStyles,
      /(?:\.chat-message\.mentioned|&\.mentioned)\s+\.message-bubble\s*\{[^}]*var\(--warning\)/
    )
    assert.doesNotMatch(
      chatStyles,
      /(?:\.chat-message\.mentioned|&\.mentioned)\s+\.chat-mention\s*\{[^}]*color:\s*var\(--warning\)/
    )
  })
})
