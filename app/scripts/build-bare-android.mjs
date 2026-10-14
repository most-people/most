import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import cmakeRuntime from 'cmake-runtime'
import ninjaRuntime from 'ninja-runtime'

const projectDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
)
const kitVersion = '2.3.0'
const kitCommit = '264ebb068d23ca5c5168ed92ea1a0ce85b12259d'
const androidApi = 29
const ndkVersion = '27.1.12297006'

function run(command, args, cwd = projectDir) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    windowsHide: true,
  })
  if (result.error) throw result.error
  if (result.status !== 0)
    throw new Error(
      `Android Bare runtime command failed: ${path.basename(command)}`
    )
}

function digest(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

export function ensureBareAndroidRuntime(architectures = ['arm64-v8a']) {
  const dependency = path.join(
    projectDir,
    'node_modules',
    'react-native-bare-kit'
  )
  const installed = JSON.parse(
    fs.readFileSync(path.join(dependency, 'package.json'), 'utf8')
  )
  if (installed.version !== '0.15.0') {
    throw new Error(
      'Recheck the Android runtime source version before upgrading react-native-bare-kit'
    )
  }
  const supported = new Set(['arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64'])
  if (!architectures.length || architectures.some(abi => !supported.has(abi))) {
    throw new Error('Invalid Android runtime architectures')
  }
  const wrapper = path.join(
    projectDir,
    'native',
    'bare-runtime',
    'CMakeLists.txt'
  )
  const helper = path.join(
    projectDir,
    'android',
    'app',
    'src',
    'main',
    'jni',
    'nativehelper_shim.c'
  )
  const cache = path.join(
    projectDir,
    'dist',
    'bare-runtime',
    `kit-${kitVersion}-api-${androidApi}`
  )
  const source = path.join(cache, 'source')
  const signature = `${kitCommit}:${androidApi}:${ndkVersion}:${digest(wrapper)}:${digest(helper)}`
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT
  if (!sdk)
    throw new Error('Set ANDROID_HOME to build the Android Bare runtime')
  const toolchain = path.join(
    sdk,
    'ndk',
    ndkVersion,
    'build',
    'cmake',
    'android.toolchain.cmake'
  )
  if (!fs.existsSync(toolchain))
    throw new Error(`Android NDK ${ndkVersion} is required`)
  const cmake = cmakeRuntime()
  const ninja = ninjaRuntime()

  for (const abi of architectures) {
    const abiSignature = `${signature}:${abi}`
    const abiCache = path.join(cache, abi)
    const library = path.join(abiCache, 'libbare-kit.so')
    const stamp = path.join(abiCache, 'build.json')
    let valid = false
    if (fs.existsSync(library) && fs.existsSync(stamp)) {
      const saved = JSON.parse(fs.readFileSync(stamp, 'utf8'))
      valid =
        saved.signature === abiSignature && saved.sha256 === digest(library)
    }
    if (!valid) {
      fs.mkdirSync(cache, { recursive: true })
      if (!fs.existsSync(path.join(source, '.git'))) {
        run('git', [
          'clone',
          '--depth',
          '1',
          '--branch',
          `v${kitVersion}`,
          'https://github.com/holepunchto/bare-kit.git',
          source,
        ])
      }
      const revision = spawnSync('git', ['rev-parse', 'HEAD'], {
        cwd: source,
        encoding: 'utf8',
        windowsHide: true,
      })
      if (revision.status !== 0 || revision.stdout.trim() !== kitCommit)
        throw new Error('Unexpected Bare Kit source revision')
      if (!fs.existsSync(path.join(source, 'node_modules', 'cmake-bare'))) {
        const npm = process.env.npm_execpath
        if (!npm || !fs.existsSync(npm))
          throw new Error(
            'Run this build through npm so its CLI can be located'
          )
        run(process.execPath, [npm, 'ci', '--ignore-scripts'], source)
      }
      const build = path.join(abiCache, 'build')
      console.log(
        `[android] compiling Bare Kit ${kitVersion} for ${abi}, API ${androidApi}...`
      )
      run(cmake, [
        '-S',
        path.dirname(wrapper),
        '-B',
        build,
        '-G',
        'Ninja',
        `-DCMAKE_MAKE_PROGRAM=${ninja}`,
        `-DCMAKE_TOOLCHAIN_FILE=${toolchain}`,
        `-DANDROID_ABI=${abi}`,
        `-DANDROID_PLATFORM=android-${androidApi}`,
        '-DANDROID_STL=c++_shared',
        '-DCMAKE_BUILD_TYPE=Release',
        `-DMOST_BARE_SOURCE=${source}`,
        `-DMOST_NATIVE_HELPER_SOURCE=${helper}`,
      ])
      run(cmake, ['--build', build, '--target', 'bare_kit', '--parallel', '4'])
      fs.copyFileSync(
        path.join(build, 'bare-kit', 'android', 'libbare-kit.so'),
        library
      )
      fs.writeFileSync(
        stamp,
        JSON.stringify({ signature: abiSignature, sha256: digest(library) })
      )
    }
    const target = path.join(
      dependency,
      'android',
      'libs',
      'bare-kit',
      'jni',
      abi,
      'libbare-kit.so'
    )
    if (!fs.existsSync(target) || digest(target) !== digest(library))
      fs.copyFileSync(library, target)
    console.log(`[android] Bare Kit API ${androidApi} ready: ${abi}`)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  ensureBareAndroidRuntime(
    process.argv.slice(2).length ? process.argv.slice(2) : undefined
  )
}
