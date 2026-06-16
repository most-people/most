import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  createCidRoutePathFromMostLink,
  createMostDeepLinkTarget,
  findMostDeepLinkArg,
} from '../../../electron/deepLink.js'

const VALID_CID = 'bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e'

describe('Electron most:// deep links', () => {
  it('finds most links in process arguments', () => {
    const link = `most://${VALID_CID}`
    assert.strictEqual(
      findMostDeepLinkArg(['electron.exe', '.', link]),
      link
    )
  })

  it('maps bare CID links to the CID page', () => {
    assert.strictEqual(
      createCidRoutePathFromMostLink(`most://${VALID_CID}`),
      `/cid/${VALID_CID}`
    )
  })

  it('preserves filename query parameters when mapping to the CID page', () => {
    assert.strictEqual(
      createCidRoutePathFromMostLink(
        `most://${VALID_CID}?filename=${encodeURIComponent('测试 文件.txt')}`
      ),
      `/cid/${VALID_CID}?filename=${encodeURIComponent('测试 文件.txt')}`
    )
  })

  it('creates full localhost targets for Electron navigation', () => {
    assert.strictEqual(
      createMostDeepLinkTarget(
        `most://${VALID_CID}?filename=a.txt`,
        'http://localhost:1976'
      ),
      `http://localhost:1976/cid/${VALID_CID}?filename=a.txt`
    )
  })
})
