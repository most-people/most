// One MostBox engine (or the DHT bootstrap) per process, driven over stdio
// with JSON lines by scripts/relay-churn.js. Used to place nodes in separate
// Linux network namespaces.
import { createHash } from 'node:crypto'
import readline from 'node:readline'
import createTestnet from 'hyperdht/testnet.js'
import { MostBoxEngine } from '../server/src/index.js'

const send = message => process.stdout.write(`${JSON.stringify(message)}\n`)
let engine = null
let testnet = null

const methods = {
  async bootstrap({ host }) {
    // 10 nodes: with 3, new nodes cannot sample their address and the first
    // holepunch on a fresh topology waits for a ~13s timeout.
    testnet = await createTestnet(10, { host })
    return testnet.bootstrap
  },
  async start(options) {
    engine = new MostBoxEngine({
      ...options,
      relayThrough: options.relayThrough
        ? Buffer.from(options.relayThrough, 'hex')
        : null,
    })
    engine.on('download:status', event =>
      send({ event: 'status', status: event.status })
    )
    await engine.start()
  },
  async publish({ contentBase64, name }) {
    const { cid, link } = await engine.publishFile(
      Buffer.from(contentBase64, 'base64'),
      name
    )
    return { cid, link }
  },
  async download({ link, timeout }) {
    await engine.downloadFile(link, null, { timeout })
  },
  seedStatus({ cid }) {
    return engine.listHoldings().find(h => h.cid === cid)?.seedStatus || null
  },
  holding({ cid }) {
    return engine.listHoldings().find(h => h.cid === cid) || null
  },
  async sha256({ cid }) {
    const { buffer } = await engine.readFileRaw(cid)
    return createHash('sha256').update(buffer).digest('hex')
  },
  network() {
    return engine.getNetworkStatus()
  },
  async stop() {
    await engine?.stop()
    await testnet?.destroy()
    setImmediate(() => process.exit(0))
  },
}

// stdout carries the protocol. Engine logs go to stderr with
// MOST_WORKER_LOG=1 and are dropped otherwise.
const toStderr = (...items) => process.stderr.write(`${items.join(' ')}\n`)
console.log =
  console.warn =
  console.info =
    process.env.MOST_WORKER_LOG ? toStderr : () => {}

// Requests run concurrently, so status calls answer during a download.
readline.createInterface({ input: process.stdin }).on('line', async line => {
  const { id, method, params } = JSON.parse(line)
  try {
    send({ id, result: (await methods[method](params)) ?? null })
  } catch (err) {
    send({ id, error: err.message.split('\n')[0] })
  }
})
