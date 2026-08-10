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
const githubReleaseCertificateSha256 =
  '476989ca590dc9b87f80d0ed19effb649376d6aa5180bb45f3ac79e5f2306233'
const buildAppBundle = process.argv.includes('--aab')
const buildEmulatorApk = process.argv.includes('--emulator-apk')
const buildStoreApk = process.argv.includes('--store-apk')
const buildSignedReleaseApk = process.argv.includes('--signed-release-apk')
const selectedBuildTargets = [
  buildAppBundle,
  buildEmulatorApk,
  buildStoreApk,
  buildSignedReleaseApk,
].filter(Boolean)
if (selectedBuildTargets.length > 1) {
  throw new Error(
    'Choose only one of --aab, --emulator-apk, --store-apk, or --signed-release-apk'
  )
}
const releaseArchitecture = buildEmulatorApk ? 'x86_64' : 'arm64-v8a'
const releaseSigningRequired =
  buildAppBundle || buildStoreApk || buildSignedReleaseApk
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
  const captureOutput = options.captureOutput === true
  const result = spawnSync(
    useCmd ? 'cmd.exe' : command,
    useCmd ? ['/d', '/s', '/c', [command, ...args].join(' ')] : args,
    {
      cwd: options.cwd || projectDir,
      stdio: captureOutput ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      encoding: captureOutput ? 'utf8' : undefined,
      windowsHide: true,
      env: {
        ...process.env,
        ...options.env,
      },
    }
  )

  if (result.error) throw result.error
  if (captureOutput) {
    if (result.stdout) process.stdout.write(result.stdout)
    if (result.stderr) process.stderr.write(result.stderr)
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed`)
  }

  return captureOutput ? `${result.stdout || ''}${result.stderr || ''}` : ''
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
  const requiredSigningValues = [
    ['storeFile', 'MOSTBOX_ANDROID_KEYSTORE'],
    ['storePassword', 'MOSTBOX_ANDROID_KEYSTORE_PASSWORD'],
    ['keyAlias', 'MOSTBOX_ANDROID_KEY_ALIAS'],
    ['keyPassword', 'MOSTBOX_ANDROID_KEY_PASSWORD'],
  ]
  const missing = requiredSigningValues
    .filter(([field]) => !signing[field])
    .map(([, environmentName]) => environmentName)
  if (missing.length) {
    const releaseSigningLabel = buildAppBundle
      ? 'Google Play AAB'
      : buildStoreApk
        ? 'Store APK'
        : 'GitHub release APK'
    throw new Error(
      `${releaseSigningLabel} requires release signing values: ${missing.join(', ')}`
    )
  }

  const storeFile = path.resolve(signing.storeFile)
  if (!fs.existsSync(storeFile)) {
    throw new Error(`Android release keystore was not found: ${storeFile}`)
  }

  return { ...signing, storeFile }
}

function resolveApkSigner() {
  const executable =
    process.platform === 'win32' ? 'apksigner.jar' : 'apksigner'
  const sdkRoots = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
  ].filter(Boolean)

  for (const sdkRoot of sdkRoots) {
    const buildToolsDir = path.join(sdkRoot, 'build-tools')
    if (!fs.existsSync(buildToolsDir)) continue

    const versions = fs
      .readdirSync(buildToolsDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort((left, right) =>
        right.localeCompare(left, undefined, { numeric: true })
      )
    for (const versionName of versions) {
      const candidate = path.join(
        buildToolsDir,
        versionName,
        ...(process.platform === 'win32' ? ['lib'] : []),
        executable
      )
      if (!fs.existsSync(candidate)) continue
      return process.platform === 'win32'
        ? { command: 'java', args: ['-jar', candidate] }
        : { command: candidate, args: [] }
    }
  }

  return {
    command: process.platform === 'win32' ? 'apksigner.bat' : 'apksigner',
    args: [],
  }
}

function verifySignedReleasePackage(packagePath) {
  if (!buildSignedReleaseApk) return

  const apkSigner = resolveApkSigner()
  console.log('[android] verifying release APK signature...')
  const verificationOutput = run(
    apkSigner.command,
    [...apkSigner.args, 'verify', '--verbose', '--print-certs', packagePath],
    { captureOutput: true }
  )
  const signerCount = verificationOutput.match(/Number of signers:\s*(\d+)/i)
  const certificateDigest = verificationOutput.match(
    /Signer #1 certificate SHA-256 digest:\s*([0-9a-f]+)/i
  )
  if (signerCount?.[1] !== '1' || !certificateDigest) {
    throw new Error('Unable to verify the Android release signing identity')
  }
  if (certificateDigest[1].toLowerCase() !== githubReleaseCertificateSha256) {
    throw new Error(
      `Unexpected Android release certificate SHA-256: ${certificateDigest[1]}`
    )
  }
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
verifySignedReleasePackage(packageSource)

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
