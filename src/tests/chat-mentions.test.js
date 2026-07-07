import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  finalizeMentionDraftForSend,
  getMentionTrigger,
  insertMentionIntoDraft,
  messageMentionsAddress,
  updateMentionDraft,
} from '../lib/chatMentions.js'

describe('chat mention drafts', () => {
  it('detects mention triggers only at token starts', () => {
    assert.deepEqual(getMentionTrigger('hello @ali', 10), {
      start: 6,
      end: 10,
      query: 'ali',
    })
    assert.equal(getMentionTrigger('hello@ali', 9), null)
  })

  it('inserts and finalizes structured mentions with adjusted offsets', () => {
    const result = insertMentionIntoDraft(
      { content: 'hi @al', mentions: [] },
      {
        address: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        label: 'Alice',
      },
      3,
      6
    )

    assert.equal(result.draft.content, 'hi @Alice ')
    assert.equal(result.caret, 10)
    assert.deepEqual(result.draft.mentions, [
      {
        address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        label: 'Alice',
        start: 3,
        end: 9,
      },
    ])

    const finalized = finalizeMentionDraftForSend({
      content: `  ${result.draft.content}`,
      mentions: result.draft.mentions.map(mention => ({
        ...mention,
        start: mention.start + 2,
        end: mention.end + 2,
      })),
    })

    assert.equal(finalized.content, 'hi @Alice')
    assert.deepEqual(finalized.mentions, result.draft.mentions)
  })

  it('drops edited mentions and keeps untouched mention offsets valid', () => {
    const previous = {
      content: '@Alice hello @Bob',
      mentions: [
        {
          address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          label: 'Alice',
          start: 0,
          end: 6,
        },
        {
          address: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          label: 'Bob',
          start: 13,
          end: 17,
        },
      ],
    }

    const updated = updateMentionDraft(previous, '@Alyce hello @Bob')

    assert.deepEqual(updated.mentions, [
      {
        address: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        label: 'Bob',
        start: 13,
        end: 17,
      },
    ])
  })

  it('shifts untouched mentions when text changes before them', () => {
    const updated = updateMentionDraft(
      {
        content: 'hello @Bob',
        mentions: [
          {
            address: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            label: 'Bob',
            start: 6,
            end: 10,
          },
        ],
      },
      'say hello @Bob'
    )

    assert.deepEqual(updated.mentions, [
      {
        address: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        label: 'Bob',
        start: 10,
        end: 14,
      },
    ])
  })

  it('uses UTF-16 offsets for mention ranges', () => {
    const result = insertMentionIntoDraft(
      { content: '🙂 @b', mentions: [] },
      {
        address: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        label: 'Bob',
      },
      3,
      5
    )

    assert.equal(result.draft.content, '🙂 @Bob ')
    assert.deepEqual(result.draft.mentions, [
      {
        address: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        label: 'Bob',
        start: 3,
        end: 7,
      },
    ])
  })

  it('drops mentions replaced by paste while preserving later mentions', () => {
    const updated = updateMentionDraft(
      {
        content: 'hi @Alice and @Bob',
        mentions: [
          {
            address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            label: 'Alice',
            start: 3,
            end: 9,
          },
          {
            address: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            label: 'Bob',
            start: 14,
            end: 18,
          },
        ],
      },
      'hi pasted and @Bob'
    )

    assert.deepEqual(updated.mentions, [
      {
        address: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        label: 'Bob',
        start: 14,
        end: 18,
      },
    ])
  })

  it('keeps mention ranges valid across redo and undo text changes', () => {
    const original = {
      content: '@Alice hi',
      mentions: [
        {
          address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          label: 'Alice',
          start: 0,
          end: 6,
        },
      ],
    }
    const redone = updateMentionDraft(original, 'say @Alice hi')
    const undone = updateMentionDraft(redone, '@Alice hi')

    assert.deepEqual(redone.mentions, [
      {
        address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        label: 'Alice',
        start: 4,
        end: 10,
      },
    ])
    assert.deepEqual(undone, original)
  })

  it('matches mentioned addresses case-insensitively', () => {
    assert.equal(
      messageMentionsAddress(
        {
          mentions: [
            {
              address: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
              label: 'Alice',
              start: 0,
              end: 6,
            },
          ],
        },
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      ),
      true
    )
  })
})
