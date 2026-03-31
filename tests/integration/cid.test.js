import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { calculateCid } from '../../src/core/cid.js'

describe('calculateCid (real file I/O)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'most-test-'))

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('calculates consistent CID for same file content', async () => {
    const filePath = path.join(tmpDir, 'consistency-test.txt')
    fs.writeFileSync(filePath, 'hello world')

    const result1 = await calculateCid(filePath)
    const result2 = await calculateCid(filePath)

    assert.strictEqual(result1.cid.toString(), result2.cid.toString())
    assert.ok(result1.size > 0)
    assert.strictEqual(result1.size, 11) // 'hello world' is 11 bytes
  })

  it('calculates CID for Buffer content', async () => {
    const buffer = Buffer.from('test content')
    const result = await calculateCid(buffer)

    assert.ok(result.cid)
    assert.strictEqual(result.size, buffer.length)
  })

  it('detects different content produces different CID', async () => {
    const file1 = path.join(tmpDir, 'content-a.txt')
    const file2 = path.join(tmpDir, 'content-b.txt')
    fs.writeFileSync(file1, 'content A')
    fs.writeFileSync(file2, 'content B')

    const result1 = await calculateCid(file1)
    const result2 = await calculateCid(file2)

    assert.notStrictEqual(result1.cid.toString(), result2.cid.toString())
  })

  it('produces same CID for same Buffer content', async () => {
    const buffer1 = Buffer.from('identical content')
    const buffer2 = Buffer.from('identical content')

    const result1 = await calculateCid(buffer1)
    const result2 = await calculateCid(buffer2)

    assert.strictEqual(result1.cid.toString(), result2.cid.toString())
  })

  it('returns correct file size for file path', async () => {
    const filePath = path.join(tmpDir, 'size-test.bin')
    const testData = Buffer.alloc(1024, 0x42)
    fs.writeFileSync(filePath, testData)

    const result = await calculateCid(filePath)
    assert.strictEqual(result.size, 1024)
  })

  it('handles large file content', async () => {
    const filePath = path.join(tmpDir, 'large-test.bin')
    const testData = Buffer.alloc(1024 * 100, 0xAB) // 100KB
    fs.writeFileSync(filePath, testData)

    const result = await calculateCid(filePath)
    assert.strictEqual(result.size, 1024 * 100)
    assert.ok(result.cid)
  })

  it('returns CID v1 format (starts with b)', async () => {
    const filePath = path.join(tmpDir, 'cid-version.txt')
    fs.writeFileSync(filePath, 'test data')

    const result = await calculateCid(filePath)
    assert.ok(result.cid.toString().startsWith('b'), 'CID should be v1 format')
  })

  it('throws error for non-existent file', async () => {
    const nonExistentPath = path.join(tmpDir, 'does-not-exist.txt')
    await assert.rejects(
      calculateCid(nonExistentPath),
      (err) => {
        assert.ok(err.message.includes('ENOENT') || err.message.includes('calculate CID'))
        return true
      }
    )
  })

  it('handles empty file', async () => {
    const filePath = path.join(tmpDir, 'empty.txt')
    fs.writeFileSync(filePath, '')

    const result = await calculateCid(filePath)
    assert.ok(result.cid)
    assert.strictEqual(result.size, 0)
  })

  it('handles special characters in filename', async () => {
    const filePath = path.join(tmpDir, 'special-chars-测试.txt')
    fs.writeFileSync(filePath, 'content')

    const result = await calculateCid(filePath)
    assert.ok(result.cid)
  })

  it('uses rawLeaves option when provided', async () => {
    const filePath = path.join(tmpDir, 'raw-leaves.txt')
    fs.writeFileSync(filePath, 'test')

    const resultWithRawLeaves = await calculateCid(filePath, { rawLeaves: true })
    const resultWithoutRawLeaves = await calculateCid(filePath, { rawLeaves: false })

    assert.ok(resultWithRawLeaves.cid)
    assert.ok(resultWithoutRawLeaves.cid)
  })
})