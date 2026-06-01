import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  findUpdateAsset,
  formatBytes,
  getAvailableUpdate,
  getCurrentArch,
  getCurrentPlatform,
  getReleaseManifestUrl,
  isNewerVersion,
} from './updateChecker.js'

const manifest = {
  version: '0.1.3',
  publishedAt: '2026-06-01T00:00:00.000Z',
  assets: [
    {
      platform: 'windows',
      arch: 'x64',
      kind: 'installer',
      filename: 'MostBox-0.1.3-win-x64-setup.exe',
      size: 112197632,
      sha256: 'hash',
      r2Url:
        'https://download.most.box/releases/v0.1.3/MostBox-0.1.3-win-x64-setup.exe',
      githubUrl:
        'https://github.com/most-people/most/releases/download/v0.1.3/MostBox-0.1.3-win-x64-setup.exe',
    },
    {
      platform: 'windows',
      arch: 'arm64',
      kind: 'installer',
      filename: 'MostBox-0.1.3-win-arm64-setup.exe',
      githubUrl:
        'https://github.com/most-people/most/releases/download/v0.1.3/MostBox-0.1.3-win-arm64-setup.exe',
    },
    {
      platform: 'macos',
      arch: 'arm64',
      kind: 'installer',
      filename: 'MostBox-0.1.3-mac-arm64.dmg',
      githubUrl:
        'https://github.com/most-people/most/releases/download/v0.1.3/MostBox-0.1.3-mac-arm64.dmg',
    },
  ],
}

describe('desktop update checker', () => {
  it('uses the public R2 manifest by default and allows env override', () => {
    assert.equal(
      getReleaseManifestUrl({}),
      'https://download.most.box/releases/latest.json'
    )
    assert.equal(
      getReleaseManifestUrl({
        MOSTBOX_RELEASE_MANIFEST_URL: 'http://localhost:9999/latest.json',
      }),
      'http://localhost:9999/latest.json'
    )
  })

  it('maps process platform and arch to release manifest values', () => {
    assert.equal(getCurrentPlatform('win32'), 'windows')
    assert.equal(getCurrentPlatform('darwin'), 'macos')
    assert.equal(getCurrentPlatform('linux'), 'linux')
    assert.equal(getCurrentPlatform('freebsd'), null)

    assert.equal(getCurrentArch('x64'), 'x64')
    assert.equal(getCurrentArch('arm64'), 'arm64')
    assert.equal(getCurrentArch('ia32'), null)
  })

  it('compares stable and prefixed semver strings safely', () => {
    assert.equal(isNewerVersion('0.1.3', '0.1.2'), true)
    assert.equal(isNewerVersion('v0.2.0', '0.1.9'), true)
    assert.equal(isNewerVersion('0.1.2', '0.1.2'), false)
    assert.equal(isNewerVersion('0.1.1', '0.1.2'), false)
    assert.equal(isNewerVersion('0.1.3-beta.1', '0.1.2'), true)
    assert.equal(isNewerVersion('not-a-version', '0.1.2'), false)
    assert.equal(isNewerVersion('0.1.3', 'not-a-version'), false)
  })

  it('matches the current platform installer asset', () => {
    assert.equal(
      findUpdateAsset(manifest, 'windows', 'x64')?.filename,
      'MostBox-0.1.3-win-x64-setup.exe'
    )
    assert.equal(
      findUpdateAsset(manifest, 'windows', 'arm64')?.filename,
      'MostBox-0.1.3-win-arm64-setup.exe'
    )
    assert.equal(findUpdateAsset(manifest, 'linux', 'x64'), null)
  })

  it('returns an available update only for newer compatible manifests', () => {
    const update = getAvailableUpdate(manifest, {
      currentVersion: '0.1.2',
      platform: 'windows',
      arch: 'x64',
    })

    assert.equal(update?.version, '0.1.3')
    assert.equal(update?.downloadUrl, manifest.assets[0].r2Url)

    assert.equal(
      getAvailableUpdate(manifest, {
        currentVersion: '0.1.3',
        platform: 'windows',
        arch: 'x64',
      }),
      null
    )
    assert.equal(
      getAvailableUpdate(manifest, {
        currentVersion: '0.1.2',
        platform: 'linux',
        arch: 'x64',
      }),
      null
    )
    assert.equal(
      getAvailableUpdate({ version: '0.1.3', assets: [] }, {
        currentVersion: '0.1.2',
        platform: 'windows',
        arch: 'x64',
      }),
      null
    )
  })

  it('falls back to GitHub when an R2 URL is absent', () => {
    const update = getAvailableUpdate(manifest, {
      currentVersion: '0.1.2',
      platform: 'windows',
      arch: 'arm64',
    })

    assert.equal(update?.downloadUrl, manifest.assets[1].githubUrl)
  })

  it('formats installer sizes for update prompts', () => {
    assert.equal(formatBytes(112197632), '107 MB')
    assert.equal(formatBytes(2.5 * 1024 * 1024), '2.5 MB')
    assert.equal(formatBytes(0), '')
  })
})
