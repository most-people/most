// F5 relay under churn. Each run: a publisher publishes a fresh file, K seeds
// download it over a hyperdht testnet, the publisher exits, non-anchor seeds
// go down and up on a schedule drawn from the recorded RNG seed, and a new
// node starts downloading the link while that churn is under way. Every event
// goes to a JSONL log; the summary is computed only from that log.
//
// Loopback, all nodes in this process:
//   node scripts/relay-churn.js --runs 300 --seeds 1,2,5 --rng 1 --out log.jsonl
// Linux network namespaces (root; see scripts/netns-topology.sh), one process
// per node, condition lan | cone | mixed | symmetric:
//   scripts/netns-topology.sh up cone 7
//   node scripts/relay-churn.js --netns cone --runs 300 --seeds 2 --out log.jsonl
// --relay runs scripts/blind-relay.js in namespace "bs" and gives every node
// its key as relayThrough.
// In mixed mode the downloader must use the symmetric (last) slot:
//   node scripts/relay-churn.js --netns mixed --downloader-slot 6 ...
// Summary and threshold check:
//   node scripts/relay-churn.js --summarize log.jsonl
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'
import { once } from 'node:events'
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import createTestnet from 'hyperdht/testnet.js'
import { MostBoxEngine } from '../server/src/index.js'

const DOWNLOAD_TIMEOUT = 60000
const FILE_SIZE = 64 * 1024
const WORKER = fileURLToPath(new URL('./relay-worker.js', import.meta.url))
// AGENTS.md thresholds per network condition: same network, holepunch
// (cone, and cone to symmetric) and relay (symmetric on both sides).
const THRESHOLDS = {
  loopback: { minSuccess: 0.99, discoveryP95: 10000 },
  lan: { minSuccess: 0.99, discoveryP95: 10000 },
  cone: { minSuccess: 0.99, discoveryP95: 30000 },
  mixed: { minSuccess: 0.99, discoveryP95: 30000 },
  symmetric: { minSuccess: 0.95, discoveryP95: 60000 },
  // Real devices and networks: >= 30 runs, >= 90%, no time threshold.
  'real-wifi': { minRuns: 30, minSuccess: 0.9, discoveryP95: Infinity },
  'real-cross': { minRuns: 30, minSuccess: 0.9, discoveryP95: Infinity },
}

function args() {
  const out = {}
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue
    const value = argv[i + 1]
    // A flag without a value (e.g. --relay) is true.
    out[argv[i].slice(2)] =
      value === undefined || value.startsWith('--') ? 'true' : value
  }
  return out
}

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const sha256 = buffer => createHash('sha256').update(buffer).digest('hex')

// A node runs either in this process or as a worker in network namespace
// n<slot>. Both expose the same async interface.
async function inProcessNode(options) {
  const engine = new MostBoxEngine(options)
  await engine.start()
  return {
    onStatus: fn => engine.on('download:status', e => fn(e.status)),
    publish: async (content, name) => engine.publishFile(content, name),
    download: (link, timeout) => engine.downloadFile(link, null, { timeout }),
    seedStatus: async cid =>
      engine.listHoldings().find(h => h.cid === cid)?.seedStatus || null,
    sha256: async cid => sha256((await engine.readFileRaw(cid)).buffer),
    stop: () => engine.stop(),
  }
}

function spawnWorker(namespace) {
  return spawnWorkerCommand('ip', [
    'netns',
    'exec',
    namespace,
    process.execPath,
    WORKER,
  ])
}

// Drives scripts/relay-worker.js started by any command (netns, ssh, ...).
export function spawnWorkerCommand(command, args) {
  const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'inherit'] })
  const pending = new Map()
  const statusListeners = []
  let nextId = 0
  readline.createInterface({ input: child.stdout }).on('line', line => {
    const message = JSON.parse(line)
    if (message.event === 'status') {
      for (const fn of statusListeners) fn(message.status)
      return
    }
    const { resolve, reject } = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) reject(new Error(message.error))
    else resolve(message.result)
  })
  child.on('exit', () => {
    for (const { reject } of pending.values()) {
      reject(new Error(`worker ${command} exited`))
    }
    pending.clear()
  })
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve, reject })
      child.stdin.write(`${JSON.stringify({ id, method, params })}\n`)
    })
  return { call, statusListeners, child }
}

async function namespaceNode(slot, options) {
  const worker = spawnWorker(`n${slot}`)
  await worker.call('start', options)
  return {
    onStatus: fn => worker.statusListeners.push(fn),
    publish: (content, name) =>
      worker.call('publish', {
        contentBase64: content.toString('base64'),
        name,
      }),
    download: (link, timeout) => worker.call('download', { link, timeout }),
    seedStatus: cid => worker.call('seedStatus', { cid }),
    sha256: cid => worker.call('sha256', { cid }),
    stop: async () => {
      await worker.call('stop').catch(() => {})
      if (worker.child.exitCode === null) worker.child.kill('SIGKILL')
    },
  }
}

