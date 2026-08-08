import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  applyMarkdownTool,
  createAttachmentMarkdown,
  createUniqueKnowledgeFilePath,
  insertMarkdownAtSelection,
  joinKnowledgePath,
  normalizeKnowledgeDirectory,
  normalizeKnowledgeFilePath,
  prepareMarkdownPreview,
  searchKnowledgeNotes,
  validateKnowledgeSnapshot,
} from './knowledgeModel'
import type { MobileKnowledgeNote } from './types'

function note(path: string, content: string): MobileKnowledgeNote {
  const slash = path.lastIndexOf('/')
  return {
    path,
    name: path.slice(slash + 1).replace(/\.md$/i, ''),
    directory: slash === -1 ? '' : path.slice(0, slash),
    content,
    size: new TextEncoder().encode(content).byteLength,
    mtimeMs: 1,
  }
}

describe('mobile knowledge model', () => {
  it('normalizes safe Markdown paths and rejects traversal', () => {
    assert.equal(normalizeKnowledgeDirectory('项目 / 资料'), '项目/资料')
    assert.equal(normalizeKnowledgeFilePath('项目/说明.md'), '项目/说明.md')
    assert.equal(joinKnowledgePath('项目', '周报'), '项目/周报.md')
    assert.throws(() => normalizeKnowledgeFilePath('../secret.md'))
    assert.throws(() => normalizeKnowledgeFilePath('/secret.md'))
    assert.throws(() => normalizeKnowledgeFilePath('C:/secret.md'))
    assert.throws(() => normalizeKnowledgeFilePath('.private/secret.md'))
    assert.throws(() => normalizeKnowledgeFilePath('secret.txt'))
  })

  it('searches note names, paths, and Markdown content', () => {
    const notes = [
      note('项目/路线图.md', '第一阶段'),
      note('资料/会议.md', 'CID 验收记录'),
    ]
    assert.deepEqual(searchKnowledgeNotes(notes, '路线'), [notes[0]])
    assert.deepEqual(searchKnowledgeNotes(notes, 'cid'), [notes[1]])
    assert.deepEqual(searchKnowledgeNotes(notes, '资料'), [notes[1]])
  })

  it('generates a copy name for case-insensitive import conflicts', () => {
    assert.equal(
      createUniqueKnowledgeFilePath(
        ['资料/说明.md', '资料/说明 (1).md'],
        '资料/说明.md'
      ),
      '资料/说明 (2).md'
    )
    assert.equal(
      createUniqueKnowledgeFilePath(['资料/说明.md'], '资料/说明.MD'),
      '资料/说明 (1).md'
    )
  })

  it('applies Markdown tools without losing surrounding text', () => {
    assert.deepEqual(applyMarkdownTool('hello', { start: 0, end: 5 }, 'bold'), {
      content: '**hello**',
      selection: { start: 2, end: 7 },
    })
    assert.equal(
      applyMarkdownTool('one\ntwo', { start: 0, end: 7 }, 'list').content,
      '- one\n- two'
    )
    assert.equal(
      applyMarkdownTool('title', { start: 0, end: 5 }, 'heading').content,
      '## title'
    )
    assert.equal(
      insertMarkdownAtSelection('before', { start: 6, end: 6 }, '[a](b)')
        .content,
      'before\n\n[a](b)'
    )
  })

  it('creates canonical attachment Markdown and safe previews', () => {
    const imageLink = 'most://bafyimage?filename=photo.png'
    assert.equal(
      createAttachmentMarkdown('photo.png', imageLink, 'image/png'),
      `![photo.png](${imageLink})`
    )
    assert.equal(
      prepareMarkdownPreview(`查看 ![photo.png](${imageLink})`),
      `查看 [图片：photo.png](${imageLink})`
    )
    assert.equal(
      createAttachmentMarkdown(
        'report.pdf',
        'most://bafyfile?filename=report.pdf',
        'application/pdf'
      ),
      '[report.pdf](most://bafyfile?filename=report.pdf)'
    )
  })

  it('validates and normalizes versioned snapshots', () => {
    const snapshot = validateKnowledgeSnapshot({
      format: 'mostbox-knowledge',
      version: 1,
      exportedAt: '2026-08-08T00:00:00.000Z',
      files: [
        { path: 'b.md', content: '二', size: 3, mtimeMs: 2 },
        { path: 'a.md', content: 'a', size: 1, mtimeMs: 1 },
      ],
    })
    assert.deepEqual(
      snapshot.files.map(file => [file.path, file.size]),
      [
        ['a.md', 1],
        ['b.md', 3],
      ]
    )
    assert.throws(() =>
      validateKnowledgeSnapshot({
        format: 'mostbox-knowledge',
        version: 1,
        exportedAt: '2026-08-08T00:00:00.000Z',
        files: [
          { path: 'a.md', content: '', size: 0, mtimeMs: 1 },
          { path: 'A.md', content: '', size: 0, mtimeMs: 1 },
        ],
      })
    )
    assert.throws(() =>
      validateKnowledgeSnapshot({
        format: 'mostbox-knowledge',
        version: 1,
        exportedAt: 'not-a-date',
        files: [],
      })
    )
    assert.throws(() =>
      validateKnowledgeSnapshot({
        format: 'mostbox-knowledge',
        version: 1,
        exportedAt: '2026-08-08T00:00:00.000Z',
        files: [{ path: 'a.md', content: 'a', size: 2, mtimeMs: 1 }],
      })
    )
  })
})
