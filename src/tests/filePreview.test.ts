import { describe, expect, it } from 'vitest'

import { getFileSubtype } from '~/lib/filePreview'

describe('getFileSubtype', () => {
  it('classifies image extensions case-insensitively', () => {
    expect(getFileSubtype('photo.PNG')).toBe('image')
    expect(getFileSubtype('photo.jpeg')).toBe('image')
    expect(getFileSubtype('photo.heic')).toBe('image')
  })

  it('classifies video extensions', () => {
    expect(getFileSubtype('clip.mp4')).toBe('video')
    expect(getFileSubtype('clip.mkv')).toBe('video')
  })

  it('classifies audio extensions', () => {
    expect(getFileSubtype('voice.opus')).toBe('audio')
    expect(getFileSubtype('song.mp3')).toBe('audio')
  })

  it('classifies text and source extensions', () => {
    expect(getFileSubtype('notes.md')).toBe('text')
    expect(getFileSubtype('index.tsx')).toBe('text')
    expect(getFileSubtype('config.yml')).toBe('text')
  })

  it('falls back to file for unknown extensions', () => {
    expect(getFileSubtype('archive.zip')).toBe('file')
    expect(getFileSubtype('binary.bin')).toBe('file')
  })

  it('maps extension-less marker filenames that are in the extension list', () => {
    // 'readme' / 'dockerfile' / 'gitignore' are listed extensions, so these
    // filenames are classified as text rather than falling back to 'file'.
    expect(getFileSubtype('README')).toBe('text')
    expect(getFileSubtype('Dockerfile')).toBe('text')
  })

  it('falls back to file when the name has no known extension', () => {
    expect(getFileSubtype('LICENSE')).toBe('file')
    expect(getFileSubtype('')).toBe('file')
    expect(getFileSubtype(undefined as unknown as string)).toBe('file')
  })

  it('uses the last extension of a multi-dot name', () => {
    expect(getFileSubtype('archive.tar.gz')).toBe('file')
    expect(getFileSubtype('photo.backup.png')).toBe('image')
  })

  it('treats a dotfile name as its own extension', () => {
    expect(getFileSubtype('.gitignore')).toBe('text')
  })
})
