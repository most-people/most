import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { repairMissingReleaseGradleConfig } from './sync-native-android.mjs'

describe('Android native project synchronization', () => {
  it('removes a release Gradle apply when its script is missing', () => {
    const buildGradle = [
      'android {',
      '}',
      '',
      'apply from: file("../../release.gradle")',
      '',
    ].join('\n')

    assert.strictEqual(
      repairMissingReleaseGradleConfig(buildGradle, false),
      'android {\n}\n\n'
    )
  })

  it('restores the Expo alpha signing config when the script is missing', () => {
    const buildGradle = [
      '    buildTypes {',
      '        release {',
      '            minifyEnabled false',
      '        }',
      '    }',
      '',
    ].join('\n')

    assert.strictEqual(
      repairMissingReleaseGradleConfig(buildGradle, false),
      [
        '    buildTypes {',
        '        release {',
        '            signingConfig signingConfigs.debug',
        '            minifyEnabled false',
        '        }',
        '    }',
        '',
      ].join('\n')
    )
  })

  it('preserves an inline release signing config', () => {
    const buildGradle = [
      '        release {',
      '            signingConfig signingConfigs.release',
      '        }',
      '',
    ].join('\n')

    assert.strictEqual(
      repairMissingReleaseGradleConfig(buildGradle, false),
      buildGradle
    )
  })

  it('preserves the release Gradle apply when its script exists', () => {
    const buildGradle = '\napply from: file("../../release.gradle")\n'
    assert.strictEqual(
      repairMissingReleaseGradleConfig(buildGradle, true),
      buildGradle
    )
  })
})
