import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

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
const apkSource = path.join(
  androidDir,
  'app',
  'build',
  'outputs',
  'apk',
  'release',
  'app-release.apk'
)
const legacyApkTarget = path.join(outputDir, 'mostbox-android-release.apk')
const apkTarget = path.join(
  outputDir,
  `mostbox-android-${version}-release.apk`
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
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
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
  return fs.existsSync(path.join(androidDir, gradleCommand.replace(/^\.\//, '')))
}

function ensureAndroidProject() {
  if (hasAndroidProject()) return

  console.log('[android] generating native Android project...')
  run(npxCommand, ['expo', 'prebuild', '--platform', 'android', '--no-install'])
}

console.log(`[android] release version: ${version}`)
ensureAndroidProject()
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

if (!fs.existsSync(apkSource)) {
  throw new Error(`APK was not created at ${apkSource}`)
}

fs.mkdirSync(outputDir, { recursive: true })
safeRm(legacyApkTarget)
safeRm(`${legacyApkTarget}.sha256.txt`)
fs.copyFileSync(apkSource, apkTarget)
console.log(`[android] APK ready: ${apkTarget}`)

const { checksumPath, digest } = writeChecksum(apkTarget)
console.log(`[android] SHA256 ${digest}  ${path.basename(apkTarget)}`)
console.log(`[android] Checksum ready: ${checksumPath}`)
