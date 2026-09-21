import { describe, expect, it, vi } from 'vitest'

import type { NoteItem } from '~/stores/useAppStore'
import type { ExplorerItem, NoteTreeNode } from '~/features/note/NoteTree'
import {
  escapeMarkdownLinkLabel,
  formatMarkdownLink,
  getDirectoryPathAncestors,
  getDisplayMarkdownName,
  getDisplayMarkdownPath,
  getExplorerItemDisplayName,
  getExplorerItemFullPath,
  getNoteDisplayFullPath,
  getNoteErrorMessage,
  getStorageMarkdownName,
  getStorageMarkdownPath,
  getTreeNodeDisplayName,
  getTreeNodeDisplayPath,
  getUniqueStorageMarkdownName,
  getWikiLinkLabel,
  getWikiLinkTargetPath,
  mergeExpandedPaths,
  toggleExpandedPath,
} from '~/features/note/notePaths'

const note = (overrides: Partial<NoteItem> = {}): NoteItem =>
  ({
    cid: 'cid-1',
    name: 'note',
    path: '',
    content: '',
    created_at: 0,
    updated_at: 0,
    ...overrides,
  }) as NoteItem

describe('getDisplayMarkdownName', () => {
  it('strips a markdown suffix', () => {
    expect(getDisplayMarkdownName('note.md')).toBe('note')
    expect(getDisplayMarkdownName('note.MD')).toBe('note')
    expect(getDisplayMarkdownName('note.Md')).toBe('note')
  })

  it('trims surrounding whitespace', () => {
    expect(getDisplayMarkdownName('  note.md  ')).toBe('note')
  })

  it('leaves names without the suffix alone', () => {
    expect(getDisplayMarkdownName('note.txt')).toBe('note.txt')
    expect(getDisplayMarkdownName('note')).toBe('note')
  })

  it('only strips a trailing suffix', () => {
    expect(getDisplayMarkdownName('a.md.b')).toBe('a.md.b')
  })

  it('handles empty and undefined input', () => {
    expect(getDisplayMarkdownName('')).toBe('')
    expect(getDisplayMarkdownName()).toBe('')
  })
})

describe('getStorageMarkdownName', () => {
  it('adds the markdown suffix', () => {
    expect(getStorageMarkdownName('note')).toBe('note.md')
  })

  it('does not double the suffix', () => {
    expect(getStorageMarkdownName('note.md')).toBe('note.md')
  })

  it('keeps empty input empty', () => {
    expect(getStorageMarkdownName('')).toBe('')
    expect(getStorageMarkdownName('   ')).toBe('')
  })
})

describe('getDisplayMarkdownPath', () => {
  it('strips the suffix from the last segment only', () => {
    expect(getDisplayMarkdownPath('folder/note.md')).toBe('folder/note')
  })

  it('keeps a folder named like a markdown file intact', () => {
    expect(getDisplayMarkdownPath('a.md/note.md')).toBe('a.md/note')
  })

  it('returns an empty string for empty input', () => {
    expect(getDisplayMarkdownPath('')).toBe('')
    expect(getDisplayMarkdownPath('///')).toBe('')
  })

  it('handles a root-level file', () => {
    expect(getDisplayMarkdownPath('note.md')).toBe('note')
  })
})

describe('getStorageMarkdownPath', () => {
  it('adds the suffix to the last segment only', () => {
    expect(getStorageMarkdownPath('folder/note')).toBe('folder/note.md')
  })

  it('is the inverse of the display path', () => {
    const storage = getStorageMarkdownPath('folder/note')
    expect(getDisplayMarkdownPath(storage)).toBe('folder/note')
  })

  it('returns an empty string for empty input', () => {
    expect(getStorageMarkdownPath('')).toBe('')
  })
})

describe('getNoteDisplayFullPath', () => {
  it('combines the note folder and its display name', () => {
    expect(
      getNoteDisplayFullPath(note({ path: 'folder', name: 'note.md' }))
    ).toBe('folder/note')
  })

  it('handles a root note', () => {
    expect(getNoteDisplayFullPath(note({ path: '', name: 'note.md' }))).toBe(
      'note'
    )
  })
})

