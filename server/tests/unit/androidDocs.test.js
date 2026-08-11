import { describe, it } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'

function readText(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath))
}

const androidDocs = [
  ['README.md', '../../../README.md'],
  ['mobile/app/README.md', '../../../mobile/app/README.md'],
  ['docs/mobile-android-alpha.md', '../../../docs/mobile-android-alpha.md'],
]

describe('Android command documentation', () => {
  it('keeps Android dev/test/build scripts in the mobile package', () => {
    const rootPackage = readJson('../../../package.json')
    const mobilePackage = readJson('../../../mobile/app/package.json')

    for (const scriptName of ['start', 'test', 'build', 'build:release']) {
      assert.ok(
        mobilePackage.scripts?.[scriptName],
        `mobile/app/package.json must define ${scriptName}`
      )
    }

    for (const scriptName of [
      'android:start',
      'android:test',
      'android:build',
    ]) {
      assert.strictEqual(
        rootPackage.scripts?.[scriptName],
        undefined,
        `root package.json should not define ${scriptName}`
      )
    }
  })

  it('does not document removed root Android npm scripts', () => {
    const removedCommands = [
      'npm run android:start',
      'npm run android:test',
      'npm run android:build',
      'npm run android:seed',
    ]
    const checkedFiles = [
      ...androidDocs,
      [
        'scripts/android-real-p2p-seed.mjs',
        '../../../scripts/android-real-p2p-seed.mjs',
      ],
    ]

    for (const [fileName, relativePath] of checkedFiles) {
      const content = readText(relativePath)
      for (const command of removedCommands) {
        assert.ok(
          !content.includes(command),
          `${fileName} should not reference ${command}`
        )
      }
    }
  })

  it('documents Android test and build commands from mobile/app', () => {
    for (const [fileName, relativePath] of androidDocs) {
      const content = readText(relativePath)
      assert.match(
        content,
        /cd mobile\/app/,
        `${fileName} should tell contributors to enter mobile/app`
      )
      assert.match(
        content,
        /npm test/,
        `${fileName} should document the Android test command`
      )
      assert.match(
        content,
        /npm run build/,
        `${fileName} should document the Android build command`
      )
    }
  })

  it('requires persistent signing for GitHub Android release APKs', () => {
    const workflow = readText('../../../.github/workflows/release.yml')
    const mobilePackage = readJson('../../../mobile/app/package.json')
    const buildScript = readText('../../../mobile/app/scripts/build-apk.mjs')
    const signatureVerifier = readText(
      '../../../mobile/app/scripts/verify-apk-signature.mjs'
    )

    assert.strictEqual(
      mobilePackage.scripts?.['build:release'],
      'node scripts/build-apk.mjs --signed-release-apk'
    )
    assert.match(workflow, /npm run build:release --prefix mobile\/app/)
    assert.doesNotMatch(workflow, /run: npm run build --prefix mobile\/app/)

    for (const secretName of [
      'MOSTBOX_ANDROID_KEYSTORE_BASE64',
      'MOSTBOX_ANDROID_KEYSTORE_PASSWORD',
      'MOSTBOX_ANDROID_KEY_ALIAS',
      'MOSTBOX_ANDROID_KEY_PASSWORD',
    ]) {
      assert.match(
        workflow,
        new RegExp(`secrets\\.${secretName}`),
        `release workflow must use ${secretName}`
      )
    }

    assert.doesNotMatch(workflow, /MOSTBOX_ANDROID_SIGNING_LINEAGE/)
    assert.doesNotMatch(buildScript, /MOSTBOX_ANDROID_SIGNING_LINEAGE/)
    assert.doesNotMatch(buildScript, /androiddebugkey/)
    assert.match(buildScript, /'verify'[\s\S]*'--print-certs'/)
    assert.match(buildScript, /verifyApkSigningIdentity\(verificationOutput\)/)
    assert.match(
      signatureVerifier,
      /476989ca590dc9b87f80d0ed19effb649376d6aa5180bb45f3ac79e5f2306233/
    )
    assert.match(signatureVerifier, /Number of signers/)
    assert.match(
      signatureVerifier,
      /Unexpected Android release certificate SHA-256/
    )
    assert.match(buildScript, /apksigner\.jar/)
    assert.match(buildScript, /command: 'java'/)
  })
})
