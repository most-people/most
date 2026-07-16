import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  STORAGE_SCHEMA_FILE,
  STORAGE_SCHEMA_VERSION,
  ensureStorageSchema,
} from '../../src/node/storageSchema.js'

describe('storage schema boundary', () => {
  it('creates schema 1 only for a clean data directory', t => {
    const dataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'most-schema-'))
    t.after(() => fs.rmSync(dataPath, { recursive: true, force: true }))

    assert.deepStrictEqual(ensureStorageSchema(dataPath), {
      version: STORAGE_SCHEMA_VERSION,
      created: true,
    })
    assert.deepStrictEqual(
      JSON.parse(fs.readFileSync(path.join(dataPath, STORAGE_SCHEMA_FILE))),
      { version: 1 }
    )
  })

  it('fails closed for old data and future schema versions', t => {
    const oldPath = fs.mkdtempSync(path.join(os.tmpdir(), 'most-schema-old-'))
    const futurePath = fs.mkdtempSync(
      path.join(os.tmpdir(), 'most-schema-future-')
    )
    t.after(() => {
      fs.rmSync(oldPath, { recursive: true, force: true })
      fs.rmSync(futurePath, { recursive: true, force: true })
    })

    fs.writeFileSync(path.join(oldPath, 'node-holdings.json'), '[]')
    assert.throws(
      () => ensureStorageSchema(oldPath),
      error => error.code === 'STORAGE_SCHEMA_RESET_REQUIRED'
    )

    fs.writeFileSync(
      path.join(futurePath, STORAGE_SCHEMA_FILE),
      JSON.stringify({ version: 2 })
    )
    assert.throws(
      () => ensureStorageSchema(futurePath),
      error => error.code === 'STORAGE_SCHEMA_UNSUPPORTED'
    )
  })
})
