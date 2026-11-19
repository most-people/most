// HyperDHT blind relay for peers that cannot holepunch (both behind
// randomizing NATs). It forwards encrypted bytes it cannot read. The key pair
// comes from a persisted seed, so the public key printed on start stays the
// same across restarts; clients set it as relayThrough.
//
//   node scripts/blind-relay.js --seed-file /var/lib/most-relay/seed [--port 49740]
//   node scripts/blind-relay.js --seed-file seed --bootstrap '[{"host":"20.20.0.2","port":49737}]'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const swarmRequire = createRequire(require.resolve('hyperswarm'))
const dhtRequire = createRequire(swarmRequire.resolve('hyperdht'))
const DHT = swarmRequire('hyperdht')
const { Server: BlindRelayServer } = dhtRequire('blind-relay')

function args() {
  const out = {}
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i += 2) out[argv[i].slice(2)] = argv[i + 1]
  return out
}

function loadSeed(file) {
  if (fs.existsSync(file)) {
    return Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'hex')
  }
  const seed = crypto.randomBytes(32)
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true })
  fs.writeFileSync(file, seed.toString('hex'), { mode: 0o600 })
  return seed
}

const options = args()
if (!options['seed-file']) {
  console.error('--seed-file is required')
  process.exit(1)
}

const dht = new DHT({
  port: options.port ? Number(options.port) : undefined,
  host: options.host,
  bootstrap: options.bootstrap ? JSON.parse(options.bootstrap) : undefined,
  // --public true: the host is known to be reachable (test topologies).
  firewalled: options.public === 'true' ? false : undefined,
})
const relay = new BlindRelayServer({
  createStream: streamOptions => dht.createRawStream(streamOptions),
})
const stats = { sessions: 0, open: 0 }
const server = dht.createServer(socket => {
  stats.sessions += 1
  stats.open += 1
  socket.on('error', () => {})
  socket.on('close', () => {
    stats.open -= 1
  })
  relay.accept(socket, { id: socket.remotePublicKey }).on('error', () => {})
})
await server.listen(DHT.keyPair(loadSeed(options['seed-file'])))
console.log(
  JSON.stringify({ relayPublicKey: server.publicKey.toString('hex') })
)

setInterval(() => {
  console.log(
    JSON.stringify({
      time: new Date().toISOString(),
      ...stats,
      firewalled: dht.firewalled,
      address: dht.remoteAddress(),
    })
  )
}, 60000).unref()

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    await server.close()
    await relay.close()
    await dht.destroy()
    process.exit(0)
  })
}
