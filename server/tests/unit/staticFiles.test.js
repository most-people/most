import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { getStaticFallbackPath } from '../../src/http/staticFiles.js'

test('prefers the SPA shell for dynamic static routes', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'most-static-'))

  try {
    const indexPath = path.join(directory, 'index.html')
    const shellPath = path.join(directory, '_shell.html')
    fs.writeFileSync(indexPath, 'index')
    fs.writeFileSync(shellPath, 'shell')

    assert.equal(getStaticFallbackPath(directory), shellPath)

    fs.rmSync(shellPath)
    assert.equal(getStaticFallbackPath(directory), indexPath)

    fs.rmSync(indexPath)
    assert.equal(getStaticFallbackPath(directory), '')
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
