#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { randomUUID } from 'node:crypto'

import { MostBoxEngine } from '../server/src/index.js'

const DEFAULT_ROOT_DIR = path.join('.tmp', 'android-real-p2p-seed')
const DEFAULT_WAIT_MS = 10_000

function printHelp() {
  console.log(`MostBox Android real P2P desktop seed helper

Usage:
  node scripts/android-real-p2p-seed.mjs
  node scripts/android-real-p2p-seed.mjs --file ./fixtures/small.txt

Options:
  --file <path>       Publish an existing local file instead of a generated fixture.
  --name <filename>   Override the display filename stored in the most:// link.
  --work-dir <path>   Runtime folder for generated fixtures and node data.
  --data-path <path>  Runtime P2P data path. Defaults to <work-dir>/node-data.
  --timeout-ms <ms>   How long to wait for the local holding to become active.
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
    help: false,
    name: '',
    once: false,
    timeoutMs: DEFAULT_WAIT_MS,
    workDir: '',
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '-h' || arg === '--help') {
      options.help = true
    } else if (arg === '--once') {
      options.once = true
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
    } else {
      throw new Error(`Unknown option: ${arg}`)
    }
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
  console.log(`3. Holdings shows cid ${result.cid.slice(0, 18)}... with status active.`)
  console.log(`4. Holding size is ${formatBytes(input.size)} and topicJoined is true.`)
  console.log(`5. Android logs include Downloaded and seeding ${result.cid.slice(0, 16)}.`)
  console.log('6. This terminal prints a peer connection or seed metrics after Android connects.')
  console.log('')
  console.log('Publisher-off handoff:')
  console.log('1. Keep the Android app open after its holding becomes active.')
  console.log('2. Stop this desktop seed helper with Ctrl+C.')
  console.log('3. Pull the same link from another desktop/mobile node.')
  console.log('4. The second downloader should still complete and verify from the Android seed.')
  console.log('')
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printHelp()
    return
  }

  const rootDir = path.resolve(DEFAULT_ROOT_DIR)
  const workDir = path.resolve(options.workDir || path.join(rootDir, createRunId()))
  const dataPath = path.resolve(options.dataPath || path.join(workDir, 'node-data'))
  const input = await getPublishInput(options, workDir)
  const engine = new MostBoxEngine({ dataPath })
  let stopping = false
  let targetCid = ''

  async function stop(signal = '') {
    if (stopping) return
    stopping = true
    if (signal) console.log(`\nStopping desktop seed helper (${signal})...`)
    await engine.stop().catch(err => {
      console.error(`Failed to stop cleanly: ${err.message}`)
    })
  }

  process.once('SIGINT', () => {
    stop('SIGINT').finally(() => process.exit(0))
  })
  process.once('SIGTERM', () => {
    stop('SIGTERM').finally(() => process.exit(0))
  })

  engine.on('file:topic:joined', data => {
    if (!targetCid || data.cid === targetCid) {
      console.log(`[desktop] topic joined: ${data.cid} (${data.topic})`)
    }
  })
  engine.on('connection', () => {
    const status = engine.getNetworkStatus()
    console.log(
      `[desktop] peer connection observed: appPeers=${status.appPeers}, totalPeers=${status.peers}`
    )
  })
  engine.on('seed:metrics', data => {
    if (!targetCid || data.cid === targetCid) {
      console.log(
        `[desktop] seed metrics: peerCount=${data.peerCount}, totalServed=${formatBytes(data.totalServedBytes)}`
      )
    }
  })

  console.log('Starting desktop seed node...')
  await engine.start()
  console.log(`Publishing ${input.created ? 'generated fixture' : 'file'}: ${input.filePath}`)
  const result = await engine.publishFile(input.filePath, input.fileName)
  targetCid = result.cid

  const holding = await waitForActiveHolding(engine, result.cid, options.timeoutMs)
  if (!holding || holding.joined !== true || holding.seedStatus !== 'active') {
    throw new Error(
      `Published ${result.cid}, but local seed status did not become active before timeout`
    )
  }

  printReadySummary({ dataPath, input, result, holding, workDir })

  if (options.once) {
    await stop()
    return
  }

  console.log('Leave this process running while Android downloads. Press Ctrl+C to stop.')
  await new Promise(() => {})
}

main().catch(err => {
  console.error(`android-real-p2p-seed failed: ${err.message}`)
  process.exit(1)
})
