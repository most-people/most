import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { syncNativeAndroidProject } from './sync-native-android.mjs'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const projectDir = path.resolve(scriptDir, '..')
const androidDir = path.join(projectDir, 'android')
const outputDir = path.join(projectDir, 'dist')
const buildAppBundle = process.argv.includes('--aab')
const buildEmulatorApk = process.argv.includes('--emulator-apk')
const buildStoreApk = process.argv.includes('--store-apk')
const selectedBuildTargets = [
  buildAppBundle,
  buildEmulatorApk,
  buildStoreApk,
].filter(Boolean)
if (selectedBuildTargets.length > 1) {
  throw new Error('Choose only one of --aab, --emulator-apk, or --store-apk')
}
const releaseArchitecture = buildEmulatorApk ? 'x86_64' : 'arm64-v8a'
const releaseSigningRequired = buildAppBundle || buildStoreApk
const packageJson = JSON.parse(
  fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8')
)
const version = resolveReleaseVersion(
  process.env.MOST_ANDROID_RELEASE_VERSION || packageJson.version || '0.0.0'
)
const packageExtension = buildAppBundle ? 'aab' : 'apk'
const packageSource = buildAppBundle
  ? path.join(
      androidDir,
      'app',
      'build',
      'outputs',
      'bundle',
      'release',
      'app-release.aab'
    )
  : path.join(
      androidDir,
      'app',
      'build',
      'outputs',
      'apk',
      'release',
      'app-release.apk'
    )
const legacyApkTarget = path.join(outputDir, 'mostbox-android-release.apk')
const packageTarget = path.join(
  outputDir,
  buildEmulatorApk
    ? `mostbox-android-${version}-emulator-x86_64.apk`
    : buildStoreApk
      ? `mostbox-android-${version}-store-release.apk`
      : `mostbox-android-${version}-release.${packageExtension}`
)
const gradleCommand = process.platform === 'win32' ? 'gradlew.bat' : './gradlew'
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx'

function run(command, args, options = {}) {
  const useCmd = process.platform === 'win32' && /\.(bat|cmd)$/i.test(command)
  const result = spawnSync(
    useCmd ? 'cmd.exe' : command,
    useCmd ? ['/d', '/s', '/c', [command, ...args].join(' ')] : args,
    {
      cwd: options.cwd || projectDir,
      stdio: 'inherit',
      windowsHide: true,
      env: {
        ...process.env,
        ...options.env,
      },
    }
  )

  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed`)
  }
}

function resolveReleaseVersion(value) {
  const version = String(value).trim().replace(/^v/, '')
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Invalid Android release version: ${value}`)
  }
  return version
}

function sha256(filePath) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(filePath))
    .digest('hex')
}

function writeChecksum(filePath) {
  const digest = sha256(filePath)
  const fileName = path.basename(filePath)
  const checksumPath = `${filePath}.sha256.txt`
  fs.writeFileSync(checksumPath, `${digest}  ${fileName}\n`)
  return { checksumPath, digest }
}

function safeRm(filePath) {
  try {
    fs.rmSync(filePath, { force: true })
  } catch {}
}

function hasAndroidProject() {
  return fs.existsSync(
    path.join(androidDir, gradleCommand.replace(/^\.\//, ''))
  )
}

function ensureAndroidProject() {
  if (hasAndroidProject()) return

  console.log('[android] generating native Android project...')
  run(npxCommand, ['expo', 'prebuild', '--platform', 'android', '--no-install'])
}

function getReleaseSigningEnvironment() {
  if (!releaseSigningRequired) return null

  const signing = {
    storeFile: process.env.MOSTBOX_ANDROID_KEYSTORE,
    storePassword: process.env.MOSTBOX_ANDROID_KEYSTORE_PASSWORD,
    keyAlias: process.env.MOSTBOX_ANDROID_KEY_ALIAS,
    keyPassword: process.env.MOSTBOX_ANDROID_KEY_PASSWORD,
  }
  const missing = Object.entries(signing)
    .filter(([, value]) => !value)
    .map(([key]) => key)
  if (missing.length) {
    throw new Error(
      `${buildAppBundle ? 'Google Play AAB' : 'Store APK'} requires release signing values: ${missing.join(', ')}`
    )
  }

  const storeFile = path.resolve(signing.storeFile)
  if (!fs.existsSync(storeFile)) {
    throw new Error(`Android release keystore was not found: ${storeFile}`)
  }

  return { ...signing, storeFile }
}

const releaseSigning = getReleaseSigningEnvironment()
console.log(`[android] release version: ${version}`)
ensureAndroidProject()
syncNativeAndroidProject({
  version,
  playSigningRequired: releaseSigningRequired,
})
console.log('[android] bundling Bare Worklet core...')
const bareBundleTemporary = path.join(
  projectDir,
  '.appBundle-android-release.bundle.js'
)
try {
  run(process.execPath, [
    path.join(projectDir, 'node_modules', 'bare-pack', 'bin.js'),
    '--preset',
    'android',
    '--linked',
    '--imports',
    'bare-pack-imports.cjs',
    'backend/backend.mjs',
    '--out',
    path.basename(bareBundleTemporary),
  ])
  fs.copyFileSync(
    bareBundleTemporary,
    path.join(projectDir, 'appBundle.android.js')
  )
} finally {
  safeRm(bareBundleTemporary)
}

console.log(
  `[android] building release ${buildAppBundle ? 'App Bundle' : 'APK'}...`
)
run(
  gradleCommand,
  [
    buildAppBundle ? 'bundleRelease' : 'assembleRelease',
    `-PreactNativeArchitectures=${releaseArchitecture}`,
    '-Pexpo.useLegacyPackaging=true',
  ],
  {
    cwd: androidDir,
    env: {
      NODE_ENV: 'production',
      ...(releaseSigning
        ? {
            MOSTBOX_ANDROID_KEYSTORE: releaseSigning.storeFile,
            MOSTBOX_ANDROID_KEYSTORE_PASSWORD: releaseSigning.storePassword,
            MOSTBOX_ANDROID_KEY_ALIAS: releaseSigning.keyAlias,
            MOSTBOX_ANDROID_KEY_PASSWORD: releaseSigning.keyPassword,
          }
        : {}),
    },
  }
)

if (!fs.existsSync(packageSource)) {
  throw new Error(
    `${buildAppBundle ? 'AAB' : 'APK'} was not created at ${packageSource}`
  )
}

fs.mkdirSync(outputDir, { recursive: true })
if (!buildAppBundle) {
  safeRm(legacyApkTarget)
  safeRm(`${legacyApkTarget}.sha256.txt`)
}
fs.copyFileSync(packageSource, packageTarget)
const packageSizeBytes = fs.statSync(packageTarget).size
const packageSizeMiB = packageSizeBytes / 1024 / 1024
console.log(
  `[android] ${buildAppBundle ? 'AAB' : 'APK'} ready: ${packageTarget} (${packageSizeMiB.toFixed(2)} MiB, ${releaseArchitecture})`
)

const { checksumPath, digest } = writeChecksum(packageTarget)
console.log(`[android] SHA256 ${digest}  ${path.basename(packageTarget)}`)
console.log(`[android] Checksum ready: ${checksumPath}`)
