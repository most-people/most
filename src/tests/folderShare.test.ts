import { describe, expect, it } from 'vitest'

import { getFolderShareState } from '~/lib/folderShare'

const availableFile = (fileName: string) => ({
  fileName,
  kind: 'file',
  localAvailable: true,
  seedStatus: 'seeding',
})

describe('getFolderShareState', () => {
  it('reports empty when no folder path is given', () => {
    expect(getFolderShareState([availableFile('docs/a.md')], '')).toEqual({
      canShare: false,
      reason: 'empty',
      fileCount: 0,
      missingCount: 0,
    })
  })

  it('reports empty when the folder holds no files', () => {
    expect(getFolderShareState([availableFile('other/a.md')], 'docs')).toEqual({
      canShare: false,
      reason: 'empty',
      fileCount: 0,
      missingCount: 0,
    })
  })

  it('can share when every file in the folder is locally available', () => {
    const files = [availableFile('docs/a.md'), availableFile('docs/b.md')]
    expect(getFolderShareState(files, 'docs')).toEqual({
      canShare: true,
      reason: '',
      fileCount: 2,
      missingCount: 0,
    })
  })

  it('counts files that are not locally available', () => {
    const files = [
      availableFile('docs/a.md'),
      { fileName: 'docs/b.md', kind: 'file', localAvailable: false },
    ]
    expect(getFolderShareState(files, 'docs')).toEqual({
      canShare: false,
      reason: 'missingLocalFiles',
      fileCount: 2,
      missingCount: 1,
    })
  })

  it('treats a seeding error as missing', () => {
    const files = [
      {
        fileName: 'docs/a.md',
        kind: 'file',
        localAvailable: true,
        seedStatus: 'error',
      },
    ]
    expect(getFolderShareState(files, 'docs')).toEqual({
      canShare: false,
      reason: 'missingLocalFiles',
      fileCount: 1,
      missingCount: 1,
    })
  })

  it('ignores collection entries', () => {
    const files = [
      availableFile('docs/a.md'),
      { fileName: 'docs/bundle', kind: 'collection', localAvailable: true },
    ]
    const state = getFolderShareState(files, 'docs')
    expect(state.fileCount).toBe(1)
    expect(state.canShare).toBe(true)
  })

  it('does not include files from sibling folders with a shared prefix', () => {
    const files = [availableFile('docs/a.md'), availableFile('docs-old/b.md')]
    expect(getFolderShareState(files, 'docs').fileCount).toBe(1)
  })

  it('does not include the folder entry itself', () => {
    const files = [availableFile('docs'), availableFile('docs/a.md')]
    expect(getFolderShareState(files, 'docs').fileCount).toBe(1)
  })

  it('includes nested files below the folder', () => {
    const files = [
      availableFile('docs/deep/a.md'),
      availableFile('docs/deep/deeper/b.md'),
    ]
    expect(getFolderShareState(files, 'docs').fileCount).toBe(2)
  })

  it('normalizes separators and surrounding slashes', () => {
    const files = [availableFile('docs\\a.md')]
    expect(getFolderShareState(files, '/docs/').canShare).toBe(true)
    expect(
      getFolderShareState([availableFile('docs//a.md')], 'docs').canShare
    ).toBe(true)
  })

  it('treats a missing kind as a regular file', () => {
    const files = [{ fileName: 'docs/a.md', localAvailable: true }]
    expect(getFolderShareState(files, 'docs').canShare).toBe(true)
  })
})