describe('getUniqueStorageMarkdownName', () => {
  it('uses the title when it is free', () => {
    const exists = vi.fn(() => false)
    expect(getUniqueStorageMarkdownName('Note', 'Untitled', exists)).toBe(
      'Note.md'
    )
    expect(exists).toHaveBeenCalledWith('Note.md')
  })

  it('appends an incrementing index until a free name is found', () => {
    const taken = new Set(['Note.md', 'Note 2.md'])
    const exists = (name: string) => taken.has(name)
    expect(getUniqueStorageMarkdownName('Note', 'Untitled', exists)).toBe(
      'Note 3.md'
    )
  })

  it('falls back to the fallback title when the title is blank', () => {
    expect(getUniqueStorageMarkdownName('', 'Untitled', () => false)).toBe(
      'Untitled.md'
    )
    expect(getUniqueStorageMarkdownName('   ', 'Untitled', () => false)).toBe(
      'Untitled.md'
    )
  })

  it('strips a markdown suffix from the title before numbering', () => {
    const taken = new Set(['Note.md'])
    expect(
      getUniqueStorageMarkdownName('Note.md', 'Untitled', n => taken.has(n))
    ).toBe('Note 2.md')
  })

  it('always returns a name even when everything is taken', () => {
    const name = getUniqueStorageMarkdownName('Note', 'Untitled', () => true)
    expect(name.startsWith('Note ')).toBe(true)
    expect(name.endsWith('.md')).toBe(true)
  })
})

describe('getWikiLinkTargetPath', () => {
  it('strips a leading slash and the markdown suffix', () => {
    expect(getWikiLinkTargetPath('/folder/note.md')).toBe('folder/note')
  })

  it('drops a heading anchor', () => {
    expect(getWikiLinkTargetPath('note#heading')).toBe('note')
    expect(getWikiLinkTargetPath('folder/note.md#heading')).toBe('folder/note')
  })

  it('drops a block anchor', () => {
    expect(getWikiLinkTargetPath('note^block')).toBe('note')
  })

  it('trims whitespace', () => {
    expect(getWikiLinkTargetPath('  note  ')).toBe('note')
  })

  it('returns an empty string for empty input', () => {
    expect(getWikiLinkTargetPath('')).toBe('')
    expect(getWikiLinkTargetPath('/')).toBe('')
  })
})

describe('getWikiLinkLabel', () => {
  it('prefers a non-blank alias', () => {
    expect(getWikiLinkLabel('folder/note', 'Custom')).toBe('Custom')
    expect(getWikiLinkLabel('folder/note', '  Custom  ')).toBe('Custom')
  })

  it('falls back to the last path segment', () => {
    expect(getWikiLinkLabel('folder/note')).toBe('note')
  })

  it('ignores a blank alias', () => {
    expect(getWikiLinkLabel('folder/note', '   ')).toBe('note')
    expect(getWikiLinkLabel('folder/note', '')).toBe('note')
  })

  it('returns the whole target when it has no segments', () => {
    expect(getWikiLinkLabel('note')).toBe('note')
  })
})

describe('markdown link formatting', () => {
  it('escapes backslashes and brackets in the label', () => {
    expect(escapeMarkdownLinkLabel('a\\b[c]')).toBe('a\\\\b\\[c\\]')
  })

  it('wraps the href in angle brackets', () => {
    expect(formatMarkdownLink('Note', 'most://cid?filename=a.md')).toBe(
      '[Note](<most://cid?filename=a.md>)'
    )
  })

  it('escapes a closing angle bracket in the href', () => {
    expect(formatMarkdownLink('Note', 'a>b')).toBe('[Note](<a%3Eb>)')
  })

  it('escapes the label as well', () => {
    expect(formatMarkdownLink('a[b]', 'x')).toBe('[a\\[b\\]](<x>)')
  })
})

