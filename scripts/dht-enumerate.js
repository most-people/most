// Privacy measurement: what someone who only knows a most:// link learns
// about its seeders from the public DHT. Step 1 looks the CID topic up and
// lists the announce records (seeder public key + the DHT nodes relaying for
// it). Step 2 connects to each public key, as any downloader would, and
// records the remote address of the established connection. That address is
// the seeder's public IP unless the connection went through a relay. The
// enumerator's own IP is visible to every seeder it connects to.
//
//   node scripts/dht-enumerate.js 'most://<cid>?filename=x' [--no-relay]
import { createRequire } from 'node:module'
import { getCidInfo } from '../server/src/core/cidTopic.js'
import { parseMostLink } from '../server/src/core/cid.js'
import { DEFAULT_RELAY_PUBLIC_KEY } from '../server/src/config.js'

const swarmRequire = createRequire(
  createRequire(import.meta.url).resolve('hyperswarm')
)
const DHT = swarmRequire('hyperdht')
const b4a = swarmRequire('b4a')

const link = process.argv[2]
const noRelay = process.argv.includes('--no-relay')
const cid = link.startsWith('most://') ? parseMostLink(link).cid : link
const { topic } = getCidInfo(cid)
const dht = new DHT()
await dht.ready()
const self = dht.remoteAddress()
const log = event => console.log(JSON.stringify({ t: Date.now(), ...event }))
log({ type: 'meta', cid, self, firewalled: dht.firewalled })

const records = new Map()
for await (const data of dht.lookup(topic)) {
  for (const peer of data.peers) {
    const key = b4a.toString(peer.publicKey, 'hex')
    if (records.has(key)) continue
    records.set(key, peer)
    log({
      type: 'record',
      publicKey: key,
      relayAddresses: peer.relayAddresses.map(a => `${a.host}:${a.port}`),
      from: `${data.from.host}:${data.from.port}`,
    })
  }
}

await Promise.all(
  [...records].map(async ([key, peer]) => {
    const started = Date.now()
    const socket = dht.connect(peer.publicKey, {
      relayAddresses: peer.relayAddresses,
      relayThrough: noRelay ? null : b4a.from(DEFAULT_RELAY_PUBLIC_KEY, 'hex'),
    })
    socket.on('error', () => {})
    const opened = await new Promise(resolve => {
      const timer = setTimeout(() => resolve(false), 30000)
      socket.once('open', () => resolve(clearTimeout(timer) || true))
      socket.once('close', () => resolve(clearTimeout(timer) || false))
    })
    log({
      type: 'connect',
      publicKey: key,
      ok: opened,
      ms: Date.now() - started,
      remote: opened
        ? `${socket.rawStream.remoteHost}:${socket.rawStream.remotePort}`
        : null,
    })
    socket.destroy()
  })
)
log({ type: 'summary', records: records.size })
await dht.destroy()
