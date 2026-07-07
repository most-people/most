import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  CHAT_VISIBLE_LABEL_MAX_CODE_POINTS,
  normalizeVisibleChatLabel,
} from '../../src/utils/chatLabels.js'

describe('chat label normalization', () => {
  it('trims, normalizes and removes invisible characters', () => {
    assert.equal(normalizeVisibleChatLabel('  Cafe\u0301\u200B  '), 'Café')
  })

  it('rejects non-string, empty and too-long labels', () => {
    assert.equal(normalizeVisibleChatLabel(null), '')
    assert.equal(normalizeVisibleChatLabel('\u200B'), '')
    assert.equal(
      normalizeVisibleChatLabel('x'.repeat(CHAT_VISIBLE_LABEL_MAX_CODE_POINTS + 1)),
      ''
    )
  })
})
