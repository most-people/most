import { describe, it, after } from 'node:test'
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
    const testData = Buffer.alloc(1024 * 100, 0xab) // 100KB
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

  it('matches golden CID samples for protocol stability', async () => {
    const samples = [
      {
        name: 'empty',
        content: Buffer.alloc(0),
        expected: 'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku',
      },
      {
        name: 'hello-world',
        content: Buffer.from('hello world'),
        expected: 'bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e',
      },
      {
        name: 'cross-chunk',
        content: Buffer.from(
          Array.from({ length: 256 * 1024 + 1 }, (_, i) => i % 251)
        ),
        expected: 'bafybeiexg2oqkfnj56l7fcmawswqbijt5shq4b5rg6a546uwpkqqzwjioi',
      },
    ]

    for (const sample of samples) {
      const result = await calculateCid(sample.content)
      assert.strictEqual(
        result.cid.toString(),
        sample.expected,
        `${sample.name} CID changed`
      )
    }
  })

  it('throws error for non-existent file', async () => {
    const nonExistentPath = path.join(tmpDir, 'does-not-exist.txt')
    await assert.rejects(calculateCid(nonExistentPath), err => {
      assert.ok(
        err.message.includes('ENOENT') || err.message.includes('calculate CID')
      )
      return true
    })
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
})
