import { describe, it } from 'node:test'
import assert from 'node:assert'
import { getDownloadCheckErrorMessageFromPayload } from '../../src/utils/downloadMessages.js'

describe('getDownloadCheckErrorMessageFromPayload', () => {
  it('explains timeouts as missing online seeds', () => {
    assert.match(
      getDownloadCheckErrorMessageFromPayload({}, 'TimeoutError'),
      /暂时没有等到在线种子响应/
    )
  })

  it('uses server conflict detail when available', () => {
    assert.strictEqual(
      getDownloadCheckErrorMessageFromPayload({
        status: 409,
        code: 'CONFLICT',
        error: '已有同名文件: a.txt',
      }),
      '已有同名文件: a.txt，请先处理同名文件后再下载。'
    )
  })

  it('maps no-peer status and codes to the same user action', () => {
    const expected =
      '暂时没有发现在线种子。请确认分享者或其他下载者仍在线做种，稍后再检测。'
    assert.strictEqual(
      getDownloadCheckErrorMessageFromPayload({
        status: 503,
        code: 'PEER_NOT_FOUND',
      }),
      expected
    )
    assert.strictEqual(
      getDownloadCheckErrorMessageFromPayload({ status: 503 }),
      expected
    )
  })
})
