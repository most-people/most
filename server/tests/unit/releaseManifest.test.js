import assert from 'node:assert'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { describe, it } from 'node:test'

import { isReleaseManifest } from '../../src/core/releaseManifest.js'

const execFileAsync = promisify(execFile)

describe('create-release-manifest', () => {
  it('recognizes Linux x86_64 AppImage assets as x64', async () => {
    const tmpDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'most-release-manifest-')
    )
    try {
      const filenames = [
        'MostBox-0.1.3-win-x64-setup.exe',
        'MostBox-0.1.3-win-arm64-setup.exe',
        'MostBox-0.1.3-mac-x64.dmg',
        'MostBox-0.1.3-mac-arm64.dmg',
        'MostBox-0.1.3-mac-x64.zip',
        'MostBox-0.1.3-mac-arm64.zip',
        'MostBox-0.1.3-mac-x64.dmg.blockmap',
        'MostBox-0.1.3-linux-x86_64.AppImage',
        'MostBox-0.1.3-linux-arm64.AppImage',
      ]

      await Promise.all(
        filenames.map(filename =>
          fs.writeFile(path.join(tmpDir, filename), filename)
        )
      )

      await execFileAsync(process.execPath, [
        'scripts/create-release-manifest.mjs',
        '--assets',
        tmpDir,
        '--tag',
        'v0.1.3',
        '--repo',
        'most-people/most',
        '--base-url',
        'https://download.most.box',
      ])

      const manifest = JSON.parse(
        await fs.readFile(path.join(tmpDir, 'latest.json'), 'utf8')
      )
      const linuxX64 = manifest.assets.find(
        asset =>
          asset.platform === 'linux' &&
          asset.arch === 'x64' &&
          asset.kind === 'installer'
      )

      assert.equal(isReleaseManifest(manifest), true)
      assert.equal(manifest.assets.length, 6)
      assert.equal(linuxX64.filename, 'MostBox-0.1.3-linux-x86_64.AppImage')
      assert.ok(manifest.assets.every(asset => asset.kind === 'installer'))
      assert.ok(
        manifest.assets.every(asset => !asset.filename.endsWith('.zip'))
      )
      assert.ok(
        manifest.assets.every(asset => !asset.filename.endsWith('.blockmap'))
      )
      assert.ok(manifest.assets.every(asset => typeof asset.cid === 'string'))
      assert.ok(
        manifest.assets.every(asset =>
          asset.githubUrl.startsWith(
            'https://github.com/most-people/most/releases/download/v0.1.3/'
          )
        )
      )
      assert.ok(
        manifest.assets.every(asset =>
          asset.r2Url.startsWith('https://download.most.box/releases/v0.1.3/')
        )
      )
      assert.ok(manifest.assets.every(asset => !('sha256' in asset)))
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  })
})
