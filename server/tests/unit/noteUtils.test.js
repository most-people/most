import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  calculateNoteCid,
  filterNotesByPath,
  findNoteByIdentity,
  getNoteFullPath,
  normalizeNotePath,
  removeNotesByIdentity,
  renameNotesByPath,
  validateNoteName,
} from '../../src/utils/noteUtils.js'

describe('noteUtils', () => {
  it('normalizes note paths', () => {
    assert.strictEqual(normalizeNotePath('/study//math/'), 'study/math')
    assert.strictEqual(normalizeNotePath('study\\math'), 'study/math')
    assert.strictEqual(normalizeNotePath('../study/./math'), 'study/math')
  })

  it('calculates deterministic note CIDs', async () => {
    const cid1 = await calculateNoteCid('hello')
    const cid2 = await calculateNoteCid('hello')
    const cid3 = await calculateNoteCid('world')

    assert.strictEqual(cid1, cid2)
    assert.notStrictEqual(cid1, cid3)
  })

  it('uses full paths to distinguish note records with the same CID', () => {
    const notes = [
      { name: 'first.md', path: 'one', cid: 'same-cid' },
      { name: 'second.md', path: 'two', cid: 'same-cid' },
    ]

    assert.strictEqual(
      findNoteByIdentity(notes, {
        cid: 'same-cid',
        path: 'two/second.md',
      }),
      notes[1]
    )
    assert.deepStrictEqual(
      removeNotesByIdentity(notes, {
        cid: 'same-cid',
        path: 'one/first.md',
      }),
      [notes[1]]
    )
  })

  it('infers directories for the current path', () => {
    const notes = [
      makeNote('root', '', 1),
      makeNote('algebra', 'study/math', 2),
      makeNote('physics', 'study/science', 3),
    ]

    const rootItems = filterNotesByPath(notes, '', '')
    assert.deepStrictEqual(
      rootItems.map(item => item.name),
      ['study', 'root']
    )

    const studyItems = filterNotesByPath(notes, 'study', '')
    assert.deepStrictEqual(
      studyItems.map(item => item.name),
      ['science', 'math']
    )
  })

  it('renames files and folders by full path', () => {
    const notes = [
      makeNote('index', 'old', 1),
      makeNote('child', 'old/sub', 2),
      makeNote('other', '', 3),
    ]
    const renamed = renameNotesByPath(notes, 'old', 'new/path', 'folder')

    assert.deepStrictEqual(
      renamed.map(note => getNoteFullPath(note)),
      ['new/path/folder/index', 'new/path/folder/sub/child', 'other']
    )
  })

  it('validates note names', () => {
    assert.strictEqual(validateNoteName('hello').valid, true)
    assert.strictEqual(validateNoteName('').valid, false)
    assert.strictEqual(validateNoteName('a/b').valid, false)
  })
})

function makeNote(name, path, updatedAt) {
  return {
    name,
    path,
    cid: `${path}/${name}`,
    content: '',
    size: 0,
    type: 'file',
    created_at: updatedAt,
    updated_at: updatedAt,
  }
}
