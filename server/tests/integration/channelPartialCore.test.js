import { it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import b4a from 'b4a'
import { MostBoxEngine } from '../../src/index.js'
import { GLOBAL_SHARED_SEED_STRING } from '../../src/config.js'

const Corestore = createRequire(import.meta.url)('corestore')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// A member's copy of another writer's core can miss blocks (replication cut
// off, writer gone). Reading history must not wait for those blocks: before
// the fix, restarting such a node hung forever while its peers were offline.
// When the writer is back, the missing block must be fetched again.
it('starts, reads and sends with a remote block missing, then refetches it', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'most-partial-core-'))
  const engines = []
  t.after(async () => {
    await Promise.allSettled(engines.map(engine => engine.stop()))
    fs.rmSync(directory, { recursive: true, force: true })
  })
  const start = async name => {
    const engine = new MostBoxEngine({
      dataPath: path.join(directory, name),
      disableNetwork: true,
    })
    await engine.start()
    engines.push(engine)
    return engine
  }
  const contents = async engine =>
    (await engine.getChannelMessages('partial-room', { limit: 1000 })).map(
      message => message.content
    )

  const writer = await start('writer')
  let reader = await start('reader')
  const channel = await writer.createChannel('partial-room', 'public')
  await reader.createChannel('partial-room', 'public')
  let link = writer.replicateWith(reader)
  for (const text of ['one', 'two', 'three']) {
    await writer.sendMessage('partial-room', text)
  }
  while (!(await contents(reader)).includes('three')) await sleep(25)
  link.close()
  await sleep(100)
  await reader.stop()
  engines.splice(engines.indexOf(reader), 1)

  // Drop one of the writer's blocks from the reader's storage.
  const store = new Corestore(path.join(directory, 'reader'), {
    primaryKey: b4a.alloc(32).fill(GLOBAL_SHARED_SEED_STRING),
    unsafe: true,
  })
  const core = store
    .namespace(`channel-${channel.channelKey}`)
    .get({ key: b4a.from(channel.localWriterCoreKey, 'hex') })
  await core.ready()
  const cleared = core.length - 2
  await core.clear(cleared)
  assert.equal(await core.has(cleared), false)
  await store.close()

  reader = await Promise.race([
    start('reader'),
    sleep(10000).then(() => {
      throw new Error('reader did not start with a block missing')
    }),
  ])
  const partial = await contents(reader)
  assert.ok(partial.length > 0)
  assert.ok(!partial.includes('three'))
  await reader.sendMessage('partial-room', 'while the writer is away')

  link = writer.replicateWith(reader)
  t.after(() => link.close())
  const deadline = Date.now() + 10000
  while (!(await contents(reader)).includes('three')) {
    assert.ok(Date.now() < deadline, 'missing block was not fetched again')
    await sleep(25)
  }
  assert.ok(
    (await contents(writer)).includes('while the writer is away'),
    'writer receives the message sent while it was away'
  )
})
