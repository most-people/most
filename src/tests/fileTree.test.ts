import { describe, expect, it } from 'vitest'

import {
  generateBreadcrumbs,
  getCurrentFolders,
  getItemsForPath,
  getUniqueFolders,
  parseAppFileName,
} from '~/features/files/fileTree'

describe('parseAppFileName', () => {
  it('splits a nested display path', () => {
    expect(parseAppFileName('docs/2026/report.pdf')).toEqual({
      folder: 'docs/2026',
      name: 'report.pdf',
    })
  })

  it('treats a name without a slash as a root file', () => {
    expect(parseAppFileName('report.pdf')).toEqual({
      folder: '',
      name: 'report.pdf',
    })
  })

  it('keeps the tail after the last slash only', () => {
    expect(parseAppFileName('a/b/c.bin')).toEqual({
      folder: 'a/b',
      name: 'c.bin',
    })
  })

  it('handles an empty string without throwing', () => {
    expect(parseAppFileName('')).toEqual({ folder: '', name: '' })
  })

  it('keeps a trailing slash in the folder and yields an empty name', () => {
    expect(parseAppFileName('docs/')).toEqual({ folder: 'docs', name: '' })
  })
})

describe('getUniqueFolders', () => {
  it('returns an empty list for no files', () => {
    expect(getUniqueFolders([])).toEqual([])
  })

  it('returns no folders for root-level files', () => {
    expect(
      getUniqueFolders([{ fileName: 'a.bin' }, { fileName: 'b.bin' }])
    ).toEqual([])
  })

  it('collects every ancestor folder', () => {
    expect(getUniqueFolders([{ fileName: 'a/b/c.bin' }])).toEqual(['a', 'a/b'])
  })

  it('deduplicates folders shared by several files', () => {
    const folders = getUniqueFolders([
      { fileName: 'docs/a.bin' },
      { fileName: 'docs/b.bin' },
      { fileName: 'docs/deep/c.bin' },
    ])
    expect(folders).toEqual(['docs', 'docs/deep'])
  })

  it('sorts the result for stable rendering', () => {
    const folders = getUniqueFolders([
      { fileName: 'zeta/a.bin' },
      { fileName: 'alpha/b.bin' },
      { fileName: 'mid/c.bin' },
    ])
    expect(folders).toEqual(['alpha', 'mid', 'zeta'])
  })

  it('ignores redundant separators and empty segments', () => {
    expect(getUniqueFolders([{ fileName: 'a//b///c.bin' }])).toEqual([
      'a',
      'a/b',
    ])
  })
})

describe('getCurrentFolders', () => {
  const allFolders = ['docs', 'docs/deep', 'docs/deep/deeper', 'other']

  it('lists only the direct children of the root', () => {
    expect(getCurrentFolders(allFolders, '')).toEqual([
      { name: 'docs', path: 'docs' },
      { name: 'other', path: 'other' },
    ])
  })

  it('lists only the direct children of a folder', () => {
    expect(getCurrentFolders(allFolders, 'docs')).toEqual([
      { name: 'deep', path: 'docs/deep' },
    ])
  })

  it('does not list grandchildren', () => {
    const paths = getCurrentFolders(allFolders, 'docs').map(f => f.path)
    expect(paths).not.toContain('docs/deep/deeper')
  })

  it('returns an empty list for a folder with no subfolders', () => {
    expect(getCurrentFolders(allFolders, 'docs/deep/deeper')).toEqual([])
  })

  it('matches the path prefix case-insensitively', () => {
    expect(getCurrentFolders(['Docs/Deep'], 'docs')).toEqual([
      { name: 'Deep', path: 'Docs/Deep' },
    ])
  })

  it('does not treat a sibling with a shared prefix as a child', () => {
    expect(getCurrentFolders(['docs', 'docs-old'], 'docs')).toEqual([])
  })
})

describe('getItemsForPath', () => {
  const files = [
    { cid: '1', fileName: 'root.bin' },
    { cid: '2', fileName: 'docs/a.bin' },
    { cid: '3', fileName: 'docs/deep/b.bin' },
    { cid: '4', fileName: 'other/c.bin' },
  ]
  const allFolders = getUniqueFolders(files)

  it('returns root files and top-level folders at the root', () => {
    const result = getItemsForPath(files, allFolders, '')
    expect(result.files.map(f => f.cid)).toEqual(['1'])
    expect(result.folders.map(f => f.path)).toEqual(['docs', 'other'])
  })

  it('returns only the files directly inside the current folder', () => {
    const result = getItemsForPath(files, allFolders, 'docs')
    expect(result.files.map(f => f.cid)).toEqual(['2'])
    expect(result.folders.map(f => f.path)).toEqual(['docs/deep'])
  })

  it('does not include files from a nested folder', () => {
    const result = getItemsForPath(files, allFolders, 'docs')
    expect(result.files.map(f => f.cid)).not.toContain('3')
  })

  it('returns an empty view for an unknown folder', () => {
    const result = getItemsForPath(files, allFolders, 'missing')
    expect(result.files).toEqual([])
    expect(result.folders).toEqual([])
  })

  it('does not mutate the file list', () => {
    const snapshot = [...files]
    getItemsForPath(files, allFolders, 'docs')
    expect(files).toEqual(snapshot)
  })
})

describe('generateBreadcrumbs', () => {
  it('returns no breadcrumbs at the root', () => {
    expect(generateBreadcrumbs('', 'My Files')).toEqual([])
  })

  it('prefixes the trail with the root entry', () => {
    expect(generateBreadcrumbs('docs', 'My Files')).toEqual([
      { path: '', name: 'My Files' },
      { path: 'docs', name: 'docs' },
    ])
  })

  it('builds cumulative paths for nested folders', () => {
    expect(generateBreadcrumbs('docs/2026/q1', 'Home')).toEqual([
      { path: '', name: 'Home' },
      { path: 'docs', name: 'docs' },
      { path: 'docs/2026', name: '2026' },
      { path: 'docs/2026/q1', name: 'q1' },
    ])
  })

  it('ignores redundant separators', () => {
    expect(generateBreadcrumbs('docs//2026/', 'Home').map(b => b.path)).toEqual(
      ['', 'docs', 'docs/2026']
    )
  })
})
