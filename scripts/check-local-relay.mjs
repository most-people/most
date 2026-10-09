import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'

const require = createRequire(import.meta.url)
const swarmRequire = createRequire(require.resolve('hyperswarm'))
const dhtRequire = createRequire(swarmRequire.resolve('hyperdht'))
const createTestnet = swarmRequire('hyperdht/testnet')
const { Server: BlindRelayServer } = dhtRequire('blind-relay')

// An isolated loopback experiment, not a public relay or a NAT acceptance test.
const network = await createTestnet(3)
const sockets = []
let relay
const timer = setTimeout(() => {
  console.error('Local relay check timed out')
  process.exit(1)
}, 45000)

try {
  const relayNode = network.createNode({ firewalled: false })
  const relayStreams = []
  relay = new BlindRelayServer({
    createStream: options => {
      const stream = relayNode.createRawStream(options)
      relayStreams.push(stream)
      return stream
    },
  })
  let sessions = 0
  const relayServer = relayNode.createServer(socket => {
    sockets.push(socket)
    socket.on('error', () => {})
    sessions += 1
    relay.accept(socket, { id: socket.remotePublicKey }).on('error', () => {})
  })
  await relayServer.listen()

  const sender = network.createNode({ firewalled: true })
  const receiver = network.createNode({ firewalled: true })
  const server = receiver.createServer({
    holepunch: false,
    shareLocalAddress: false,
    relayThrough: relayServer.publicKey,
  })
  await server.listen()
  const accepted = once(server, 'connection')
  const outgoing = sender.connect(server.publicKey, {
    localConnection: false,
    holepunch: () => false,
    relayThrough: relayServer.publicKey,
  })
  sockets.push(outgoing)
  outgoing.on('error', () => {})
  const connected = once(outgoing, 'open')
  const [incoming] = await accepted
  sockets.push(incoming)
  incoming.on('error', () => {})
  await connected

  const payload = Buffer.alloc(1024 * 1024, 0x5a)
  const hash = createHash('sha256')
  let receivedBytes = 0
  const finished = once(incoming, 'end')
  incoming.on('data', chunk => {
    receivedBytes += chunk.length
    hash.update(chunk)
  })
  outgoing.end(payload)
  await finished
  const digest = hash.digest('hex')
  assert.equal(receivedBytes, payload.length)
  assert.equal(digest, createHash('sha256').update(payload).digest('hex'))
  assert.ok(sessions >= 2, 'Both endpoints must establish relay sessions')
  assert.ok(
    receiver.stats.relaying.successes > 0,
    'Receiver must pair through relay'
  )
  const relayReceivedBytes = relayStreams.reduce(
    (sum, stream) => sum + stream.bytesReceived,
    0
  )
  assert.ok(
    relayReceivedBytes >= payload.length,
    'Relay must carry the payload bytes'
  )
  console.log(
    JSON.stringify(
      {
        status: 'passed',
        scope: 'loopback HyperDHT blind-relay, direct punching disabled',
        receivedBytes,
        sha256: digest,
        relaySessions: sessions,
        relayReceivedBytes,
        receiverRelaying: receiver.stats.relaying,
      },
      null,
      2
    )
  )
} finally {
  clearTimeout(timer)
  for (const socket of sockets) socket.destroy()
  if (relay) await relay.close()
  await network.destroy()
}
