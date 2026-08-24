import assert from 'node:assert/strict'
import fs from 'node:fs'
import { describe, it } from 'node:test'

import {
  applyExternalNativeBuildConfig,
  applyAndroidManifestPolicy,
  applyAndroidPackageConfig,
  applyKotlinPackageDeclaration,
  applyPlayReleaseSigningConfig,
  isStaleAndroidPackage,
  removePlayReleaseSigningConfig,
  repairMissingReleaseGradleConfig,
  resolveVersionCode,
} from './sync-native-android.mjs'
import {
  getBareBundleFileName,
  shouldSyncEasAndroidNativeProject,
} from './bundle-bare.mjs'

describe('Android native project synchronization', () => {
  it('uses the configured version code and only syncs EAS Android builds', () => {
    assert.equal(resolveVersionCode(407, '0.4.6'), 407)
    assert.equal(resolveVersionCode(undefined, '0.4.6'), 406)
    assert.equal(shouldSyncEasAndroidNativeProject('android', 'android'), true)
    assert.equal(shouldSyncEasAndroidNativeProject('ios', 'ios'), false)
    assert.equal(shouldSyncEasAndroidNativeProject('android', undefined), false)
    assert.equal(getBareBundleFileName('android'), 'appBundle.android.js')
    assert.equal(getBareBundleFileName('ios'), 'appBundle.ios.js')
    assert.throws(() => getBareBundleFileName('web'))
  })

  it('keeps the Expo version code synchronized with the release version', () => {
    const appJson = JSON.parse(
      fs.readFileSync(new URL('../app.json', import.meta.url), 'utf8')
    ).expo

    assert.equal(
      appJson.android.versionCode,
      resolveVersionCode(undefined, appJson.version)
    )
    const buildProperties = appJson.plugins.find(
      plugin => Array.isArray(plugin) && plugin[0] === 'expo-build-properties'
    )
    assert.equal(buildProperties?.[1]?.android?.usesCleartextTraffic, true)
  })

  it('synchronizes the application ID, namespace, and Kotlin package', () => {
    const buildGradle = [
      'android {',
      "    namespace 'box.most.android'",
      '    defaultConfig {',
      "        applicationId 'box.most.android'",
      '    }',
      '}',
      '',
    ].join('\n')

    const result = applyAndroidPackageConfig(buildGradle, 'most.box')
    assert.match(result, /namespace 'most\.box'/)
    assert.match(result, /applicationId 'most\.box'/)
    assert.equal(
      applyKotlinPackageDeclaration(
        'package box.most.android\n\nclass MainActivity\n',
        'most.box'
      ),
      'package most.box\n\nclass MainActivity\n'
    )
    assert.equal(isStaleAndroidPackage('box.most.android', 'most.box'), true)
    assert.equal(isStaleAndroidPackage('most.box', 'most.box'), false)
  })

  it('keeps native build output in a short project-specific directory', () => {
    const buildGradle = [
      'android {',
      '    androidResources {',
      "        ignoreAssetsPattern '!.git'",
      '    }',
      '}',
      '',
    ].join('\n')

    const result = applyExternalNativeBuildConfig(buildGradle)
    assert.match(result, /path "src\/main\/jni\/CMakeLists\.txt"/)
    assert.match(result, /buildStagingDirectory new File/)
    assert.match(result, /mostbox-cxx-/)
    assert.equal(applyExternalNativeBuildConfig(result), result)
  })

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

  it('uses environment-backed release signing for Google Play builds', () => {
    const buildGradle = [
      'android {',
      '    signingConfigs {',
      '        debug {',
      "            keyAlias 'androiddebugkey'",
      '        }',
      '    }',
      '    buildTypes {',
      '        release {',
      '            signingConfig signingConfigs.debug',
      '            minifyEnabled false',
      '        }',
      '    }',
      '}',
      '',
    ].join('\n')

    const result = applyPlayReleaseSigningConfig(buildGradle)
    assert.match(result, /MOSTBOX_ANDROID_KEYSTORE/)
    assert.match(
      result,
      /release \{\n\s+storeFile file\(mostboxUploadStoreFile\)/
    )
    assert.match(result, /signingConfig signingConfigs\.release/)
    assert.doesNotMatch(
      result.match(/release \{\n\s+signingConfig[^\n]+/)?.[0] || '',
      /signingConfigs\.debug/
    )
  })

  it('restores debug signing after a Google Play build', () => {
    const buildGradle = [
      'android {',
      '    signingConfigs {',
      '        debug {',
      "            keyAlias 'androiddebugkey'",
      '        }',
      '    }',
      '    buildTypes {',
      '        release {',
      '            signingConfig signingConfigs.debug',
      '            minifyEnabled false',
      '        }',
      '    }',
      '}',
      '',
    ].join('\n')

    const playGradle = applyPlayReleaseSigningConfig(buildGradle)
    const restoredGradle = removePlayReleaseSigningConfig(playGradle)

    assert.doesNotMatch(restoredGradle, /mostboxUpload/)
    assert.doesNotMatch(restoredGradle, /signingConfigs\.release/)
    assert.match(restoredGradle, /signingConfig signingConfigs\.debug/)
  })

  it('removes blocked permissions and disables Android backup', () => {
    const manifest = [
      '<manifest xmlns:android="http://schemas.android.com/apk/res/android">',
      '  <uses-permission android:name="android.permission.INTERNET"/>',
      '  <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32"/>',
      '  <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW"/>',
      '  <application android:allowBackup="true" android:label="MostBox">',
      '  </application>',
      '</manifest>',
    ].join('\n')

    const result = applyAndroidManifestPolicy(manifest, {
      allowBackup: false,
      blockedPermissions: [
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.SYSTEM_ALERT_WINDOW',
      ],
    })

    assert.match(result, /android\.permission\.INTERNET/)
    assert.match(
      result,
      /android:name="android\.permission\.READ_EXTERNAL_STORAGE" tools:node="remove"/
    )
    assert.match(
      result,
      /android:name="android\.permission\.SYSTEM_ALERT_WINDOW" tools:node="remove"/
    )
    assert.doesNotMatch(result, /READ_EXTERNAL_STORAGE[^>]*maxSdkVersion/)
    assert.match(result, /android:allowBackup="false"/)
  })
})
