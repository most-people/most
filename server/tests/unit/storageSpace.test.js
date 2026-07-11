import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  evaluateStorageReservations,
  getFilesystemSpace,
  StorageReservationLedger,
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
    assert.throws(
      () => evaluateStorageReservations([{ path: '/data', bytes: Number.NaN }]),
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

describe('StorageReservationLedger', () => {
  const probe = targetPath => ({
    deviceId: 'same-volume',
    totalBytes: 1000,
    availableBytes: 100,
    probePath: targetPath,
  })

  it('counts pending logical bytes atomically and releases them once', () => {
    const ledger = new StorageReservationLedger({ probe })
    const first = ledger.reserve({
      usedBytes: 10,
      capacityBytes: 100,
      logicalBytes: 60,
    })
    const rejected = ledger.reserve({
      usedBytes: 10,
      capacityBytes: 100,
      logicalBytes: 31,
    })

    assert.strictEqual(first.accepted, true)
    assert.strictEqual(rejected.accepted, false)
    assert.deepStrictEqual(rejected.logical, {
      usedBytes: 10,
      pendingBytes: 60,
      requestedBytes: 31,
      requiredBytes: 101,
      capacityBytes: 100,
      accepted: false,
    })
    assert.strictEqual(first.release(), true)
    assert.strictEqual(first.release(), false)

    const afterRelease = ledger.reserve({
      usedBytes: 10,
      capacityBytes: 100,
      logicalBytes: 31,
    })
    assert.strictEqual(afterRelease.accepted, true)
    afterRelease.release()
  })

  it('combines active physical reservations on the same filesystem', () => {
    const ledger = new StorageReservationLedger({ probe })
    const first = ledger.reserve({
      capacityBytes: 1000,
      reservations: [{ path: '/data', bytes: 60, label: 'hyperdrive' }],
    })
    const rejected = ledger.reserve({
      capacityBytes: 1000,
      reservations: [{ path: '/downloads', bytes: 50, label: 'download' }],
    })

    assert.strictEqual(first.accepted, true)
    assert.strictEqual(rejected.accepted, false)
    assert.strictEqual(rejected.volumes[0].pendingBytes, 60)
    assert.strictEqual(rejected.volumes[0].requestedBytes, 50)
    assert.strictEqual(rejected.volumes[0].requiredBytes, 110)
    assert.deepStrictEqual(rejected.volumes[0].labels, [
      'hyperdrive',
      'download',
    ])

    first.release()
    const afterRelease = ledger.reserve({
      capacityBytes: 1000,
      reservations: [{ path: '/downloads', bytes: 50, label: 'download' }],
    })
    assert.strictEqual(afterRelease.accepted, true)
    assert.strictEqual(afterRelease.volumes[0].requiredBytes, 50)
    afterRelease.release()
  })

  it('does not retain rejected reservations and can clear active state', () => {
    const ledger = new StorageReservationLedger({ probe })
    const rejected = ledger.reserve({
      capacityBytes: 1000,
      reservations: [{ path: '/data', bytes: 101 }],
    })
    const accepted = ledger.reserve({
      capacityBytes: 1000,
      reservations: [{ path: '/data', bytes: 60 }],
    })

    assert.strictEqual(rejected.accepted, false)
    assert.strictEqual(accepted.accepted, true)
    ledger.clear()

    const afterClear = ledger.reserve({
      capacityBytes: 1000,
      reservations: [{ path: '/data', bytes: 60 }],
    })
    assert.strictEqual(afterClear.accepted, true)
    afterClear.release()
  })
})
