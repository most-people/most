import { describe, it } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import { sanitizeFilename, formatFileSize, validateAndSanitizePath, validateFileSize, checkDirectoryWritable } from '../../src/utils/security.js'

describe('sanitizeFilename', () => {
  it('throws for non-string input', () => {
    assert.throws(() => sanitizeFilename(null), /Filename must be a string/)
    assert.throws(() => sanitizeFilename(undefined), /Filename must be a string/)
    assert.throws(() => sanitizeFilename(123), /Filename must be a string/)
  })

  it('blocks path traversal with ..', () => {
    assert.strictEqual(sanitizeFilename('../etc/passwd'), 'etc/passwd')
    assert.strictEqual(sanitizeFilename('foo/../bar'), 'foo/_/bar')
    assert.strictEqual(sanitizeFilename('foo/bar/../baz'), 'foo/bar/_/baz')
  })

  it('blocks absolute path traversal', () => {
    assert.strictEqual(sanitizeFilename('/etc/passwd'), 'etc/passwd')
    assert.strictEqual(sanitizeFilename('C:\\Windows\\System32'), 'C_/Windows/System32')
  })

  it('blocks Windows reserved names', () => {
    assert.ok(sanitizeFilename('CON').startsWith('_'))
    assert.ok(sanitizeFilename('con').startsWith('_'))
    assert.ok(sanitizeFilename('PRN').startsWith('_'))
    assert.ok(sanitizeFilename('AUX').startsWith('_'))
    assert.ok(sanitizeFilename('NUL').startsWith('_'))
    assert.ok(sanitizeFilename('COM1').startsWith('_'))
    assert.ok(sanitizeFilename('LPT1').startsWith('_'))
    assert.ok(sanitizeFilename('com2').startsWith('_'))
    assert.ok(sanitizeFilename('lpt9').startsWith('_'))
  })

  it('replaces dangerous characters', () => {
    assert.strictEqual(sanitizeFilename('file<name>'), 'file_name_')
    assert.strictEqual(sanitizeFilename('fi"le'), 'fi_le')
    assert.strictEqual(sanitizeFilename('file:name'), 'file_name')
    assert.strictEqual(sanitizeFilename('file|name'), 'file_name')
    assert.strictEqual(sanitizeFilename('file?name'), 'file_name')
    assert.strictEqual(sanitizeFilename('file*name'), 'file_name')
  })

  it('preserves folder paths with forward slashes', () => {
    assert.strictEqual(sanitizeFilename('folder/file.txt'), 'folder/file.txt')
    assert.strictEqual(sanitizeFilename('a/b/c/d.txt'), 'a/b/c/d.txt')
  })

  it('converts backslashes to forward slashes', () => {
    assert.strictEqual(sanitizeFilename('folder\\file.txt'), 'folder/file.txt')
    assert.strictEqual(sanitizeFilename('a\\b\\c'), 'a/b/c')
  })

  it('trims leading dots and spaces', () => {
    assert.strictEqual(sanitizeFilename('.hidden'), 'hidden')
    assert.strictEqual(sanitizeFilename('..hidden'), 'hidden')
    assert.strictEqual(sanitizeFilename('  file.txt'), 'file.txt')
  })

  it('normalizes multiple consecutive slashes', () => {
    assert.strictEqual(sanitizeFilename('foo//bar'), 'foo/bar')
    assert.strictEqual(sanitizeFilename('foo///bar///baz'), 'foo/bar/baz')
  })

  it('returns unnamed for empty result', () => {
    assert.strictEqual(sanitizeFilename('..'), 'unnamed')
    assert.strictEqual(sanitizeFilename('/'), 'unnamed')
  })

  it('limits segment length to 255 characters', () => {
    const longName = 'a'.repeat(300) + '.txt'
    const result = sanitizeFilename(longName)
    assert.ok(result.length <= 255 + 4) // +4 for '.txt'
  })

  it('preserves file extension', () => {
    assert.strictEqual(sanitizeFilename('document.pdf'), 'document.pdf')
    assert.strictEqual(sanitizeFilename('photo.jpeg'), 'photo.jpeg')
    assert.strictEqual(sanitizeFilename('archive.tar.gz'), 'archive.tar.gz')
  })

  it('handles Unicode characters', () => {
    assert.strictEqual(sanitizeFilename('文件.txt'), '文件.txt')
    assert.strictEqual(sanitizeFilename('файл.txt'), 'файл.txt')
    assert.strictEqual(sanitizeFilename('ファイル.txt'), 'ファイル.txt')
  })
})

