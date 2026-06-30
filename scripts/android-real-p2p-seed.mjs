#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { randomUUID } from 'node:crypto'
import readline from 'node:readline/promises'

import { MostBoxEngine } from '../server/src/index.js'
import { calculateCid } from '../server/src/core/cid.js'

const DEFAULT_ROOT_DIR = path.join('.tmp', 'android-real-p2p-seed')
const DEFAULT_WAIT_MS = 10_000
const DEFAULT_VERIFY_TIMEOUT_MS = 300_000
const PUBLISHER_SHUTDOWN_SETTLE_MS = 1_500

function printHelp() {
  console.log(`MostBox Android real P2P desktop seed helper

Usage:
  node scripts/android-real-p2p-seed.mjs
  node scripts/android-real-p2p-seed.mjs --file ./fixtures/small.txt
  node scripts/android-real-p2p-seed.mjs --handoff-check

Options:
  --file <path>       Publish an existing local file instead of a generated fixture.
  --name <filename>   Override the display filename stored in the most:// link.
  --work-dir <path>   Runtime folder for generated fixtures and node data.
  --data-path <path>  Runtime P2P data path. Defaults to <work-dir>/node-data.
  --timeout-ms <ms>   How long to wait for the local holding to become active.
  --verify-timeout-ms <ms>
                      How long the fresh verifier node waits for Android seeding.
  --handoff-check     Run the foreground handoff regression:
                      desktop publish -> Android download/seed -> publisher exit
                      -> fresh verifier pulls from Android and recomputes the CID.
  --once              Publish, print the link, then stop. Not useful for Android pull tests.
  -h, --help          Show this help.
`)
}

