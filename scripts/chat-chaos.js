// Chat invariants C1–C5 under random partitions and restarts. Engines run in
// one process with networking off and replicate over in-memory links
// (MostBoxEngine#replicateWith), so a partition is closing links and a
// restart is stopping an engine and starting a new one on the same data
// directory. Every round:
//   1. a random fault: partition the nodes in two, restart one, both, or none;
//   2. 1–6 messages from random online nodes (some with repeated text, some
//      re-sent with the same clientMessageId, as the UI retries);
//   3. heal: all nodes online, full mesh;
//   4. wait until every node holds every confirmed message (timeout 60s) and
//      log each node's history as observed.
// The JSONL log is the evidence; --summarize recomputes the verdict from it:
//   C1 no confirmed message missing, C2 no duplicates, C3 each sender's
//   messages in send order, C4 all nodes hold the same set; convergence P95
//   <= 30s (AGENTS.md thresholds, >= 100 rounds). C5 runs once at the end and
//   records what an isolated node can read.
//
//   node scripts/chat-chaos.js --rounds 100 --rng 20261116 --out chat.jsonl
//   node scripts/chat-chaos.js --summarize chat.jsonl
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { MostBoxEngine } from '../server/src/index.js'

const NODES = 4
const CHANNEL = 'chaos-room'
const CONVERGE_TIMEOUT = 60000
const HISTORY_LIMIT = 100000
export const THRESHOLDS = { minRounds: 100, convergenceP95: 30000 }

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

function args() {
  const out = {}
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i += 2) out[argv[i].slice(2)] = argv[i + 1]
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

const address = node => `0x${String(node + 1).repeat(40)}`
// A valid v4 UUID that encodes the sender and its sequence number.
const messageId = (node, seq) =>
  `${String(node).padStart(8, '0')}-0000-4000-8000-${String(seq).padStart(12, '0')}`

function percentile(values, p) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]
}

export function summarize(lines) {
  const confirmedAt = new Map() // id -> index in confirm order
  const senderOf = new Map()
  const violations = { C1: [], C2: [], C3: [], C4: [] }
  const convergence = []
  let rounds = 0
  let timeouts = 0
  let c5 = null
  const byRound = new Map()
  for (const event of lines) {
    if (event.type === 'confirm' && !confirmedAt.has(event.id)) {
      confirmedAt.set(event.id, confirmedAt.size)
      senderOf.set(event.id, event.node)
    }
    if (event.type === 'observe') {
      if (!byRound.has(event.round)) byRound.set(event.round, [])
      byRound.get(event.round).push(event)
      // Everything confirmed so far must be there (C1).
      const seen = new Set(event.ids)
      for (const id of confirmedAt.keys()) {
        if (!seen.has(id)) {
          violations.C1.push({ round: event.round, node: event.node, id })
        }
      }
      if (seen.size !== event.ids.length) {
        violations.C2.push({ round: event.round, node: event.node })
      }
      const last = new Map()
      for (const id of event.ids) {
        const sender = senderOf.get(id) ?? Number(id.slice(0, 8))
        const order = confirmedAt.get(id) ?? Infinity
        if (order < (last.get(sender) ?? -1)) {
          violations.C3.push({ round: event.round, node: event.node, id })
        }
        last.set(sender, order)
      }
    }
    if (event.type === 'converged') {
      rounds += 1
      if (event.ms === null) timeouts += 1
      else convergence.push(event.ms)
    }
    if (event.type === 'c5') c5 = event
  }
  for (const [round, observed] of byRound) {
    const sets = observed.map(o => [...o.ids].sort().join(','))
    if (new Set(sets).size > 1) violations.C4.push({ round })
  }
  const counts = Object.fromEntries(
    Object.entries(violations).map(([k, v]) => [k, v.length])
  )
  const convergenceP95 = timeouts > 0 ? null : percentile(convergence, 0.95)
  return {
    rounds,
    messages: confirmedAt.size,
    violations: counts,
    firstViolations: Object.fromEntries(
      Object.entries(violations).map(([k, v]) => [k, v.slice(0, 3)])
    ),
    convergenceTimeouts: timeouts,
    convergenceP50: percentile(convergence, 0.5),
    convergenceP95,
    c5,
    meetsThreshold:
      rounds >= THRESHOLDS.minRounds &&
      Object.values(counts).every(n => n === 0) &&
      convergenceP95 !== null &&
      convergenceP95 <= THRESHOLDS.convergenceP95,
  }
}

