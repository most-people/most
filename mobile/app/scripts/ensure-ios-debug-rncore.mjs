import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const defaultProjectDir = path.resolve(scriptDir, '..')
const DEBUG_RENDERER_SYMBOL =
  '__ZNK8facebook5react22DebugStringConvertible12getDebugNameEv'

export function hasDebugRendererSymbol(nmOutput) {
  return String(nmOutput).includes(DEBUG_RENDERER_SYMBOL)
}

function inspectIntelSymbols(binaryPath) {
  const result = spawnSync('nm', ['-arch', 'x86_64', '-gU', '-j', binaryPath], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  if (result.status !== 0) {
    throw new Error(
      `Unable to inspect precompiled React Native Core: ${result.stderr || 'nm failed'}`
    )
  }
  return hasDebugRendererSymbol(result.stdout)
}

function replaceWithDebugCore({ scriptPath, version, podsRoot }) {
  const result = spawnSync(
    process.execPath,
    [scriptPath, '-c', 'Debug', '-r', version, '-p', podsRoot],
    { cwd: podsRoot, stdio: 'inherit' }
  )
  if (result.status !== 0) {
    throw new Error('React Native failed to restore the Debug Core artifact')
  }
}

export function repairIntelSimulatorReactNativeCore({
  binaryPath,
  markerPath,
  scriptPath,
  version,
  podsRoot,
  inspect = inspectIntelSymbols,
  replace = replaceWithDebugCore,
}) {
  if (inspect(binaryPath)) return 'ready'

  // The RN replacement script assumes a missing marker means Debug. Mark the
  // detected Release artifact explicitly so its normal Debug swap can run.
  fs.writeFileSync(markerPath, 'Release')
  replace({ scriptPath, version, podsRoot })

  if (!inspect(binaryPath)) {
    throw new Error(
      'React Native Debug Core is still missing Intel renderer symbols'
    )
  }
  return 'repaired'
}

export function ensureIosDebugReactNativeCore({
  projectDir = defaultProjectDir,
  platform = process.platform,
  arch = process.arch,
} = {}) {
  if (platform !== 'darwin' || arch !== 'x64') return 'skipped-platform'

  const podsRoot = path.join(projectDir, 'ios', 'Pods')
  const coreRoot = path.join(podsRoot, 'React-Core-prebuilt')
  const binaryPath = path.join(
    coreRoot,
    'React.xcframework',
    'ios-arm64_x86_64-simulator',
    'React.framework',
    'React'
  )
  if (!fs.existsSync(binaryPath)) return 'skipped-missing-pods'

  const reactNativeRoot = path.join(projectDir, 'node_modules', 'react-native')
  const reactNativePackage = JSON.parse(
    fs.readFileSync(path.join(reactNativeRoot, 'package.json'), 'utf8')
  )
  const status = repairIntelSimulatorReactNativeCore({
    binaryPath,
    markerPath: path.join(coreRoot, '.last_build_configuration'),
    scriptPath: path.join(
      reactNativeRoot,
      'scripts',
      'replace-rncore-version.js'
    ),
    version: reactNativePackage.version,
    podsRoot,
  })

  console.log(
    status === 'repaired'
      ? '[ios] restored Intel React Native Debug Core'
      : '[ios] Intel React Native Debug Core is ready'
  )
  return status
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  ensureIosDebugReactNativeCore()
}
