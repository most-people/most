import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

function readSource(path) {
  return fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf-8')
}

describe('chat mention styling', () => {
  it('keeps inline message mentions visually plain', () => {
    const chatStyles = readSource('src/styles/chat.css')

    assert.doesNotMatch(chatStyles, /^\.chat-mention\s*\{/m)
    assert.doesNotMatch(chatStyles, /^\.chat-mention\.self\s*\{/m)
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
