import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import {
  getDownloadCheckErrorMessageFromPayload,
  getDownloadLinkValidationMessage,
} from '../../server/src/utils/downloadMessages.js'

function readSource(path) {
  return fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf-8')
}

describe('frontend smoke checks', () => {
  it('keeps the share modal aligned with the MVP seeding promise', () => {
    const source = readSource('app/app/page.tsx')

    assert.match(source, /most:\/\/\$\{shareItem\.cid\}\?filename=/)
    assert.match(source, /本机在线时可下载/)
    assert.match(source, /下载者完成后会默认继续做种/)
  })

  it('keeps the download modal validation messages user-readable', () => {
    assert.equal(
      getDownloadLinkValidationMessage(''),
      '请先粘贴 most:// 分享链接。'
    )
    assert.equal(
      getDownloadLinkValidationMessage('https://example.com/file'),
      '链接协议不正确，应以 most:// 开头。'
    )
    assert.equal(
      getDownloadCheckErrorMessageFromPayload({ status: 503 }),
      '暂时没有发现在线种子。请确认分享者或其他下载者仍在线做种，稍后再检测。'
    )
  })

  it('shows node holdings and seed states in the admin console', () => {
    const source = readSource('app/admin/page.tsx')

    assert.match(source, /NodeHolding/)
    assert.match(source, /formatSeedStatus/)
    assert.match(source, /做种中/)
    assert.match(source, /队列中/)
  })

  it('does not advertise unlimited file size in user-facing copy', () => {
    const sources = [
      readSource('README.md'),
      readSource('app/admin/page.tsx'),
      readSource('components/FeaturePortal.tsx'),
      readSource('app/download/page.tsx'),
    ].join('\n')

    assert.doesNotMatch(sources, /无限文件大小|无限制传输/)
    assert.match(sources, /10GB|10 GB/)
  })

  it('lets users choose R2 or GitHub download sources', () => {
    const source = readSource('components/DownloadOptions.tsx')

    assert.match(source, /NEXT_PUBLIC_RELEASE_MANIFEST_URL/)
    assert.match(source, /NEXT_PUBLIC_R2_PUBLIC_BASE_URL/)
    assert.match(source, /releases\/latest\.json/)
    assert.match(source, /https:\/\/download\.most\.box/)
    assert.match(source, /github\.com\/most-people\/most\/releases\/latest/)
    assert.match(source, /Cloudflare R2/)
    assert.match(source, /GitHub Releases/)
    assert.match(source, /role="tablist"/)
  })

  it('documents the dedicated R2 release bucket defaults', () => {
    const releaseWorkflow = readSource('.github/workflows/release.yml')
    const readme = readSource('README.md')

    assert.match(releaseWorkflow, /most-box-releases/)
    assert.match(releaseWorkflow, /https:\/\/download\.most\.box/)
    assert.match(releaseWorkflow, /most-box-backup/)
    assert.match(readme, /most-box-releases/)
    assert.match(readme, /https:\/\/download\.most\.box/)
    assert.match(readme, /most-box-backup/)
  })

  it('checks desktop updates through the public release manifest', () => {
    const mainSource = readSource('electron/main.js')
    const checkerSource = readSource('electron/updateChecker.js')

    assert.match(mainSource, /checkForUpdates/)
    assert.match(mainSource, /showMessageBox/)
    assert.match(mainSource, /openExternal/)
    assert.match(checkerSource, /MOSTBOX_RELEASE_MANIFEST_URL/)
    assert.match(checkerSource, /download\.most\.box\/releases\/latest\.json/)
  })
})