async function run(options) {
  const rounds = Number(options.rounds || 100)
  const rngSeed = Number(options.rng || Date.now() % 2 ** 31)
  const rng = mulberry32(rngSeed)
  const pick = n => Math.floor(rng() * n)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'most-chat-chaos-'))
  const out = fs.openSync(options.out || 'chat-chaos.jsonl', 'a')
  const t0 = Date.now()
  const log = event =>
    fs.writeSync(out, `${JSON.stringify({ t: Date.now() - t0, ...event })}\n`)
  log({
    type: 'meta',
    nodes: NODES,
    rounds,
    rngSeed,
    commit: options.commit || '',
    node: process.version,
    platform: `${os.platform()} ${os.release()} ${os.arch()}`,
  })

  const engines = new Array(NODES).fill(null)
  const links = new Map()
  const seq = new Array(NODES).fill(0)
  const sent = [] // { node, id, content }
  const start = async node => {
    const engine = new MostBoxEngine({
      dataPath: path.join(dir, `node-${node}`),
      disableNetwork: true,
    })
    await engine.start()
    engines[node] = engine
  }
  const unlinkAll = () => {
    for (const link of links.values()) link.close()
    links.clear()
  }
  // Link every pair of online nodes that are in the same group.
  const link = groupOf => {
    for (let a = 0; a < NODES; a += 1) {
      for (let b = a + 1; b < NODES; b += 1) {
        const key = `${a}-${b}`
        const want = engines[a] && engines[b] && groupOf(a) === groupOf(b)
        if (want && !links.has(key)) {
          links.set(key, engines[a].replicateWith(engines[b]))
        }
        if (!want && links.has(key)) {
          links.get(key).close()
          links.delete(key)
        }
      }
    }
  }
  const stop = async node => {
    for (const [key, l] of links) {
      if (key.split('-').map(Number).includes(node)) {
        l.close()
        links.delete(key)
      }
    }
    // Let blocks already in flight finish: hypercore verifies them after the
    // stream closes and throws uncaught if the store is closed meanwhile
    // (seen once in 147 rounds; recorded in docs/validation-status.md).
    await sleep(100)
    await engines[node].stop()
    engines[node] = null
  }
  const send = async (round, node, retry) => {
    const message = retry || {
      node,
      id: messageId(node, (seq[node] += 1)),
      // Repeated text must not merge distinct messages.
      content: rng() < 0.3 ? 'ok' : `m ${node}.${seq[node]}`,
    }
    log({ type: 'send', round, node, id: message.id, retry: Boolean(retry) })
    await engines[node].sendMessage(
      CHANNEL,
      message.content,
      address(node),
      `node ${node}`,
      { clientMessageId: message.id }
    )
    log({ type: 'confirm', round, node, id: message.id })
    if (!retry) sent.push(message)
  }
  const ids = async node =>
    (await engines[node].getChannelMessages(CHANNEL, { limit: HISTORY_LIMIT }))
      .map(m => m.clientMessageId)
      .filter(Boolean)
  const online = () => engines.flatMap((e, i) => (e ? [i] : []))

  try {
    for (let node = 0; node < NODES; node += 1) {
      await start(node)
      await engines[node].createChannel(CHANNEL, 'public')
    }
    link(() => 0)

    for (let round = 0; round < rounds; round += 1) {
      const roll = rng()
      const fault =
        roll < 0.4
          ? 'partition'
          : roll < 0.7
            ? 'restart'
            : roll < 0.85
              ? 'partition+restart'
              : 'none'
      log({ type: 'fault', round, fault })
      if (fault.includes('partition')) {
        // A random split with both sides non-empty.
        const mask = 1 + pick(2 ** NODES - 2)
        link(node => (mask >> node) & 1)
        log({ type: 'partition', round, mask })
      }
      const restartAt = fault.includes('restart') ? pick(6) : -1
      const victim = pick(NODES)
      const count = 1 + pick(6)
      for (let i = 0; i < count; i += 1) {
        if (i === restartAt) {
          log({ type: 'stop', round, node: victim })
          await stop(victim)
        }
        const candidates = online()
        const node = candidates[pick(candidates.length)]
        const mine = sent.filter(m => m.node === node)
        const retry =
          mine.length > 0 && rng() < 0.1 ? mine[pick(mine.length)] : null
        await send(round, node, retry)
      }
      if (restartAt >= 0) {
        if (!engines[victim]) {
          await start(victim)
          log({ type: 'start', round, node: victim })
        }
      }
      link(() => 0)
      log({ type: 'heal', round })
      const healedAt = Date.now()
      const want = sent.map(m => m.id)
      let ms = null
      while (Date.now() - healedAt < CONVERGE_TIMEOUT) {
        const all = await Promise.all(online().map(ids))
        if (all.every(list => want.every(id => list.includes(id)))) {
          ms = Date.now() - healedAt
          break
        }
        await sleep(50)
      }
      for (const node of online()) {
        log({ type: 'observe', round, node, ids: await ids(node) })
      }
      log({ type: 'converged', round, ms })
    }

    // C5: what a node can read when every other member is offline.
    const before = await ids(0)
    for (let node = 1; node < NODES; node += 1) await stop(node)
    await stop(0)
    await start(1)
    await send(rounds, 1, null)
    const unseen = sent.at(-1).id
    await stop(1)
    await start(0)
    const alone = await ids(0)
    await start(1)
    link(() => 0)
    const reconnectedAt = Date.now()
    let after = await ids(0)
    while (!after.includes(unseen) && Date.now() - reconnectedAt < 30000) {
      await sleep(50)
      after = await ids(0)
    }
    log({
      type: 'c5',
      beforeIsolation: before.length,
      readableAlone: alone.length,
      allPriorReadable: before.every(id => alone.includes(id)),
      sentWhileOfflineVisibleAlone: alone.includes(unseen),
      visibleAfterReconnectMs: after.includes(unseen)
        ? Date.now() - reconnectedAt
        : null,
    })
  } finally {
    unlinkAll()
    await Promise.allSettled(engines.filter(Boolean).map(e => e.stop()))
    fs.closeSync(out)
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

if (path.resolve(process.argv[1] || '') === import.meta.filename) {
  const options = args()
  if (options.summarize) {
    const lines = fs
      .readFileSync(options.summarize, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line))
    const summary = summarize(lines)
    console.log(JSON.stringify(summary))
    process.exitCode = summary.meetsThreshold ? 0 : 1
  } else {
    // Engine logs go to stdout; the evidence is the JSONL file.
    await run(options)
    process.exit(0)
  }
}
