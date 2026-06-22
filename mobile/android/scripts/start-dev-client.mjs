import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const projectDir = path.resolve(scriptDir, '..')
const port = Number(process.env.EXPO_PORT || 8081)
const emulatorWaitTimeoutMs = Number(
  process.env.ANDROID_EMULATOR_TIMEOUT_MS || 180000
)
const localHostUrl = `http://127.0.0.1:${port}`
const appJson = JSON.parse(
  fs.readFileSync(path.join(projectDir, 'app.json'), 'utf8')
).expo
const androidPackage = appJson.android?.package
const devClientScheme = `exp+${appJson.slug}`

function readLocalSdkDir() {
  const localProperties = path.join(projectDir, 'android', 'local.properties')
  if (!fs.existsSync(localProperties)) return ''

  const match = fs
    .readFileSync(localProperties, 'utf8')
    .match(/^sdk\.dir=(.+)$/m)
  if (!match) return ''

  return match[1].trim().replace(/\\\\/g, '\\')
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function findSdkDirs() {
  return unique([
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    readLocalSdkDir(),
    path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk'),
    path.resolve(projectDir, '..', '..', '.tmp', 'android-build', 'sdk'),
  ])
}

function findSdkTool(...parts) {
  for (const sdkDir of findSdkDirs()) {
    const candidate = path.join(sdkDir, ...parts)
    if (fs.existsSync(candidate)) return candidate
  }

  return ''
}

function findAdb() {
  return (
    findSdkTool(
      'platform-tools',
      process.platform === 'win32' ? 'adb.exe' : 'adb'
    ) || 'adb'
  )
}

function findEmulator() {
  return findSdkTool(
    'emulator',
    process.platform === 'win32' ? 'emulator.exe' : 'emulator'
  )
}

function runAdb(args, stdio = 'pipe') {
  const result = spawnSync(findAdb(), args, {
    cwd: projectDir,
    encoding: 'utf8',
    stdio,
  })
  return result
}

function runDeviceAdb(device, args, stdio = 'pipe') {
  return runAdb(device?.serial ? ['-s', device.serial, ...args] : args, stdio)
}

function listConnectedDevices() {
  const result = runAdb(['devices', '-l'])
  if (result.error || result.status !== 0) return []

  return result.stdout
    .split(/\r?\n/)
    .slice(1)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const match = line.match(/^(\S+)\s+(\S+)(?:\s+(.*))?$/)
      if (!match) return null
      return {
        serial: match[1],
        state: match[2],
        detail: match[3] || '',
      }
    })
    .filter(device => device?.state === 'device')
}

function readDeviceProp(device, prop) {
  const result = runDeviceAdb(device, ['shell', 'getprop', prop])
  if (result.error || result.status !== 0) return ''
  return result.stdout.trim()
}

function isEmulatorDevice(device) {
  if (!device) return false
  if (device.serial.startsWith('emulator-')) return true

  const qemu = readDeviceProp(device, 'ro.kernel.qemu')
  const bootQemu = readDeviceProp(device, 'ro.boot.qemu')
  if (qemu === '1' || bootQemu === '1') return true

  const productModel = readDeviceProp(device, 'ro.product.model').toLowerCase()
  return productModel.includes('emulator') || productModel.includes('sdk')
}

function selectAndroidDevice({ warnIfMissing = true } = {}) {
  const devices = listConnectedDevices()
  if (devices.length === 0) {
    if (warnIfMissing) {
      console.warn('[android] no connected Android device found.')
    }
    return null
  }

  const requestedSerial = process.env.ANDROID_SERIAL
  let device = requestedSerial
    ? devices.find(candidate => candidate.serial === requestedSerial)
    : devices[0]

  if (!device) {
    console.warn(
      `[android] ANDROID_SERIAL=${requestedSerial} is not connected; using ${devices[0].serial}.`
    )
    device = devices[0]
  } else if (devices.length > 1 && !requestedSerial) {
    console.warn(
      `[android] multiple Android devices detected; using ${device.serial}. Set ANDROID_SERIAL to choose another.`
    )
  }

  return {
    ...device,
    isEmulator: isEmulatorDevice(device),
  }
}

