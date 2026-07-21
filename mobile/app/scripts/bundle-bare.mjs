import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const projectDir = path.resolve(scriptDir, '..')
const requestedPlatform =
  readPlatformArgument() || process.env.EAS_BUILD_PLATFORM

if (requestedPlatform !== 'android' && requestedPlatform !== 'ios') {
  throw new Error(
    'Bare bundle platform must be android or ios. Pass --platform or set EAS_BUILD_PLATFORM.'
  )
}

console.log(`[mobile] bundling Bare Worklet core for ${requestedPlatform}...`)

const result = spawnSync(
  process.execPath,
  [
    path.join(projectDir, 'node_modules', 'bare-pack', 'bin.js'),
    '--preset',
    requestedPlatform,
    '--linked',
    '--imports',
    'bare-pack-imports.cjs',
    'backend/backend.mjs',
    '--out',
    'app.bundle.js',
  ],
  {
    cwd: projectDir,
    stdio: 'inherit',
  }
)

if (result.error) throw result.error
if (result.status !== 0) {
  throw new Error(`Bare bundle failed for ${requestedPlatform}`)
}

function readPlatformArgument() {
  const index = process.argv.indexOf('--platform')
  if (index === -1) return ''
  return String(process.argv[index + 1] || '')
    .trim()
    .toLowerCase()
}
