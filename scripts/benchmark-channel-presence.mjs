import crypto from 'node:crypto'
import fs from 'node:fs'
import { Session } from 'node:inspector/promises'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { MostBoxEngine } from '../server/src/index.js'

// node scripts/benchmark-channel-presence.mjs <output-directory>
const channelCount = 850
const peerCount = 8
const heartbeats = 100
const outputDirectory = path.resolve(process.argv[2] || os.tmpdir())
const temporaryDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), 'most-presence-benchmark-')
)
const ownerAddress = `0x${'1'.repeat(40)}`
const channelName = 'presence-benchmark-0'
const presenceOptions = { ownerAddress, sessionId: 'benchmark' }
const engines = []
const connections = []
const session = new Session()
const originalLog = console.log
const originalCreateHash = crypto.createHash

function removeTemporaryDirectory() {
  const resolved = path.resolve(temporaryDirectory)
  if (
    path.dirname(resolved) !== path.resolve(os.tmpdir()) ||
    !path.basename(resolved).startsWith('most-presence-benchmark-')
  ) {
    throw new Error('Unexpected benchmark data directory')
  }
  fs.rmSync(resolved, { recursive: true, force: true })
}

async function waitForPresence(engine) {
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    if (
      engine
        .getChannelPresence(channelName, { ownerAddress })
        .some(item => item.address === ownerAddress)
    ) {
      return
    }
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error('Peer did not receive the warm-up presence')
}

try {
  console.log = () => {}
  process.stderr.write(
    `Preparing ${channelCount} channels and ${peerCount} peers...\n`
  )
  const engine = new MostBoxEngine({
    dataPath: path.join(temporaryDirectory, 'central'),
    disableNetwork: true,
  })
  engines.push(engine)
  await engine.start()
  for (let index = 0; index < channelCount; index++) {
    await engine.createChannel(`presence-benchmark-${index}`, 'public', {
      ownerAddress,
    })
  }
  for (let index = 0; index < peerCount; index++) {
    const peer = new MostBoxEngine({
      dataPath: path.join(temporaryDirectory, `peer-${index}`),
      disableNetwork: true,
    })
    engines.push(peer)
    await peer.start()
    await peer.createChannel(channelName, 'public', { ownerAddress })
    connections.push(engine.replicateWith(peer))
  }
  engine.joinChannelPresence(channelName, presenceOptions)
  await Promise.all(engines.slice(1).map(waitForPresence))
  engine.heartbeatChannelPresence(channelName, presenceOptions)
  await new Promise(resolve => setImmediate(resolve))

  session.connect()
  await session.post('Profiler.enable')
  await session.post('Profiler.start')
  let sha256Calls = 0
  crypto.createHash = function (...args) {
    if (args[0] === 'sha256') sha256Calls++
    return originalCreateHash.apply(this, args)
  }
  const cpuStart = process.cpuUsage()
  const start = performance.now()
  const eventLoopProbe = new Promise(resolve => {
    setTimeout(() => resolve(performance.now() - start), 0)
  })
  for (let index = 0; index < heartbeats; index++) {
    engine.heartbeatChannelPresence(channelName, presenceOptions)
  }
  const heartbeatMs = performance.now() - start
  const eventLoopProbeMs = await eventLoopProbe
  await new Promise(resolve => setImmediate(resolve))
  const cpuUsage = process.cpuUsage(cpuStart)
  crypto.createHash = originalCreateHash
  // Keep fast runs long enough to collect a useful CPU profile. Timing and
  // hash counts above still describe exactly the first 100 heartbeats.
  let profileHeartbeats = heartbeats
  while (performance.now() - start < 1000) {
    for (let index = 0; index < heartbeats; index++) {
      engine.heartbeatChannelPresence(channelName, presenceOptions)
    }
    profileHeartbeats += heartbeats
    await new Promise(resolve => setImmediate(resolve))
  }
  const { profile } = await session.post('Profiler.stop')
  await session.post('Profiler.disable')
  const result = {
    nodeVersion: process.version,
    channelCount,
    peerCount,
    heartbeats,
    sha256Calls,
    heartbeatMs,
    eventLoopProbeMs,
    cpuUserMs: cpuUsage.user / 1000,
    cpuSystemMs: cpuUsage.system / 1000,
    profileHeartbeats,
  }
  fs.mkdirSync(outputDirectory, { recursive: true })
  fs.writeFileSync(
    path.join(outputDirectory, 'presence.cpuprofile'),
    JSON.stringify(profile)
  )
  fs.writeFileSync(
    path.join(outputDirectory, 'presence.json'),
    JSON.stringify(result, null, 2) + '\n'
  )
  process.stdout.write(JSON.stringify(result, null, 2) + '\n')
} finally {
  crypto.createHash = originalCreateHash
  session.disconnect()
  for (const connection of connections) connection.close()
  for (const engine of engines) await engine.stop()
  console.log = originalLog
  removeTemporaryDirectory()
}
