import { it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { findPackageJSON } from 'node:module'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { patchHyperswarmSource } from '../../../scripts/patch-hyperswarm-runtime.mjs'

it('applies the discovery retry patch idempotently to the installed runtime', async () => {
  const packagePath = findPackageJSON('hyperswarm', import.meta.url)
  const { version } = JSON.parse(await fs.readFile(packagePath, 'utf8'))
  const source = await fs.readFile(
    path.join(path.dirname(packagePath), 'index.js'),
    'utf8'
  )
  const patched = patchHyperswarmSource(source, version)
  assert.equal(patchHyperswarmSource(patched, version), patched)
})

it('requires revalidation when the Hyperswarm version changes', () => {
  assert.throws(() => patchHyperswarmSource('', '4.18.0'), /Revalidate/)
})

it('rejects an unexpected dependency source without partially writing it', async t => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'mostbox-swarm-patch-')
  )
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const packageDirectory = path.join(directory, 'node_modules', 'hyperswarm')
  await fs.mkdir(packageDirectory, { recursive: true })
  await fs.writeFile(path.join(directory, 'package.json'), '{}')
  await fs.writeFile(
    path.join(packageDirectory, 'package.json'),
    JSON.stringify({ name: 'hyperswarm', version: '4.17.2', main: 'index.js' })
  )
  const sourcePath = path.join(packageDirectory, 'index.js')
  const source = '    const conn = this.dht.connect(peerInfo.publicKey, {\n'
  await fs.writeFile(sourcePath, source)
  assert.throws(
    () =>
      execFileSync(
        process.execPath,
        [
          fileURLToPath(
            new URL(
              '../../../scripts/patch-hyperswarm-runtime.mjs',
              import.meta.url
            )
          ),
        ],
        { cwd: directory, stdio: 'pipe' }
      ),
    /Unexpected Hyperswarm/
  )
  assert.equal(await fs.readFile(sourcePath, 'utf8'), source)
})
