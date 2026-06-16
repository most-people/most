import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { isMainModule } from '../../index.js'

const serverIndexPath = path.resolve('server/index.js')
const serverIndexUrl = pathToFileURL(serverIndexPath).href

describe('server entrypoint detection', () => {
  test('detects direct node execution', () => {
    assert.equal(
      isMainModule({
        moduleUrl: serverIndexUrl,
        argv: ['node', serverIndexPath],
        env: {},
      }),
      true
    )
  })

  test('detects PM2 direct script execution', () => {
    assert.equal(
      isMainModule({
        moduleUrl: serverIndexUrl,
        argv: ['node', '/usr/local/lib/node_modules/pm2/lib/ProcessContainerFork.js'],
        env: { pm_exec_path: serverIndexPath },
      }),
      true
    )
  })

  test('does not treat unrelated imports as direct execution', () => {
    assert.equal(
      isMainModule({
        moduleUrl: serverIndexUrl,
        argv: ['node', path.resolve('server/tests/unit/serverEntry.test.js')],
        env: {},
      }),
      false
    )
  })
})
