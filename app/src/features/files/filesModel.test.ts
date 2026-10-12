import assert from 'node:assert/strict'
import test from 'node:test'
import {
  filterHoldings,
  getChildFolders,
  getFileBreadcrumbs,
  getFileFolders,
  getFolderShareState,
  getHoldingsForPath,
  parseFileDisplayPath,
} from './filesModel'
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
  {
    cid: 'bafy-guides-setup',
    fileName: 'Guides/Setup/Install.txt',
    localAvailable: true,
    peerCount: 1,
    shareLink: 'most://bafy-guides-setup?filename=Install.txt',
    size: 30,
    source: 'published',
    status: 'active',
    topicJoined: true,
  },
  {
    cid: 'bafy-guides-readme',
    fileName: 'Guides/README.txt',
    localAvailable: false,
    peerCount: 0,
    shareLink: 'most://bafy-guides-readme?filename=README.txt',
    size: 40,
    source: 'published',
    status: 'queued',
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
    ['bafy-active-report', 'bafy-guides-setup']
  )
  assert.deepEqual(
    filterHoldings(holdings, '', 'attention').map(item => item.cid),
    ['bafy-error-photo', 'bafy-guides-readme']
  )
})

test('builds nested virtual folders and breadcrumbs from display paths', () => {
  const folders = getFileFolders(holdings)
  assert.deepEqual(folders, ['Guides', 'Guides/Setup'])
  assert.deepEqual(getChildFolders(folders, ''), [
    { name: 'Guides', path: 'Guides' },
  ])
  assert.deepEqual(getChildFolders(folders, 'Guides'), [
    { name: 'Setup', path: 'Guides/Setup' },
  ])
  assert.deepEqual(
    getHoldingsForPath(holdings, 'Guides').map(item => item.cid),
    ['bafy-guides-readme']
  )
  assert.deepEqual(getFileBreadcrumbs('Guides/Setup', 'File library'), [
    { name: 'File library', path: '' },
    { name: 'Guides', path: 'Guides' },
    { name: 'Setup', path: 'Guides/Setup' },
  ])
  assert.deepEqual(parseFileDisplayPath('Guides\\Setup//Install.txt'), {
    folder: 'Guides/Setup',
    name: 'Install.txt',
  })
})

test('folder sharing requires every regular file to be local and healthy', () => {
  assert.deepEqual(getFolderShareState(holdings, 'Guides/Setup'), {
    canShare: true,
    fileCount: 1,
    missingCount: 0,
    reason: '',
  })
  assert.deepEqual(getFolderShareState(holdings, 'Guides'), {
    canShare: false,
    fileCount: 2,
    missingCount: 1,
    reason: 'missingLocalFiles',
  })
  assert.deepEqual(getFolderShareState(holdings, 'Missing'), {
    canShare: false,
    fileCount: 0,
    missingCount: 0,
    reason: 'empty',
  })
})
