import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { describe, it } from 'node:test'

import { assertReleaseCorsHeaders } from '../../../scripts/verify-release-cors.mjs'

function createHeaders(overrides = {}) {
  return new Headers({
    'access-control-allow-origin': 'https://most.box',
    'access-control-allow-methods': 'GET, HEAD',
    'access-control-expose-headers':
      'Cache-Control, Content-Length, Content-Type, ETag, Last-Modified',
    vary: 'Accept-Encoding, Origin',
    ...overrides,
  })
}

describe('release CORS verification', () => {
  it('accepts the public GET and preflight response contract', () => {
    const headers = createHeaders()

    assert.doesNotThrow(() =>
      assertReleaseCorsHeaders(headers, 'https://most.box')
    )
    assert.doesNotThrow(() =>
      assertReleaseCorsHeaders(headers, 'https://most.box', true)
    )
  })

  it('rejects an unexpected allowed origin or incomplete methods', () => {
    assert.throws(
      () =>
        assertReleaseCorsHeaders(
          createHeaders({ 'access-control-allow-origin': '*' }),
          'https://most.box'
        ),
      /Expected Access-Control-Allow-Origin/
    )
    assert.throws(
      () =>
        assertReleaseCorsHeaders(
          createHeaders({ 'access-control-allow-methods': 'GET' }),
          'https://most.box',
          true
        ),
      /include HEAD/
    )
  })

  it('keeps both R2 workflows on strict public verification', async () => {
    const [releaseWorkflow, verifyWorkflow] = await Promise.all([
      fs.readFile('.github/workflows/release.yml', 'utf8'),
      fs.readFile('.github/workflows/verify-r2-release.yml', 'utf8'),
    ])

    assert.doesNotMatch(releaseWorkflow, /put-bucket-cors|continue-on-error/)
    assert.match(releaseWorkflow, /Verify public R2 CORS/)
    assert.match(verifyWorkflow, /Verify public release CORS/)
    assert.match(releaseWorkflow, /verify-release-cors\.mjs/)
    assert.match(verifyWorkflow, /verify-release-cors\.mjs/)
    assert.match(verifyWorkflow, /release_tag:/)
    assert.match(verifyWorkflow, /gh release download "\$RELEASE_TAG"/)
    assert.match(verifyWorkflow, /create-release-manifest\.mjs/)
    assert.match(verifyWorkflow, /Expected 7 release installers/)
    assert.doesNotMatch(
      verifyWorkflow,
      /s3 rm|Delete previous R2 release assets/
    )
  })
})
