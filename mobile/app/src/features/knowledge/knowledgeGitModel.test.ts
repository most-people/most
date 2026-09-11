import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  normalizeKnowledgeGitDiff,
  normalizeKnowledgeGitHistory,
  normalizeKnowledgeGitStatus,
  summarizeKnowledgeGitDiff,
} from './knowledgeGitModel'

describe('mobile knowledge Git model', () => {
  it('normalizes status responses and rejects malformed changes', () => {
    const status = normalizeKnowledgeGitStatus({
      initialized: true,
      branch: 'main',
      headOid: 'abc',
      stagedCount: 2.9,
      author: { name: 'Ada', email: 'ada@example.com' },
      changes: [
        { path: 'a.md', status: 'modified', staged: true },
        { path: '', status: 'wat' },
      ],
    })
    assert.deepEqual(status.changes, [
      { path: 'a.md', status: 'modified', staged: true },
    ])
    assert.equal(status.stagedCount, 2)
    assert.equal(normalizeKnowledgeGitStatus(null).initialized, false)
  })

  it('normalizes history and diff parts', () => {
    const history = normalizeKnowledgeGitHistory([
      {
        oid: 'a'.repeat(40),
        message: '更新路线图',
        author: { name: 'Ada', email: 'ada@example.com' },
        timestamp: 1_700_000_000_000,
        changes: [{ path: '路线图.md', status: 'modified' }],
      },
      { oid: '', message: 'invalid' },
    ])
    assert.equal(history.length, 1)
    const diff = normalizeKnowledgeGitDiff({
      path: '路线图.md',
      oid: '',
      beforeExists: true,
      afterExists: true,
      parts: [
        { value: 'old\n', count: 1, removed: true },
        { value: 'same\n', count: 1 },
        { value: 'new\n', count: 2, added: true },
      ],
    })
    assert.ok(diff)
    assert.deepEqual(summarizeKnowledgeGitDiff(diff), {
      added: 2,
      removed: 1,
      unchanged: 1,
    })
    assert.equal(normalizeKnowledgeGitDiff({ path: '' }), null)
  })
})
