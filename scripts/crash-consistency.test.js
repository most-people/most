// F3 crash consistency: kill the process at every persistence point of a
// publish, a download and the 0.5.x shared-drive migration, restart, and
// check that records and `/<cid>` readability agree. Run with
// `npm run test:crash`.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import b4a from 'b4a'
import Corestore from 'corestore'
import Hyperdrive from 'hyperdrive'
import { MostBoxEngine } from '../server/src/index.js'
import { calculateCid } from '../server/src/core/cid.js'
import { getCidInfo } from '../server/src/core/cidTopic.js'
import { GLOBAL_SHARED_SEED_STRING } from '../server/src/config.js'

const SCRIPT = fileURLToPath(import.meta.url)
const CONTENT = Buffer.alloc(300 * 1024).map((_, i) => i % 251)
const FILE_NAME = 'crash.bin'

// Writes a 0.5.x data directory: content only in the shared drive-<digest>,
// holding record with the digest topic and shared drive name.
async function writeLegacyDataDir(dataPath) {
  const setup = new MostBoxEngine({ dataPath, disableNetwork: true })
  await setup.start()
  await setup.stop()
  const cid = (await calculateCid(CONTENT)).cid.toString()
  const { legacyDriveName } = getCidInfo(cid)
  const store = new Corestore(dataPath, {
    primaryKey: b4a.alloc(32).fill(GLOBAL_SHARED_SEED_STRING),
    unsafe: true,
  })
  const drive = new Hyperdrive(store.namespace(legacyDriveName))
  await drive.ready()
  await drive.put('/' + cid, CONTENT)
  await drive.close()
  await store.close()
  fs.writeFileSync(
    path.join(dataPath, 'node-holdings.json'),
    JSON.stringify([
      {
        cid,
        fileName: FILE_NAME,
        size: CONTENT.length,
        topic: legacyDriveName.slice('drive-'.length),
        driveName: legacyDriveName,
        source: 'downloaded',
      },
    ])
  )
  return cid
}

// ---------------------------------------------------------------------------
// Child: run one operation, recording persistence points or dying at one.
// ---------------------------------------------------------------------------

async function runChild() {
  const { scenario, dir, crashAt, tracePath } = JSON.parse(
    process.env.MOST_CRASH_CHILD
  )
  const dataPath = path.join(dir, 'node')
  let tracing = false
  let count = 0

  const point = name => {
    if (!tracing) return
    if (count === crashAt) {
      fs.writeFileSync(path.join(dir, 'crashed-at'), name)
      process.kill(process.pid, 'SIGKILL')
    }
    count += 1
    if (tracePath) fs.appendFileSync(tracePath, `${name}\n`)
  }

  const renameSync = fs.renameSync
  fs.renameSync = (from, to) => {
    if (String(to).startsWith(dataPath)) point(`rename:${path.basename(to)}`)
    return renameSync(from, to)
  }
  const Hyperbee = createRequire(createRequire(SCRIPT).resolve('hyperdrive'))(
    'hyperbee'
  )
  const put = Hyperbee.prototype.put
  Hyperbee.prototype.put = async function (...args) {
    point('drive-entry:before')
    const result = await put.apply(this, args)
    point('drive-entry:after')
    return result
  }

  if (scenario === 'migrate') {
    await writeLegacyDataDir(dataPath)
    tracing = true
    const engine = new MostBoxEngine({ dataPath, disableNetwork: true })
    await engine.start()
    await waitForResume(engine)
    tracing = false
    await engine.stop()
    return
  }

  const engine = new MostBoxEngine({ dataPath, disableNetwork: true })
  engine.on('publish:progress', event => point(`publish:${event.stage}`))
  engine.on('download:status', event => point(`download:${event.status}`))
  engine.on('download:success', () => point('download:success'))
  await engine.start()

  if (scenario === 'publish') {
    tracing = true
    await engine.publishFile(CONTENT, FILE_NAME)
  } else {
    const seed = new MostBoxEngine({
      dataPath: path.join(dir, 'seed'),
      disableNetwork: true,
    })
    await seed.start()
    const { link } = await seed.publishFile(CONTENT, FILE_NAME)
    engine.replicateWith(seed)
    tracing = true
    await engine.downloadFile(link, null, { timeout: 10000 })
    tracing = false
    await seed.stop()
  }
  tracing = false
  await engine.stop()
}

// ---------------------------------------------------------------------------
// Parent
// ---------------------------------------------------------------------------

function spawnChild(options) {
  const result = spawnSync(process.execPath, [SCRIPT], {
    env: { ...process.env, MOST_CRASH_CHILD: JSON.stringify(options) },
    encoding: 'utf8',
    timeout: 60000,
  })
  return result
}