function listAvds(emulator) {
  const result = spawnSync(emulator, ['-list-avds'], {
    cwd: projectDir,
    encoding: 'utf8',
  })
  if (result.error || result.status !== 0) return []
  return result.stdout
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isBootComplete(device) {
  if (!device?.isEmulator) return true
  return (
    readDeviceProp(device, 'sys.boot_completed') === '1' ||
    readDeviceProp(device, 'dev.bootcomplete') === '1'
  )
}

async function waitForAndroidDevice() {
  const startedAt = Date.now()
  let lastNoticeAt = 0

  while (Date.now() - startedAt < emulatorWaitTimeoutMs) {
    const device = selectAndroidDevice({ warnIfMissing: false })
    if (device && isBootComplete(device)) return device

    const now = Date.now()
    if (now - lastNoticeAt > 10000) {
      lastNoticeAt = now
      console.log('[android] waiting for Android device to boot...')
    }
    await sleep(1000)
  }

  throw new Error('Timed out waiting for Android device to boot')
}

async function ensureAndroidDevice() {
  const existing = selectAndroidDevice({ warnIfMissing: false })
  if (existing && isBootComplete(existing)) return existing

  const emulator = findEmulator()
  if (!emulator) {
    console.warn('[android] no connected Android device found.')
    return existing
  }

  const avds = listAvds(emulator)
  const avd = process.env.ANDROID_AVD || avds[0]
  if (!avd) {
    console.warn('[android] no Android AVD found.')
    return existing
  }

  if (existing) {
    console.log(`[android] waiting for running emulator: ${existing.serial}`)
    return waitForAndroidDevice()
  }

  console.log(`[android] starting emulator: ${avd}`)
  const child = spawn(emulator, ['-avd', avd], {
    cwd: projectDir,
    detached: true,
    stdio: 'ignore',
  })
  child.unref()

  return waitForAndroidDevice()
}

function setupReverse(device) {
  const result = runDeviceAdb(
    device,
    ['reverse', `tcp:${port}`, `tcp:${port}`],
    'inherit'
  )
  if (result.error || result.status !== 0) {
    console.warn(
      '[android] adb reverse failed; using a LAN URL when possible.'
    )
    return false
  }

  return true
}

function normalizeHostOverride(value) {
  const trimmed = value?.trim()
  if (!trimmed) return ''

  try {
    const url = new URL(
      /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
    )
    return url.hostname
  } catch {
    return trimmed.replace(/:\d+$/, '')
  }
}

function isPrivateIpv4(address) {
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some(part => Number.isNaN(part))) {
    return false
  }

  const [first, second] = parts
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  )
}

function scoreNetworkInterface(name, address, index) {
  const lowerName = name.toLowerCase()
  let score = isPrivateIpv4(address) ? 40 : 0

  if (/wi-?fi|wlan|ethernet|en\d+|eth\d+/.test(lowerName)) score += 15
  if (/vethernet|virtual|vmware|virtualbox|docker|wsl|hyper-v|npcap/.test(lowerName)) {
    score -= 50
  }
  if (/tailscale|zerotier/.test(lowerName)) score -= 20

  return score - index / 100
}

function findLanHost() {
  const override = normalizeHostOverride(
    process.env.MOST_ANDROID_HOST ||
      process.env.EXPO_DEV_CLIENT_HOST ||
      process.env.REACT_NATIVE_PACKAGER_HOSTNAME
  )
  if (override) {
    return {
      host: override,
      source: 'environment override',
    }
  }

  const candidates = []
  let index = 0
  for (const [name, entries = []] of Object.entries(os.networkInterfaces())) {
    for (const entry of entries) {
      if (entry.internal) continue
      if (entry.family !== 'IPv4' && entry.family !== 4) continue

      candidates.push({
        host: entry.address,
        source: name,
        score: scoreNetworkInterface(name, entry.address, index),
      })
      index += 1
    }
  }

  candidates.sort((a, b) => b.score - a.score)
  return candidates[0] || null
}

function createLanServer(lanHost) {
  return {
    hostMode: 'lan',
    host: lanHost.host,
    url: `http://${lanHost.host}:${port}`,
    usesReverse: false,
    description: `LAN ${lanHost.host} (${lanHost.source})`,
  }
}

