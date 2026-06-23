import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const projectDir = path.resolve(scriptDir, '..')
const androidDir = path.join(projectDir, 'android')
const outputDir = path.join(projectDir, 'dist')
const apkSource = path.join(
  androidDir,
  'app',
  'build',
  'outputs',
  'apk',
  'release',
  'app-release.apk'
)
const apkTarget = path.join(outputDir, 'mostbox-android-release.apk')

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || projectDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      ...options.env,
    },
  })

  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed`)
  }
}

function commandName(name) {
  return process.platform === 'win32' ? `${name}.cmd` : name
}

console.log('[android] bundling Bare Worklet core...')
run(commandName('bare-pack'), [
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
run(process.platform === 'win32' ? 'gradlew.bat' : './gradlew', ['assembleRelease'], {
  cwd: androidDir,
  env: {
    NODE_ENV: 'production',
  },
})

if (!fs.existsSync(apkSource)) {
  throw new Error(`APK was not created at ${apkSource}`)
}

fs.mkdirSync(outputDir, { recursive: true })
fs.copyFileSync(apkSource, apkTarget)
console.log(`[android] APK ready: ${apkTarget}`)
