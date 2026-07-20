import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import {
  getInternalHoldingCleanupPaths,
  isPathInsideDirectory,
  removeHoldingRecord,
} from './holding-records.mjs'

const VALID_CID = 'bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e'

describe('mobile holding deletion records', () => {
  it('only schedules app-internal downloaded holding copies for deletion', () => {
    const storagePath = '/data/user/0/box.most/files/mostbox-core'
    const downloadPath = path.posix.join(storagePath, 'downloads')
    const internalCopy = path.posix.join(downloadPath, 'hello.txt')

    assert.deepEqual(
      getInternalHoldingCleanupPaths(
        {
          localPath: internalCopy,
          downloadPath,
        },
        path.posix
      ),
      [internalCopy]
    )

    assert.deepEqual(
      getInternalHoldingCleanupPaths(
        {
          localPath: '/storage/emulated/0/Download/hello.txt',
          downloadPath,
        },
        path.posix
      ),
      []
    )

    assert.deepEqual(
      getInternalHoldingCleanupPaths(
        {
          localPath: `${downloadPath}-saved/hello.txt`,
          downloadPath,
        },
        path.posix
      ),
      []
    )

    assert.deepEqual(
      getInternalHoldingCleanupPaths(
        {
          localPath: downloadPath,
          downloadPath,
        },
        path.posix
      ),
      []
    )
  })

  it('compares Windows-style paths case-insensitively for local tests', () => {
    assert.equal(
      isPathInsideDirectory(
        'C:\\Users\\4u\\AppData\\MostBox\\downloads\\hello.txt',
        'c:\\users\\4u\\appdata\\mostbox\\downloads',
        path.win32
      ),
      true
    )

    assert.equal(
      isPathInsideDirectory(
        'C:\\Users\\4u\\AppData\\MostBox\\downloads-old\\hello.txt',
        'c:\\users\\4u\\appdata\\mostbox\\downloads',
        path.win32
      ),
      false
    )
  })

  it('removes only the target CID so the same link can be downloaded again', () => {
    const otherCid =
      'bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku'
    const holdings = [
      {
        cid: VALID_CID,
        fileName: 'hello.txt',
        size: 11,
        topic: 'topic-a',
        driveName: 'drive-topic-a',
        source: 'downloaded',
      },
      {
        cid: otherCid,
        fileName: 'empty.txt',
        size: 0,
        topic: 'topic-b',
        driveName: 'drive-topic-b',
        source: 'published',
      },
    ]

    const result = removeHoldingRecord(holdings, VALID_CID)
    assert.equal(result.removed, true)
    assert.deepEqual(
      result.holdings.map(holding => holding.cid),
      [otherCid]
    )
    assert.equal(
      result.holdings.some(holding => holding.cid === VALID_CID),
      false
    )

    const rejoinedHolding = {
      cid: VALID_CID,
      fileName: 'hello.txt',
      size: 11,
      topic: 'topic-a',
      driveName: 'drive-topic-a',
      source: 'downloaded',
    }
    const afterRedownload = [rejoinedHolding, ...result.holdings]

    assert.equal(afterRedownload[0].cid, VALID_CID)
    assert.equal(afterRedownload[0].driveName, 'drive-topic-a')
    assert.equal(afterRedownload[0].topic, 'topic-a')
  })
})