function traceScenario(scenario) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'most-crash-trace-'))
  try {
    const tracePath = path.join(dir, 'trace')
    const result = spawnChild({ scenario, dir, crashAt: -1, tracePath })
    assert.equal(result.status, 0, result.stderr)
    return fs.readFileSync(tracePath, 'utf8').trim().split('\n')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

async function waitForResume(engine) {
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    const pending = engine
      .listHoldings()
      .filter(h => !['active', 'error'].includes(h.seedStatus))
    if (pending.length === 0) return
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  throw new Error('holdings did not settle after restart')
}

// Independent oracle: a fresh, empty node downloads the CID from `engine`.
// downloadFile only succeeds after recomputing the CID, so success means
// `engine` serves exactly the bytes the CID names.
let probes = 0
async function assertServesCid(engine, dir, cid) {
  const probe = new MostBoxEngine({
    dataPath: path.join(dir, `probe-${probes++}`),
    disableNetwork: true,
  })
  await probe.start()
  try {
    probe.replicateWith(engine)
    await probe.downloadFile(`most://${cid}`, null, { timeout: 10000 })
  } finally {
    await probe.stop()
  }
}

// Invariants after restart:
// - every CID reported as seeding or locally available is served correctly
// - every library record has a holding (it is seeding or shown as error)
// - no download temp directory survives the restart
async function checkConsistency(engine, dir, dataPath) {
  const violations = []
  const holdings = engine.listHoldings()
  const holdingCids = new Set(holdings.map(h => h.cid))
  const claimed = new Set(
    holdings.filter(h => h.seedStatus === 'active').map(h => h.cid)
  )
  for (const file of await engine.listPublishedFilesWithAvailability()) {
    if (file.localAvailable) claimed.add(file.cid)
    if (!holdingCids.has(file.cid)) {
      violations.push(`library file ${file.cid} has no holding`)
    }
  }
  for (const file of engine.listPublishedFiles()) {
    if (file.localAvailable) claimed.add(file.cid)
  }
  for (const cid of [...holdingCids]) {
    const local = await engine.getLocalCidAvailability(`most://${cid}`)
    if (local?.available) claimed.add(cid)
  }
  for (const cid of claimed) {
    try {
      await assertServesCid(engine, dir, cid)
    } catch (err) {
      violations.push(
        `${cid} reported available but not served: ${err.message}`
      )
    }
  }
  const leftovers = fs
    .readdirSync(dataPath)
    .filter(name => name.startsWith('.download-tmp-'))
  if (leftovers.length > 0) {
    violations.push(`download temp left behind: ${leftovers.join(', ')}`)
  }
  return violations
}

async function crashAndCheck(scenario, crashAt) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'most-crash-'))
  const dataPath = path.join(dir, 'node')
  const engines = []
  try {
    const result = spawnChild({ scenario, dir, crashAt })
    const crashedAt = fs.existsSync(path.join(dir, 'crashed-at'))
      ? fs.readFileSync(path.join(dir, 'crashed-at'), 'utf8')
      : null
    assert.ok(crashedAt, `child did not crash: ${result.stderr}`)

    const engine = new MostBoxEngine({ dataPath, disableNetwork: true })
    engines.push(engine)
    await engine.start()
    await waitForResume(engine)
    const violations = await checkConsistency(engine, dir, dataPath)

    // Recovery: repeating the operation must succeed and leave it seeding.
    // A migration must never lose content: the restarted node serves it.
    let cid
    if (scenario === 'migrate') {
      cid = (await calculateCid(CONTENT)).cid.toString()
    } else if (scenario === 'publish') {
      ;({ cid } = await engine.publishFile(CONTENT, FILE_NAME))
    } else {
      const seed = new MostBoxEngine({
        dataPath: path.join(dir, 'seed'),
        disableNetwork: true,
      })
      engines.push(seed)
      await seed.start()
      const published = await seed.publishFile(CONTENT, FILE_NAME)
      engine.replicateWith(seed)
      await engine.downloadFile(published.link, null, { timeout: 10000 })
      cid = published.cid
    }
    await assertServesCid(engine, dir, cid)
    const holding = engine.listHoldings().find(h => h.cid === cid)
    assert.equal(holding?.seedStatus, 'active', 'not seeding after recovery')

    return { crashedAt, violations }
  } finally {
    await Promise.allSettled(engines.map(engine => engine.stop()))
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

if (process.env.MOST_CRASH_CHILD) {
  await runChild()
} else {
  for (const scenario of ['publish', 'download', 'migrate']) {
    describe(`crash during ${scenario}`, () => {
      const trace = traceScenario(scenario)
      for (const [index, name] of trace.entries()) {
        it(`#${index} before ${name}`, { timeout: 90000 }, async () => {
          const { crashedAt, violations } = await crashAndCheck(scenario, index)
          assert.equal(crashedAt, name, 'crash point drifted from trace')
          assert.deepEqual(violations, [])
        })
      }
    })
  }
}
