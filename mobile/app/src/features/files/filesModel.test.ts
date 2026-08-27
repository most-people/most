import assert from 'node:assert/strict'
import test from 'node:test'
import { filterHoldings } from './filesModel'
import type { MobileHolding } from '../../mobileCore/types'

const holdings: MobileHolding[] = [
  {
    cid: 'bafy-active-report',
    fileName: 'Annual Report.pdf',
    peerCount: 1,
    shareLink: 'most://bafy-active-report?filename=Annual%20Report.pdf',
    size: 10,
    source: 'published',
    status: 'active',
    topicJoined: true,
  },
  {
    cid: 'bafy-error-photo',
    fileName: 'Photo.png',
    peerCount: 0,
    shareLink: 'most://bafy-error-photo?filename=Photo.png',
    size: 20,
    source: 'downloaded',
    status: 'error',
    topicJoined: false,
  },
]

test('file search matches names and CIDs case-insensitively', () => {
  assert.deepEqual(
    filterHoldings(holdings, 'REPORT', 'all').map(item => item.fileName),
    ['Annual Report.pdf']
  )
  assert.deepEqual(
    filterHoldings(holdings, 'error-photo', 'all').map(item => item.fileName),
    ['Photo.png']
  )
})

test('file filters isolate healthy and attention-required holdings', () => {
  assert.deepEqual(
    filterHoldings(holdings, '', 'active').map(item => item.cid),
    ['bafy-active-report']
  )
  assert.deepEqual(
    filterHoldings(holdings, '', 'attention').map(item => item.cid),
    ['bafy-error-photo']
  )
})
