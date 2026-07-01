import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  getDownloadCheckErrorMessageFromPayload,
  getDownloadLinkValidationMessage,
} from '../../src/utils/downloadMessages.js'

const VALID_LINK =
  'most://bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e?filename=a.txt'
const VALID_CID = 'bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e'

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

describe('getDownloadLinkValidationMessage', () => {
  it('accepts a valid most link', () => {
    assert.strictEqual(getDownloadLinkValidationMessage(VALID_LINK), null)
  })

  it('accepts web entry links and bare CID targets', () => {
    assert.strictEqual(
      getDownloadLinkValidationMessage(
        `https://most.box/cid/${VALID_CID}?filename=a.txt`
      ),
      null
    )
    assert.strictEqual(getDownloadLinkValidationMessage(VALID_CID), null)
    assert.strictEqual(
      getDownloadLinkValidationMessage(`${VALID_CID}?filename=a.txt`),
      null
    )
  })

  it('rejects empty links before parsing', () => {
    assert.strictEqual(
      getDownloadLinkValidationMessage(' '),
      '请先粘贴分享链接或 CID。'
    )
  })

  it('accepts links with blank filename values', () => {
    assert.strictEqual(
      getDownloadLinkValidationMessage(
        'most://bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e?filename=%20%20'
      ),
      null
    )
  })

  it('uses link parser errors for invalid links', () => {
    assert.strictEqual(
      getDownloadLinkValidationMessage('https://example.com'),
      'CID 无效，请确认输入末尾是有效的 CID 或 CID?filename=...。'
    )
    assert.strictEqual(
      getDownloadLinkValidationMessage(`${VALID_LINK}&foo=bar`),
      '链接包含暂不支持的参数 foo，请只保留 filename。'
    )
  })
})