describe('tree and explorer display helpers', () => {
  const fileNode = (name: string, fullPath = name): NoteTreeNode => ({
    id: `file:${fullPath}`,
    type: 'file',
    name,
    path: '',
    fullPath,
    updatedAt: 0,
    children: [],
  })
  const dirNode = (name: string, fullPath = name): NoteTreeNode => ({
    id: `directory:${fullPath}`,
    type: 'directory',
    name,
    path: '',
    fullPath,
    updatedAt: 0,
    children: [],
  })

  it('strips the suffix from file nodes only', () => {
    expect(getTreeNodeDisplayName(fileNode('note.md'))).toBe('note')
    expect(getTreeNodeDisplayName(dirNode('note.md'))).toBe('note.md')
  })

  it('uses the display path for files and the full path for directories', () => {
    expect(getTreeNodeDisplayPath(fileNode('note.md', 'folder/note.md'))).toBe(
      'folder/note'
    )
    expect(getTreeNodeDisplayPath(dirNode('folder', 'folder'))).toBe('folder')
  })

  it('applies the same rule to explorer items', () => {
    const file = { type: 'file', name: 'note.md' } as ExplorerItem
    const directory = { type: 'directory', name: 'folder' } as ExplorerItem
    expect(getExplorerItemDisplayName(file)).toBe('note')
    expect(getExplorerItemDisplayName(directory)).toBe('folder')
  })

  it('joins directory items with their parent path', () => {
    const item = {
      type: 'directory',
      name: 'child',
      path: 'parent',
    } as ExplorerItem
    expect(getExplorerItemFullPath(item)).toBe('parent/child')
  })

  it('uses the note path for file items', () => {
    const item = {
      type: 'file',
      name: 'note.md',
      path: 'folder',
    } as ExplorerItem
    expect(getExplorerItemFullPath(item)).toBe('folder/note.md')
  })
})

describe('getDirectoryPathAncestors', () => {
  it('returns cumulative ancestors', () => {
    expect(getDirectoryPathAncestors('a/b/c')).toEqual(['a', 'a/b', 'a/b/c'])
  })

  it('returns an empty list for the root', () => {
    expect(getDirectoryPathAncestors('')).toEqual([])
    expect(getDirectoryPathAncestors('///')).toEqual([])
  })

  it('handles a single segment', () => {
    expect(getDirectoryPathAncestors('a')).toEqual(['a'])
  })
})

describe('expanded path helpers', () => {
  it('adds an absent path', () => {
    const result = toggleExpandedPath(new Set(['a']), 'b')
    expect([...result].sort()).toEqual(['a', 'b'])
  })

  it('removes a present path', () => {
    const result = toggleExpandedPath(new Set(['a', 'b']), 'a')
    expect([...result]).toEqual(['b'])
  })

  it('does not mutate the input set', () => {
    const input = new Set(['a'])
    toggleExpandedPath(input, 'a')
    expect([...input]).toEqual(['a'])
  })

  it('merges new paths', () => {
    const result = mergeExpandedPaths(new Set(['a']), ['b', 'c'])
    expect([...result].sort()).toEqual(['a', 'b', 'c'])
  })

  it('returns the same reference when nothing changes', () => {
    const input = new Set(['a'])
    expect(mergeExpandedPaths(input, ['a'])).toBe(input)
    expect(mergeExpandedPaths(input, [])).toBe(input)
  })

  it('returns a new reference when something changes', () => {
    const input = new Set(['a'])
    expect(mergeExpandedPaths(input, ['a', 'b'])).not.toBe(input)
  })
})

describe('getNoteErrorMessage', () => {
  const t = (key: string) => `t:${key}`

  it('localizes known error codes', () => {
    expect(
      getNoteErrorMessage(new Error('note.error.nameConflict'), 'fallback', t)
    ).toBe('t:note.error.nameConflict')
  })

  it('falls back to the raw message for unknown errors', () => {
    expect(getNoteErrorMessage(new Error('boom'), 'fallback', t)).toBe('boom')
  })

  it('uses the fallback for non-Error values', () => {
    expect(getNoteErrorMessage('boom', 'fallback', t)).toBe('fallback')
    expect(getNoteErrorMessage(null, 'fallback', t)).toBe('fallback')
  })

  it('uses the fallback for an Error without a message', () => {
    expect(getNoteErrorMessage(new Error(''), 'fallback', t)).toBe('fallback')
  })
})
