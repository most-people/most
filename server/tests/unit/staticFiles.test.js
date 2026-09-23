import test from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  getStaticFallbackPath,
  registerStaticRoutes,
} from '../../src/http/staticFiles.js'

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

test('does not expose removed knowledge routes', async () => {
  const app = new Hono()
  registerStaticRoutes(app)

  for (const pathname of ['/note', '/note/', '/api/note-vault/files']) {
    const response = await app.request(pathname)
    assert.equal(response.status, 404)
  }
})
