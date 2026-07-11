import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  METADATA_BACKUP_SUFFIX,
  readMetadataFile,
  writeMetadataFile,
} from '../../src/node/metadataFile.js'

function withTempDir(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'most-metadata-'))
  try {
    return run(directory)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
}

describe('metadata file persistence', () => {
  it('writes a primary file and an initial recovery backup', () => {
    withTempDir(directory => {
      const filePath = path.join(directory, 'records.json')
      const data = JSON.stringify({ version: 1 })

      writeMetadataFile(filePath, data)

      assert.strictEqual(fs.readFileSync(filePath, 'utf-8'), data)
      assert.strictEqual(
        fs.readFileSync(`${filePath}${METADATA_BACKUP_SUFFIX}`, 'utf-8'),
        data
      )
    })
  })

  it('keeps the previous valid generation as the next backup', () => {
    withTempDir(directory => {
      const filePath = path.join(directory, 'records.json')
      writeMetadataFile(filePath, JSON.stringify({ version: 1 }))
      writeMetadataFile(filePath, JSON.stringify({ version: 2 }))

      assert.deepStrictEqual(readMetadataFile(filePath), { version: 2 })
      assert.deepStrictEqual(
        JSON.parse(
          fs.readFileSync(`${filePath}${METADATA_BACKUP_SUFFIX}`, 'utf-8')
        ),
        { version: 1 }
      )
    })
  })

  it('recovers a corrupt primary and quarantines it', () => {
    withTempDir(directory => {
      const filePath = path.join(directory, 'records.json')
      writeMetadataFile(filePath, JSON.stringify({ version: 1 }))
      writeMetadataFile(filePath, JSON.stringify({ version: 2 }))
      fs.writeFileSync(filePath, '{broken', 'utf-8')

      assert.deepStrictEqual(readMetadataFile(filePath, { label: 'records' }), {
        version: 1,
      })
      assert.deepStrictEqual(JSON.parse(fs.readFileSync(filePath, 'utf-8')), {
        version: 1,
      })
      assert.strictEqual(
        fs
          .readdirSync(directory)
          .filter(name => name.startsWith('records.json.corrupt-')).length,
        1
      )
    })
  })

  it('restores a missing primary from the backup', () => {
    withTempDir(directory => {
      const filePath = path.join(directory, 'records.json')
      writeMetadataFile(filePath, JSON.stringify({ version: 1 }))
      fs.rmSync(filePath)

      assert.deepStrictEqual(readMetadataFile(filePath), { version: 1 })
      assert.deepStrictEqual(JSON.parse(fs.readFileSync(filePath, 'utf-8')), {
        version: 1,
      })
    })
  })

  it('fails closed when neither generation can be parsed', () => {
    withTempDir(directory => {
      const filePath = path.join(directory, 'records.json')
      fs.writeFileSync(filePath, '{primary', 'utf-8')
      fs.writeFileSync(
        `${filePath}${METADATA_BACKUP_SUFFIX}`,
        '{backup',
        'utf-8'
      )

      assert.throws(
        () => readMetadataFile(filePath, { label: 'records' }),
        error =>
          error.code === 'PERSISTENCE_ERROR' &&
          error.details?.metadata === 'records'
      )
      assert.strictEqual(fs.readFileSync(filePath, 'utf-8'), '{primary')
    })
  })

  it('uses the backup when a custom parser rejects the primary shape', () => {
    withTempDir(directory => {
      const filePath = path.join(directory, 'records.json')
      writeMetadataFile(filePath, JSON.stringify(['valid']))
      fs.writeFileSync(filePath, JSON.stringify({ invalid: true }), 'utf-8')
      const parseArray = data => {
        const parsed = JSON.parse(data)
        if (!Array.isArray(parsed)) throw new TypeError('array required')
        return parsed
      }

      assert.deepStrictEqual(
        readMetadataFile(filePath, { label: 'records', parse: parseArray }),
        ['valid']
      )
    })
  })
})