async function waitForActive(node, cid, timeout = 30000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if ((await node.seedStatus(cid)) === 'active') return
    await sleep(100)
  }
  throw new Error(`seed did not become active for ${cid}`)
}

async function runOnce(context) {
  const { run, k, rng, bootstrap, dir, log, netns, downloaderSlot, relay } =
    context
  const runDir = path.join(dir, `run-${k}-${run}`)
  const nodes = new Set()
  // Slots: publisher 0, seed i at 1 + i, downloader k + 1 unless given.
  const start = async (name, slot) => {
    const options = {
      dataPath: path.join(runDir, name),
      bootstrap,
      downloadTimeout: DOWNLOAD_TIMEOUT,
      ...(relay ? { relayThrough: relay } : {}),
    }
    const node = netns
      ? await namespaceNode(slot, options)
      : await inProcessNode(options)
    nodes.add(node)
    return node
  }
  const stop = async node => {
    nodes.delete(node)
    await node.stop()
  }

  try {
    const content = Buffer.from(
      Array.from({ length: FILE_SIZE }, () => Math.floor(rng() * 256))
    )
    const publisher = await start('publisher', 0)
    const { cid, link } = await publisher.publish(content, 'f.bin')
    log({ run, k, type: 'published', cid })

    const seeds = await Promise.all(
      Array.from({ length: k }, (_, i) => start(`seed-${i}`, 1 + i))
    )
    await Promise.all(
      seeds.map(async (seed, i) => {
        await seed.download(link, DOWNLOAD_TIMEOUT)
        await waitForActive(seed, cid)
        log({ run, k, type: 'seed-up', seed: i })
      })
    )
    await stop(publisher)
    log({ run, k, type: 'publisher-stopped' })

    // Seed 0 is the anchor and stays online. Others may go down once and
    // come back, at times drawn from the RNG.
    const churn = seeds.slice(1).map(async (seed, j) => {
      const i = j + 1
      if (rng() < 0.5) return
      const downAt = rng() * 3000
      const downFor = 500 + rng() * 2500
      await sleep(downAt)
      log({ run, k, type: 'seed-down', seed: i })
      await stop(seed)
      await sleep(downFor)
      const restarted = await start(`seed-${i}`, 1 + i)
      await waitForActive(restarted, cid)
      log({ run, k, type: 'seed-up', seed: i })
    })

    // Start the download while churn is under way, so stale DHT records of
    // stopped seeds (and the publisher) are in play.
    const startDelay = rng() * 4000
    const downloader = await start('downloader', downloaderSlot ?? k + 1)
    downloader.onStatus(status => log({ run, k, type: 'status', status }))
    await sleep(startDelay)
    log({ run, k, type: 'download-start' })
    try {
      await downloader.download(link, DOWNLOAD_TIMEOUT)
      log({
        run,
        k,
        type: 'done',
        ok: (await downloader.sha256(cid)) === sha256(content),
      })
    } catch (err) {
      log({
        run,
        k,
        type: 'done',
        ok: false,
        error: err.message.split('\n')[0],
      })
    }
    await Promise.allSettled(churn)
  } catch (err) {
    log({ run, k, type: 'setup-error', error: err.message.split('\n')[0] })
  } finally {
    await Promise.allSettled([...nodes].map(node => node.stop()))
    fs.rmSync(runDir, { recursive: true, force: true })
  }
}

function percentile(values, p) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]
}

