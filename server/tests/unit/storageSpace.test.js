import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  evaluateStorageReservations,
  getFilesystemSpace,
} from '../../src/node/storageSpace.js'

describe('storage space reservations', () => {
  it('probes the nearest existing parent for a future path', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'most-space-'))
    try {
      const result = getFilesystemSpace(
        path.join(directory, 'future', 'file.bin')
      )

      assert.ok(result.deviceId)
      assert.ok(result.totalBytes > 0)
      assert.ok(result.availableBytes >= 0)
      assert.strictEqual(result.probePath, directory)
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })

  it('combines reservations that target the same filesystem', () => {
    const result = evaluateStorageReservations(
      [
        { path: '/data', bytes: 60, label: 'hyperdrive' },
        { path: '/downloads', bytes: 50, label: 'download' },
      ],
      targetPath => ({
        deviceId: 'same-volume',
        totalBytes: 1000,
        availableBytes: 100,
        probePath: targetPath,
      })
    )

    assert.strictEqual(result.accepted, false)
    assert.strictEqual(result.volumes.length, 1)
    assert.strictEqual(result.volumes[0].requiredBytes, 110)
    assert.deepStrictEqual(result.volumes[0].labels, ['hyperdrive', 'download'])
  })

  it('checks different filesystems independently', () => {
    const result = evaluateStorageReservations(
      [
        { path: '/data', bytes: 60 },
        { path: '/downloads', bytes: 50 },
      ],
      targetPath => ({
        deviceId: targetPath,
        totalBytes: 1000,
        availableBytes: 70,
        probePath: targetPath,
      })
    )

    assert.strictEqual(result.accepted, true)
    assert.strictEqual(result.volumes.length, 2)
  })

  it('rejects invalid reservation sizes', () => {
    assert.throws(
      () =>
        evaluateStorageReservations([
          { path: '/data', bytes: Number.MAX_SAFE_INTEGER + 1 },
        ]),
      /safe integer/
    )
  })

  it('rejects combined reservations that exceed safe integer range', () => {
    assert.throws(
      () =>
        evaluateStorageReservations(
          [
            { path: '/data', bytes: Number.MAX_SAFE_INTEGER },
            { path: '/downloads', bytes: 1 },
          ],
          () => ({
            deviceId: 'same-volume',
            totalBytes: Number.MAX_SAFE_INTEGER,
            availableBytes: Number.MAX_SAFE_INTEGER,
          })
        ),
      /Combined storage reservation/
    )
  })
})