function resolveDevServer(device) {
  if (device?.isEmulator) {
    if (setupReverse(device)) {
      return {
        hostMode: 'localhost',
        url: localHostUrl,
        usesReverse: true,
        description: `localhost via adb reverse on ${device.serial}`,
      }
    }
  } else if (device) {
    console.log(`[android] ${device.serial} is a physical device; using LAN.`)
  }

  const lanHost = findLanHost()
  if (lanHost) return createLanServer(lanHost)

  if (device && setupReverse(device)) {
    return {
      hostMode: 'localhost',
      url: localHostUrl,
      usesReverse: true,
      description: `localhost via adb reverse on ${device.serial}`,
    }
  }

  console.warn(
    '[android] no LAN address or adb reverse route is available; falling back to localhost.'
  )
  return {
    hostMode: 'localhost',
    url: localHostUrl,
    usesReverse: false,
    description: 'localhost fallback',
  }
}

function openDevClient(device, devServerUrl) {
  if (!androidPackage) {
    console.warn('[android] app.json is missing expo.android.package')
    return
  }
  if (!device) {
    console.warn(
      `[android] skipping automatic app open because no device is connected. Use ${devServerUrl} after connecting a device.`
    )
    return
  }

  const url = `${devClientScheme}://expo-development-client/?url=${encodeURIComponent(
    devServerUrl
  )}`
  const result = runDeviceAdb(
    device,
    [
      'shell',
      'am',
      'start',
      '-a',
      'android.intent.action.VIEW',
      '-d',
      url,
      androidPackage,
    ],
    'inherit'
  )

  if (result.error || result.status !== 0) {
    console.warn(
      `[android] failed to open dev client automatically. Enter ${url} manually in the development build.`
    )
  }
}

function checkMetro(statusUrl) {
  return new Promise(resolve => {
    const request = http.get(`${statusUrl}/status`, response => {
      const chunks = []
      response.on('data', chunk => chunks.push(chunk))
      response.on('end', () => {
        resolve(Buffer.concat(chunks).toString('utf8').includes('running'))
      })
    })
    request.on('error', () => resolve(false))
    request.setTimeout(1000, () => {
      request.destroy()
      resolve(false)
    })
  })
}

async function waitForMetro(statusUrls) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    for (const statusUrl of statusUrls) {
      if (await checkMetro(statusUrl)) return true
    }
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  return false
}

function appendNodeOption(currentValue, option) {
  const current = String(currentValue || '').trim()
  if (current.split(/\s+/).includes(option)) return current
  return current ? `${current} ${option}` : option
}

const expoBin = path.join(
  projectDir,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'expo.cmd' : 'expo'
)

const device = await ensureAndroidDevice()
const devServer = resolveDevServer(device)
const expoArgs = [
  'start',
  '--dev-client',
  '--host',
  devServer.hostMode,
  '--port',
  String(port),
]
const expoEnv = { ...process.env }

if (devServer.hostMode === 'localhost') {
  expoEnv.NODE_OPTIONS = appendNodeOption(
    expoEnv.NODE_OPTIONS,
    '--dns-result-order=ipv4first'
  )
}

if (devServer.hostMode === 'lan' && devServer.host) {
  expoEnv.REACT_NATIVE_PACKAGER_HOSTNAME = devServer.host
}

console.log(`[android] dev server URL: ${devServer.url}`)
console.log(`[android] route: ${devServer.description}`)

const expo = spawn(
  expoBin,
  expoArgs,
  {
    cwd: projectDir,
    env: expoEnv,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  }
)

let stopping = false
const stop = signal => {
  if (stopping) return
  stopping = true
  expo.kill(signal)
}

process.on('SIGINT', () => stop('SIGINT'))
process.on('SIGTERM', () => stop('SIGTERM'))

waitForMetro(unique([localHostUrl, devServer.url])).then(isRunning => {
  if (!isRunning) {
    console.warn('[android] Metro did not report running within 60 seconds.')
    return
  }

  if (devServer.usesReverse) setupReverse(device)
  openDevClient(device, devServer.url)
})

expo.on('exit', code => {
  process.exit(code ?? 0)
})