export function summarize(lines) {
  const condition = lines.find(e => e.type === 'meta')?.condition || 'loopback'
  const threshold = THRESHOLDS[condition]
  const setupErrors = new Map()
  const runs = new Map()
  for (const event of lines) {
    if (event.type === 'setup-error') {
      setupErrors.set(event.k, (setupErrors.get(event.k) || 0) + 1)
    }
    if (event.run === undefined) continue
    const key = `${event.k}:${event.run}`
    if (!runs.has(key)) runs.set(key, { k: event.k, events: [] })
    runs.get(key).events.push(event)
  }

  const byK = new Map()
  for (const { k, events } of runs.values()) {
    const at = type => events.find(e => e.type === type)?.t
    const startT = at('download-start')
    const done = events.find(e => e.type === 'done')
    if (startT === undefined || !done) continue
    // Qualifies when some seed is up for the whole download window.
    const covered = new Set()
    const down = new Set()
    for (const e of events) {
      if (e.t > startT) break
      if (e.type === 'seed-down') down.add(e.seed)
      if (e.type === 'seed-up') down.delete(e.seed)
    }
    for (const e of events) {
      if (e.type === 'seed-up' && e.t <= startT) covered.add(e.seed)
      if (e.type === 'seed-down' && e.t <= done.t) covered.delete(e.seed)
    }
    const found = events.find(
      e => e.type === 'status' && e.status === 'downloading'
    )
    if (!byK.has(k)) {
      byK.set(k, {
        attempts: 0,
        qualifying: 0,
        withSeedDown: 0,
        ok: 0,
        errors: {},
        d: [],
        c: [],
      })
    }
    const stats = byK.get(k)
    stats.attempts += 1
    if (covered.size === 0) continue
    stats.qualifying += 1
    if (down.size > 0) stats.withSeedDown += 1
    if (done.ok) {
      stats.ok += 1
      if (found) stats.d.push(found.t - startT)
      stats.c.push(done.t - startT)
    } else {
      // Group by message: drop the CID and anything after the first line.
      const reason = (done.error || 'wrong bytes')
        .split('\n')[0]
        .replace(/baf[a-z2-7]+/g, '<cid>')
      stats.errors[reason] = (stats.errors[reason] || 0) + 1
    }
  }

  // Seed counts whose runs all failed before the download still get a row.
  for (const k of setupErrors.keys()) {
    if (!byK.has(k)) {
      byK.set(k, {
        attempts: 0,
        qualifying: 0,
        withSeedDown: 0,
        ok: 0,
        errors: {},
        d: [],
        c: [],
      })
    }
  }

  return [...byK.entries()]
    .sort(([a], [b]) => a - b)
    .map(([k, s]) => {
      const failures = s.qualifying - s.ok
      const discoveryP95 = percentile(s.d, 0.95)
      return {
        condition,
        seeds: k,
        setupErrors: setupErrors.get(k) || 0,
        attempts: s.attempts,
        qualifying: s.qualifying,
        withSeedDown: s.withSeedDown,
        ok: s.ok,
        failures,
        errors: s.errors,
        discoveryP50: percentile(s.d, 0.5),
        discoveryP95,
        completionP50: percentile(s.c, 0.5),
        completionP95: percentile(s.c, 0.95),
        meetsThreshold:
          s.qualifying >= (threshold.minRuns ?? 300) &&
          s.ok / s.qualifying >= threshold.minSuccess &&
          discoveryP95 !== null &&
          discoveryP95 <= threshold.discoveryP95,
      }
    })
}

async function main() {
  const options = args()
  if (options.summarize) {
    const lines = fs
      .readFileSync(options.summarize, 'utf8')
      .trim()
      .split('\n')
      .map(line => JSON.parse(line))
    const summary = summarize(lines)
    for (const row of summary) console.log(JSON.stringify(row))
    if (summary.some(row => !row.meetsThreshold)) process.exitCode = 1
    return
  }

  const runsPerK = Number(options.runs || 10)
  const ks = String(options.seeds || '1,2,5')
    .split(',')
    .map(Number)
  const rngSeed = Number(options.rng || 1)
  const outPath = options.out || 'relay-churn.jsonl'
  const rng = mulberry32(rngSeed)
  const out = fs.openSync(outPath, 'a')
  const t0 = Date.now()
  const log = event =>
    fs.writeSync(out, `${JSON.stringify({ t: Date.now() - t0, ...event })}\n`)

  const netns = options.netns || null
  let commit = options.commit || ''
  try {
    commit ||= execFileSync('git', ['rev-parse', 'HEAD']).toString().trim()
  } catch {}
  log({
    type: 'meta',
    condition: netns || 'loopback',
    netem: options.netem || '',
    relay: Boolean(netns && options.relay !== undefined),
    rngSeed,
    runsPerK,
    ks,
    commit,
    node: process.version,
    platform: `${os.platform()} ${os.release()} ${os.arch()}`,
  })

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'most-churn-'))
  // The bootstrap runs in namespace "bs" (20.20.0.2) in netns mode.
  const bootstrapWorker = netns ? spawnWorker('bs') : null
  const testnet = netns ? null : await createTestnet(3)
  const bootstrap = netns
    ? await bootstrapWorker.call('bootstrap', { host: '20.20.0.2' })
    : testnet.bootstrap
  let relayProcess = null
  let relay = null
  if (netns && options.relay !== undefined) {
    relayProcess = spawn(
      'ip',
      [
        'netns',
        'exec',
        'bs',
        process.execPath,
        fileURLToPath(new URL('./blind-relay.js', import.meta.url)),
        '--seed-file',
        path.join(dir, 'relay-seed'),
        '--bootstrap',
        JSON.stringify(bootstrap),
        '--public',
        'true',
      ],
      { stdio: ['ignore', 'pipe', 'inherit'] }
    )
    const [line] = await once(
      readline.createInterface({ input: relayProcess.stdout }),
      'line'
    )
    relay = JSON.parse(line).relayPublicKey
  }
  try {
    for (const k of ks) {
      for (let run = 0; run < runsPerK; run += 1) {
        await runOnce({
          run,
          k,
          rng,
          bootstrap,
          dir,
          log,
          netns,
          relay,
          downloaderSlot:
            options['downloader-slot'] === undefined
              ? undefined
              : Number(options['downloader-slot']),
        })
      }
    }
  } finally {
    relayProcess?.kill()
    await testnet?.destroy()
    if (bootstrapWorker) {
      await bootstrapWorker.call('stop').catch(() => {})
    }
    fs.rmSync(dir, { recursive: true, force: true })
    fs.closeSync(out)
  }
}

if (path.resolve(process.argv[1] || '') === import.meta.filename) {
  await main()
}