describe('formatFileSize', () => {
  it('formats 0 bytes', () => {
    assert.strictEqual(formatFileSize(0), '0.00 B')
  })

  it('formats bytes', () => {
    assert.strictEqual(formatFileSize(500), '500.00 B')
    assert.strictEqual(formatFileSize(1023), '1023.00 B')
  })

  it('formats KB', () => {
    assert.strictEqual(formatFileSize(1024), '1.00 KB')
    assert.strictEqual(formatFileSize(1536), '1.50 KB')
    assert.strictEqual(formatFileSize(10240), '10.00 KB')
  })

  it('formats MB', () => {
    assert.strictEqual(formatFileSize(1024 * 1024), '1.00 MB')
    assert.strictEqual(formatFileSize(1024 * 1024 * 5.5), '5.50 MB')
  })

  it('formats GB', () => {
    assert.strictEqual(formatFileSize(1024 * 1024 * 1024), '1.00 GB')
    assert.strictEqual(formatFileSize(1024 * 1024 * 1024 * 2), '2.00 GB')
  })

  it('formats TB', () => {
    assert.strictEqual(formatFileSize(1024 * 1024 * 1024 * 1024), '1.00 TB')
  })

  it('handles fractional values', () => {
    const result = formatFileSize(1024 * 1024 * 1.5)
    assert.ok(result.startsWith('1.50'))
  })
})

describe('validateAndSanitizePath', () => {
  it('rejects non-string input', () => {
    assert.strictEqual(validateAndSanitizePath(null).error, 'Path must be a string')
    assert.strictEqual(validateAndSanitizePath(123).error, 'Path must be a string')
  })

  it('blocks path traversal', () => {
    const result = validateAndSanitizePath('../etc/passwd')
    assert.strictEqual(result.error, 'Path traversal detected: path cannot contain ".."')
  })

  it('allows normal paths', () => {
    const result = validateAndSanitizePath('/home/user/file.txt')
    assert.strictEqual(result.error, undefined)
    assert.ok(result.cleanPath.length > 0)
  })

  it('removes zero-width characters', () => {
    const result = validateAndSanitizePath('/path\u200B/to/file')
    assert.strictEqual(result.cleanPath.includes('\u200B'), false)
  })

  it('removes quotes', () => {
    const result = validateAndSanitizePath('/path/"file".txt')
    assert.strictEqual(result.cleanPath.includes('"'), false)
  })

  it('respects allowedBase option', () => {
    const result = validateAndSanitizePath('/home/user/file.txt', { allowedBase: '/home/user' })
    assert.strictEqual(result.error, undefined)
  })

  it('rejects path traversal before allowedBase check', () => {
    const result = validateAndSanitizePath('/home/user/../etc/passwd', { allowedBase: '/home/user' })
    assert.strictEqual(result.error, 'Path traversal detected: path cannot contain ".."')
  })

  it('rejects path that escapes allowedBase via sibling directory', () => {
    const result = validateAndSanitizePath('/home/user2/file.txt', { allowedBase: '/home/user' })
    assert.strictEqual(result.error, 'Path must be within allowed directory')
  })

  it('allows exact match of allowedBase', () => {
    const result = validateAndSanitizePath('/home/user', { allowedBase: '/home/user' })
    assert.strictEqual(result.error, undefined)
  })
})

describe('validateFileSize', () => {
  it('returns valid for existing file within limit', async () => {
    const result = await validateFileSize('package.json', 1024 * 1024)
    assert.strictEqual(result.valid, true)
    assert.ok(result.size > 0)
  })

  it('returns invalid for non-existent file', async () => {
    const result = await validateFileSize('/nonexistent/file.txt')
    assert.strictEqual(result.valid, false)
    assert.strictEqual(result.error, 'File does not exist')
  })

  it('returns invalid for directory', async () => {
    const result = await validateFileSize('tests')
    assert.strictEqual(result.valid, false)
    assert.strictEqual(result.error, 'Path is not a file')
  })

  it('returns invalid for oversized file', async () => {
    const result = await validateFileSize('package.json', 1)
    assert.strictEqual(result.valid, false)
    assert.ok(result.error.includes('exceeds limit'))
  })

  it('uses custom max size', async () => {
    const result = await validateFileSize('package.json', 100)
    assert.strictEqual(result.valid, false)
    assert.ok(result.size > 100)
  })
})

describe('checkDirectoryWritable', () => {
  it('returns writable for existing directory', async () => {
    const result = await checkDirectoryWritable('tests')
    assert.strictEqual(result.writable, true)
  })

  it('creates and returns writable for non-existent directory', async () => {
    const testDir = 'tests/temp-write-test-' + Date.now()
    try {
      const result = await checkDirectoryWritable(testDir)
      assert.strictEqual(result.writable, true)
    } finally {
      try { await fs.promises.rm(testDir, { recursive: true, force: true }) } catch {}
    }
  })
})