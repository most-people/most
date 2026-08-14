import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

import {
  checkIosRelease,
  collectIosReleaseIssues,
  expectedIosBuildNumber,
  readPngMetadata,
} from './check-ios-release.mjs'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const projectDir = path.resolve(scriptDir, '..')
const expo = JSON.parse(
  fs.readFileSync(path.join(projectDir, 'app.json'), 'utf8')
).expo
const packageVersion = JSON.parse(
  fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8')
).version
const packageLock = JSON.parse(
  fs.readFileSync(path.join(projectDir, 'package-lock.json'), 'utf8')
)
const rootVersion = JSON.parse(
  fs.readFileSync(path.resolve(projectDir, '..', '..', 'package.json'), 'utf8')
).version
const iconMetadata = readPngMetadata(
  fs.readFileSync(path.resolve(projectDir, expo.icon))
)

describe('iOS release preflight', () => {
  it('accepts the repository release configuration', () => {
    assert.doesNotThrow(() => checkIosRelease(projectDir))
    assert.equal(expectedIosBuildNumber('0.5.0'), 500)
    assert.deepEqual(iconMetadata, {
      width: 1024,
      height: 1024,
      bitDepth: 8,
      colorType: 2,
      hasAlpha: false,
    })
  })

  it('rejects store distribution and privacy regressions', () => {
    const issues = collectIosReleaseIssues({
      expo: {
        ...expo,
        ios: {
          ...expo.ios,
          supportsTablet: true,
          privacyManifests: {
            ...expo.ios.privacyManifests,
            NSPrivacyTracking: true,
          },
        },
      },
      packageVersion,
      packageLockVersion: packageLock.version,
      packageLockRootVersion: packageLock.packages?.['']?.version,
      rootVersion,
      eas: {
        build: {
          'ios-production': {
            distribution: 'internal',
            environment: 'production',
          },
        },
      },
      iconMetadata: { ...iconMetadata, hasAlpha: true },
    })

    assert.ok(issues.some(issue => issue.includes('iPhone only')))
    assert.ok(issues.some(issue => issue.includes('disable tracking')))
    assert.ok(issues.some(issue => issue.includes('store distribution')))
    assert.ok(issues.some(issue => issue.includes('cannot use alpha')))
  })

  it('rejects invalid release versions and PNG input', () => {
    assert.throws(() => expectedIosBuildNumber('0.5'))
    assert.throws(() => readPngMetadata(Buffer.from('not a png')))
  })
})
