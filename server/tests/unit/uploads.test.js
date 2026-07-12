import { describe, it } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import { PassThrough } from 'node:stream'
import { parseMultipartBusboy, UPLOAD_TMP_DIR } from '../../src/http/uploads.js'

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

function listUploadTempNames() {
  if (!fs.existsSync(UPLOAD_TMP_DIR)) return new Set()
  return new Set(fs.readdirSync(UPLOAD_TMP_DIR))
}

async function waitFor(predicate, description) {
  const start = Date.now()
  while (Date.now() - start < 1000) {
    if (predicate()) return
    await sleep(25)
  }
  throw new Error(`Timed out waiting for ${description}`)
}

function getNewUploadTempNames(before) {
  return [...listUploadTempNames()].filter(name => !before.has(name))
}

describe('multipart uploads', () => {
  it('cleans the temporary file when an upload is aborted', async () => {
    const boundary = '----AbortUploadBoundary'
    const req = new PassThrough()
    req.headers = {
      'content-type': `multipart/form-data; boundary=${boundary}`,
    }
    const before = listUploadTempNames()
    const parsing = parseMultipartBusboy(req, 1024 * 1024)

    req.write(
      [
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="abort.bin"',
        'Content-Type: application/octet-stream',
        '',
        '',
      ].join('\r\n')
    )
    req.write(Buffer.alloc(32 * 1024))

    await waitFor(
      () => getNewUploadTempNames(before).length > 0,
      'upload temp file creation'
    )

    req.emit('aborted')
    req.destroy()

    await assert.rejects(parsing, /Upload aborted/)
    await waitFor(
      () => getNewUploadTempNames(before).length === 0,
      'aborted upload temp cleanup'
    )
    await sleep(100)
    assert.deepStrictEqual(getNewUploadTempNames(before), [])
  })
})
