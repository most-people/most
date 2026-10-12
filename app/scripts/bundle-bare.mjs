import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const projectDir = path.resolve(scriptDir, '..')
const requestedPlatform =
  readPlatformArgument() || process.env.EAS_BUILD_PLATFORM

export function shouldSyncEasAndroidNativeProject(
  platform,
  easPlatform = process.env.EAS_BUILD_PLATFORM
) {
  return platform === 'android' && easPlatform === 'android'
}

export function getBareBundleFileName(platform) {
  if (platform !== 'android' && platform !== 'ios') {
    throw new Error(
      'Bare bundle platform must be android or ios. Pass --platform or set EAS_BUILD_PLATFORM.'
    )
  }
  return `appBundle.${platform}.js`
}

export async function bundleBareCore(platform = requestedPlatform) {
  const outputFile = getBareBundleFileName(platform)
  const temporaryOutputFile = `.appBundle-${platform}-${process.pid}.bundle.js`

  if (platform === 'ios') {
    const { syncNativeIosProject } = await import('./sync-native-ios.mjs')
    syncNativeIosProject()
  }

  if (shouldSyncEasAndroidNativeProject(platform)) {
    const { syncNativeAndroidProject } =
      await import('./sync-native-android.mjs')
    syncNativeAndroidProject({ syncVersionValues: false })
  }

  console.log(`[mobile] bundling Bare Worklet core for ${platform}...`)

  try {
    const result = spawnSync(
      process.execPath,
      [
        path.join(projectDir, 'node_modules', 'bare-pack', 'bin.js'),
        '--preset',
        platform,
        '--linked',
        '--imports',
        'bare-pack-imports.cjs',
        'backend/backend.mjs',
        '--out',
        temporaryOutputFile,
      ],
      {
        cwd: projectDir,
        stdio: 'inherit',
      }
    )

    if (result.error) throw result.error
    if (result.status !== 0) {
      throw new Error(`Bare bundle failed for ${platform}`)
    }
    fs.copyFileSync(
      path.join(projectDir, temporaryOutputFile),
      path.join(projectDir, outputFile)
    )
  } finally {
    fs.rmSync(path.join(projectDir, temporaryOutputFile), { force: true })
  }
}

function readPlatformArgument() {
  const index = process.argv.indexOf('--platform')
  if (index === -1) return ''
  return String(process.argv[index + 1] || '')
    .trim()
    .toLowerCase()
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await bundleBareCore()
}
