// Reproduces the engine-stop crash (docs/validation-status.md "2026-11-16
// 聊天不变量"): a channel block verified after the store closed reaches
// Core.onappend -> Replicator._resolveBlocksLocally, which before hypercore
// 11.39.3 read the closed RocksDB session and raised an uncaught
// "RocksDB session is closed". The race is narrow; --widen delays every
// onappend by 20ms so it shows up within tens of rounds. Prints the number of
// uncaught errors; exit code 1 when there were any.
//
//   node scripts/engine-stop-race.js --rounds 400 --widen
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { MostBoxEngine } from '../server/src/index.js'
import { signedMessage } from '../server/tests/helpers/signedMessage.js'

const argv = process.argv.slice(2)
const rounds = Number(argv[argv.indexOf('--rounds') + 1]) || 100
const widen = argv.includes('--widen')
const require = createRequire(import.meta.url)
const hypercore = require('hypercore/package.json').version

if (widen) {
  const Core = require(
    path.join(path.dirname(require.resolve('hypercore')), 'lib', 'core.js')
  )
  const onappend = Core.prototype.onappend
  Core.prototype.onappend = function (...args) {
    setTimeout(() => onappend.apply(this, args), 20)
  }
}

const errors = []
const record = err => errors.push(err?.message || String(err))
process.on('uncaughtException', record)
process.on('unhandledRejection', record)

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'most-stop-race-'))
const make = async name => {
  const engine = new MostBoxEngine({
    dataPath: path.join(dir, name),
    disableNetwork: true,
  })
  await engine.start()
  await engine.createChannel('stop-race', 'public')
  return engine
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const writer = await make('writer')
const channelId = writer.resolveChannelKey('stop-race')
let writing = true
const writes = (async () => {
  for (let i = 0; writing; i++) {
    await writer
      .sendMessage('stop-race', await signedMessage(channelId, `m${i}`))
      .catch(() => {})
  }
})()
for (let round = 0; round < rounds; round++) {
  const reader = await make(`reader-${round}`)
  const link = writer.replicateWith(reader)
  await sleep(5 + ((round * 7) % 41))
  link.close()
  await reader.stop()
  await sleep(20)
  fs.rmSync(path.join(dir, `reader-${round}`), { recursive: true, force: true })
}
writing = false
await writes
await writer.stop()
fs.rmSync(dir, { recursive: true, force: true })
console.log(
  JSON.stringify({
    hypercore,
    rounds,
    widen,
    uncaught: errors.length,
    messages: [...new Set(errors)],
  })
)
process.exit(errors.length ? 1 : 0)
