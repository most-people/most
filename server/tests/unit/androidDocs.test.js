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
  ['mobile/android/README.md', '../../../mobile/android/README.md'],
  ['docs/mobile-android-alpha.md', '../../../docs/mobile-android-alpha.md'],
]

describe('Android command documentation', () => {
  it('keeps Android dev/test/build scripts in the mobile package', () => {
    const rootPackage = readJson('../../../package.json')
    const androidPackage = readJson('../../../mobile/android/package.json')

    for (const scriptName of ['start', 'test', 'build']) {
      assert.ok(
        androidPackage.scripts?.[scriptName],
        `mobile/android/package.json must define ${scriptName}`
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

  it('documents Android test and build commands from mobile/android', () => {
    for (const [fileName, relativePath] of androidDocs) {
      const content = readText(relativePath)
      assert.match(
        content,
        /cd mobile\/android/,
        `${fileName} should tell contributors to enter mobile/android`
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
})
