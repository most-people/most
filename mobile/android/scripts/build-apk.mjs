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
const packageJson = JSON.parse(
  fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8')
)
const version = resolveReleaseVersion(
  process.env.MOST_ANDROID_RELEASE_VERSION || packageJson.version || '0.0.0'
)
const apkSourceDir = path.join(
  androidDir,
  'app',
  'build',
  'outputs',
  'apk',
  'release'
)
const releaseAbis = ['arm64-v8a', 'armeabi-v7a', 'x86_64']
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

function requireReleaseSigning() {
  const required = [
    'MOST_ANDROID_KEYSTORE_PATH',
    'MOST_ANDROID_STORE_PASSWORD',
    'MOST_ANDROID_KEY_ALIAS',
    'MOST_ANDROID_KEY_PASSWORD',
  ]
  const missing = required.filter(
    name => !String(process.env[name] || '').trim()
  )
  if (missing.length > 0) {
    throw new Error(
      `Android release signing is required. Missing: ${missing.join(', ')}`
    )
  }
  if (!fs.existsSync(process.env.MOST_ANDROID_KEYSTORE_PATH)) {
    throw new Error('Android release keystore does not exist')
  }
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

console.log(`[android] release version: ${version}`)
requireReleaseSigning()
ensureAndroidProject()
syncNativeAndroidProject({ version })
console.log('[android] bundling Bare Worklet core...')
run(process.execPath, [
  path.join(projectDir, 'node_modules', 'bare-pack', 'bin.js'),
  '--preset',
  'android',
  '--linked',
  '--imports',
  'bare-pack-imports.cjs',
  'backend/backend.mjs',
  '--out',
  'app.bundle.js',
])

console.log('[android] building release APK...')
run(gradleCommand, ['assembleRelease'], {
  cwd: androidDir,
  env: {
    NODE_ENV: 'production',
  },
})

fs.mkdirSync(outputDir, { recursive: true })
for (const abi of releaseAbis) {
  const apkSource = path.join(apkSourceDir, `app-${abi}-release.apk`)
  if (!fs.existsSync(apkSource)) {
    throw new Error(`APK was not created at ${apkSource}`)
  }

  const apkTarget = path.join(
    outputDir,
    `mostbox-android-${version}-${abi}-release.apk`
  )
  safeRm(apkTarget)
  safeRm(`${apkTarget}.sha256.txt`)
  fs.copyFileSync(apkSource, apkTarget)
  console.log(`[android] APK ready: ${apkTarget}`)

  const { checksumPath, digest } = writeChecksum(apkTarget)
  console.log(`[android] SHA256 ${digest}  ${path.basename(apkTarget)}`)
  console.log(`[android] Checksum ready: ${checksumPath}`)
}