function readOptionValue(argv, index, name) {
  const arg = argv[index]
  const inlinePrefix = `${name}=`
  if (arg.startsWith(inlinePrefix)) {
    const value = arg.slice(inlinePrefix.length)
    if (!value) throw new Error(`${name} requires a value`)
    return { value, nextIndex: index }
  }

  const value = argv[index + 1]
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value`)
  }
  return { value, nextIndex: index + 1 }
}

function parseArgs(argv) {
  const options = {
    dataPath: '',
    file: '',
    handoffCheck: false,
    help: false,
    name: '',
    once: false,
    timeoutMs: DEFAULT_WAIT_MS,
    verifyTimeoutMs: DEFAULT_VERIFY_TIMEOUT_MS,
    workDir: '',
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '-h' || arg === '--help') {
      options.help = true
    } else if (arg === '--once') {
      options.once = true
    } else if (arg === '--handoff-check') {
      options.handoffCheck = true
    } else if (arg === '--file' || arg.startsWith('--file=')) {
      const result = readOptionValue(argv, index, '--file')
      options.file = result.value
      index = result.nextIndex
    } else if (arg === '--name' || arg.startsWith('--name=')) {
      const result = readOptionValue(argv, index, '--name')
      options.name = result.value
      index = result.nextIndex
    } else if (arg === '--work-dir' || arg.startsWith('--work-dir=')) {
      const result = readOptionValue(argv, index, '--work-dir')
      options.workDir = result.value
      index = result.nextIndex
    } else if (arg === '--data-path' || arg.startsWith('--data-path=')) {
      const result = readOptionValue(argv, index, '--data-path')
      options.dataPath = result.value
      index = result.nextIndex
    } else if (arg === '--timeout-ms' || arg.startsWith('--timeout-ms=')) {
      const result = readOptionValue(argv, index, '--timeout-ms')
      const timeoutMs = Number(result.value)
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        throw new Error('--timeout-ms must be a positive number')
      }
      options.timeoutMs = Math.floor(timeoutMs)
      index = result.nextIndex
    } else if (
      arg === '--verify-timeout-ms' ||
      arg.startsWith('--verify-timeout-ms=')
    ) {
      const result = readOptionValue(argv, index, '--verify-timeout-ms')
      const verifyTimeoutMs = Number(result.value)
      if (!Number.isFinite(verifyTimeoutMs) || verifyTimeoutMs <= 0) {
        throw new Error('--verify-timeout-ms must be a positive number')
      }
      options.verifyTimeoutMs = Math.floor(verifyTimeoutMs)
      index = result.nextIndex
    } else {
      throw new Error(`Unknown option: ${arg}`)
    }
  }

  if (options.once && options.handoffCheck) {
    throw new Error('--once cannot be used with --handoff-check')
  }

  return options
}

function createRunId() {
  const timestamp = new Date()
    .toISOString()
    .replaceAll(':', '')
    .replaceAll('.', '')
  return `${timestamp}-${randomUUID().slice(0, 8)}`
}

async function getPublishInput(options, workDir) {
  if (options.file) {
    const filePath = path.resolve(options.file)
    const stat = await fs.stat(filePath)
    if (!stat.isFile()) {
      throw new Error(`--file must point to a regular file: ${filePath}`)
    }
    return {
      created: false,
      fileName: options.name || path.basename(filePath),
      filePath,
      size: stat.size,
    }
  }

  await fs.mkdir(workDir, { recursive: true })
  const fixtureId = randomUUID()
  const fileName =
    path.basename(options.name) ||
    `mostbox-android-p2p-${fixtureId.slice(0, 8)}.txt`
  const filePath = path.join(workDir, fileName)
  const content = [
    'MostBox Android real P2P test fixture',
    `createdAt=${new Date().toISOString()}`,
    `nonce=${fixtureId}`,
    'cid-is-the-content-identity',
    '',
  ].join('\n')
  await fs.writeFile(filePath, content, 'utf8')
  const stat = await fs.stat(filePath)

  return {
    created: true,
    fileName,
    filePath,
    size: stat.size,
  }
}

function formatBytes(bytes) {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value < 0) return 'unknown'
  if (value < 1024) return `${value} B`

  const units = ['KB', 'MB', 'GB']
  let next = value / 1024
  for (const unit of units) {
    if (next < 1024 || unit === units[units.length - 1]) {
      return `${next.toFixed(next < 10 ? 1 : 0)} ${unit}`
    }
    next /= 1024
  }

  return `${value} B`
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function attachEngineLogs(engine, label, getTargetCid = () => '') {
  const isTargetCid = cid => {
    const targetCid = getTargetCid()
    return !targetCid || cid === targetCid
  }

  engine.on('file:topic:joined', data => {
    if (!data?.cid || isTargetCid(data.cid)) {
      console.log(`[${label}] topic joined: ${data.cid} (${data.topic})`)
    }
  })
  engine.on('connection', () => {
    const status = engine.getNetworkStatus()
    console.log(
      `[${label}] peer connection observed: appPeers=${status.appPeers}, totalPeers=${status.peers}`
    )
  })
  engine.on('seed:metrics', data => {
    if (!data?.cid || isTargetCid(data.cid)) {
      console.log(
        `[${label}] seed metrics: peerCount=${data.peerCount}, totalServed=${formatBytes(data.totalServedBytes)}`
      )
    }
  })
  engine.on('download:status', data => {
    const fileSuffix = data.file ? ` file=${data.file}` : ''
    const sizeSuffix = data.size ? ` size=${data.size}` : ''
    console.log(
      `[${label}] download status: ${data.status}${fileSuffix}${sizeSuffix}`
    )
  })
  engine.on('download:progress', data => {
    const total = data.total ? formatBytes(data.total) : 'unknown'
    console.log(
      `[${label}] download progress: ${data.percent}% (${formatBytes(data.loaded)} / ${total})`
    )
  })
  engine.on('download:success', data => {
    console.log(`[${label}] download success: ${data.savedPath}`)
  })
}

async function waitForActiveHolding(engine, cid, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let latest = null

  while (Date.now() <= deadline) {
    latest = engine.listHoldings().find(holding => holding.cid === cid) || null
    if (latest?.joined === true && latest.seedStatus === 'active') {
      return latest
    }
    await sleep(250)
  }

  return latest
}

async function waitForAndroidHandoffConfirmation({ input, result }) {
  console.log('')
  console.log('Foreground handoff checkpoint.')
  console.log('')
  console.log('Keep this publisher running while Android downloads the link.')
  console.log('Confirm these Android observations before continuing:')
  console.log('- App remains in the foreground and header is Ready/online.')
  console.log(
    '- The download transfer is completed for the printed most:// link.'
  )
  console.log(`- Holdings contains cid ${result.cid.slice(0, 18)}...`)
  console.log(`- Holding size is ${formatBytes(input.size)}.`)
  console.log('- Holding status is active and topicJoined is true.')
  console.log(
    '- Android logs mention the download completion and seeding/holding update.'
  )
  console.log('')

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  try {
    const answer = await rl.question(
      'Press Enter after Android is actively seeding, or type q to abort: '
    )
    if (/^(q|quit|abort)$/i.test(answer.trim())) {
      throw new Error('Foreground handoff regression aborted by user')
    }
  } finally {
    rl.close()
  }
}

async function verifyDownloadedCid(savedPath, expectedCid) {
  const { cid } = await calculateCid(savedPath)
  const actualCid = cid.toString()
  if (actualCid !== expectedCid) {
    throw new Error(
      `Verifier CID mismatch. Expected ${expectedCid}, got ${actualCid}`
    )
  }
  return actualCid
}

function printReadySummary({ dataPath, input, result, holding, workDir }) {
  console.log('')
  console.log('MostBox Android real P2P desktop seed is ready.')
  console.log('')
  console.log('Desktop seed:')
  console.log(`- file: ${input.filePath}`)
  console.log(`- size: ${formatBytes(input.size)}`)
  console.log(`- dataPath: ${dataPath}`)
  console.log(`- workDir: ${workDir}`)
  console.log(`- cid: ${result.cid}`)
  console.log(`- topic: ${holding.topic}`)
  console.log(`- status: ${holding.seedStatus}`)
  console.log(`- topicJoined: ${holding.joined}`)
  console.log('')
  console.log('most:// link:')
  console.log(result.link)
  console.log('')
  console.log('Android observations:')
  console.log('1. Header reaches Ready.')
  console.log('2. Download transfer moves to completed for the printed link.')
  console.log(
    `3. Holdings shows cid ${result.cid.slice(0, 18)}... with status active.`
  )
  console.log(
    `4. Holding size is ${formatBytes(input.size)} and topicJoined is true.`
  )
  console.log(
    `5. Android logs include Downloaded and seeding ${result.cid.slice(0, 16)}.`
  )
  console.log(
    '6. This terminal prints a peer connection or seed metrics after Android connects.'
  )
  console.log('')
  console.log('Publisher-off handoff:')
  console.log('1. Keep the Android app open after its holding becomes active.')
  console.log('2. Stop this desktop seed helper with Ctrl+C.')
  console.log('3. Pull the same link from another desktop/mobile node.')
  console.log(
    '4. The second downloader should still complete and verify from the Android seed.'
  )
  console.log('')
  console.log('Automated publisher-off check:')
  console.log(
    'Run with --handoff-check to stop this publisher, start a fresh verifier node,'
  )
  console.log(
    'pull from Android, and recompute the downloaded CID in this script.'
  )
  console.log('')
}

function printHandoffPassSummary({
  downloadResult,
  elapsedMs,
  holding,
  input,
  result,
  verifiedCid,
  verifierDataPath,
}) {
  console.log('')
  console.log('Android foreground seed handoff regression PASSED.')
  console.log('')
  console.log('Verified path:')
  console.log('- desktop publisher published and joined the CID topic')
  console.log(
    '- Android downloaded the printed link and was manually confirmed active'
  )
  console.log('- original desktop publisher stopped before verification')
  console.log(
    '- fresh verifier node downloaded from the remaining Android seed'
  )
  console.log('- verifier recomputed the UnixFS CID and it matched the link')
  console.log('')
  console.log('Result:')
  console.log(`- cid: ${result.cid}`)
  console.log(`- verifiedCid: ${verifiedCid}`)
  console.log(`- link: ${result.link}`)
  console.log(`- fixture: ${input.filePath}`)
  console.log(`- downloaded: ${downloadResult.savedPath}`)
  console.log(`- size: ${formatBytes(input.size)}`)
  console.log(`- elapsed: ${(elapsedMs / 1000).toFixed(1)}s`)
  console.log(`- verifierDataPath: ${verifierDataPath}`)
  console.log(`- verifierHoldingStatus: ${holding.seedStatus}`)
  console.log(`- verifierTopicJoined: ${holding.joined}`)
  console.log('')
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printHelp()
    return
  }

  const rootDir = path.resolve(DEFAULT_ROOT_DIR)
  const workDir = path.resolve(
    options.workDir || path.join(rootDir, createRunId())
  )
  const dataPath = path.resolve(
    options.dataPath || path.join(workDir, 'node-data')
  )
  const input = await getPublishInput(options, workDir)
  const activeEngines = new Set()
  const engine = new MostBoxEngine({ dataPath })
  activeEngines.add(engine)
  let stoppingAll = false
  let targetCid = ''

  function trackEngine(nextEngine) {
    activeEngines.add(nextEngine)
    return nextEngine
  }

  async function stopEngine(nextEngine, label) {
    if (!activeEngines.has(nextEngine)) return
    activeEngines.delete(nextEngine)
    await nextEngine.stop().catch(err => {
      console.error(`Failed to stop ${label} cleanly: ${err.message}`)
    })
  }

  async function stopAll(signal = '') {
    if (stoppingAll) return
    stoppingAll = true
    if (signal) {
      console.log(`\nStopping Android P2P seed regression (${signal})...`)
    }
    await Promise.allSettled(
      [...activeEngines].map(nextEngine => nextEngine.stop())
    )
    activeEngines.clear()
  }

  async function runHandoffCheck(result) {
    await waitForAndroidHandoffConfirmation({ input, result })

    console.log('')
    console.log('Stopping original desktop publisher before verifier starts...')
    await stopEngine(engine, 'desktop publisher')
    await sleep(PUBLISHER_SHUTDOWN_SETTLE_MS)
    console.log('Original desktop publisher is stopped.')
    console.log('')

    const verifierDataPath = path.join(workDir, 'verifier-node-data')
    const verifierDownloadPath = path.join(workDir, 'verifier-downloads')
    await fs.rm(verifierDataPath, { recursive: true, force: true })
    await fs.rm(verifierDownloadPath, { recursive: true, force: true })
    const verifier = trackEngine(
      new MostBoxEngine({
        dataPath: verifierDataPath,
        downloadPath: verifierDownloadPath,
        downloadTimeout: options.verifyTimeoutMs,
      })
    )
    attachEngineLogs(verifier, 'verifier', () => targetCid)

    console.log('Starting fresh verifier node...')
    await verifier.start()
    console.log(
      `Verifier will wait up to ${(options.verifyTimeoutMs / 1000).toFixed(0)}s for Android.`
    )

    const startedAt = Date.now()
    const downloadResult = await verifier.pullByCid({
      link: result.link,
      taskId: `android_handoff_${Date.now()}`,
      timeout: options.verifyTimeoutMs,
    })
    const elapsedMs = Date.now() - startedAt
    const verifiedCid = await verifyDownloadedCid(
      downloadResult.savedPath,
      result.cid
    )
    const holding = await waitForActiveHolding(
      verifier,
      result.cid,
      options.timeoutMs
    )

    if (
      !holding ||
      holding.joined !== true ||
      holding.seedStatus !== 'active'
    ) {
      throw new Error(
        `Verifier downloaded ${result.cid}, but its holding did not become active before timeout`
      )
    }

    printHandoffPassSummary({
      downloadResult,
      elapsedMs,
      holding,
      input,
      result,
      verifiedCid,
      verifierDataPath,
    })

    await stopEngine(verifier, 'fresh verifier')
  }

  process.once('SIGINT', () => {
    stopAll('SIGINT').finally(() => process.exit(0))
  })
  process.once('SIGTERM', () => {
    stopAll('SIGTERM').finally(() => process.exit(0))
  })

  try {
    attachEngineLogs(engine, 'publisher', () => targetCid)

    console.log('Starting desktop seed node...')
    await engine.start()
    console.log(
      `Publishing ${input.created ? 'generated fixture' : 'file'}: ${input.filePath}`
    )
    const result = await engine.publishFile(input.filePath, input.fileName)
    targetCid = result.cid

    const holding = await waitForActiveHolding(
      engine,
      result.cid,
      options.timeoutMs
    )
    if (
      !holding ||
      holding.joined !== true ||
      holding.seedStatus !== 'active'
    ) {
      throw new Error(
        `Published ${result.cid}, but local seed status did not become active before timeout`
      )
    }

    printReadySummary({ dataPath, input, result, holding, workDir })

    if (options.once) {
      await stopEngine(engine, 'desktop publisher')
      return
    }

    if (options.handoffCheck) {
      await runHandoffCheck(result)
      return
    }

    console.log(
      'Leave this process running while Android downloads. Press Ctrl+C to stop.'
    )
    await new Promise(() => {})
  } catch (err) {
    await stopAll()
    throw err
  }
}

main().catch(err => {
  console.error(`android-real-p2p-seed failed: ${err.message}`)
  process.exit(1)
})
