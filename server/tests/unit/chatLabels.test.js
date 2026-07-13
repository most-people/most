import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  CHAT_VISIBLE_LABEL_MAX_CODE_POINTS,
  normalizeChatMemberTagPatch,
  normalizeLocalizedChatTag,
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
      normalizeVisibleChatLabel(
        'x'.repeat(CHAT_VISIBLE_LABEL_MAX_CODE_POINTS + 1)
      ),
      ''
    )
  })

  it('normalizes localized member tags', () => {
    assert.deepEqual(normalizeLocalizedChatTag('  有人@我  '), {
      default: '有人@我',
    })
    assert.deepEqual(
      normalizeLocalizedChatTag({
        'zh-CN': ' 有人@我 ',
        en: ' Mentioned ',
        bad_key: 'ignored',
        'zh-TW': '\u200B',
      }),
      {
        'zh-CN': '有人@我',
        en: 'Mentioned',
      }
    )
  })

  it('treats null as clear and rejects invalid tag patches', () => {
    assert.deepEqual(normalizeChatMemberTagPatch(undefined, false), {
      action: 'unchanged',
    })
    assert.deepEqual(normalizeChatMemberTagPatch(null, true), {
      action: 'clear',
      tag: null,
    })
    assert.deepEqual(normalizeChatMemberTagPatch('', true), {
      action: 'invalid',
    })
  })
})
