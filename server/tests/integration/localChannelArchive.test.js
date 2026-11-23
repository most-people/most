import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Corestore from 'corestore'
import { GLOBAL_SHARED_SEED_STRING } from '../../src/config.js'
import { MostBoxEngine } from '../../src/index.js'

describe('local unsigned channel archive', () => {
  it('keeps unsigned text only for old members after upgrade and restart', async t => {
    const dataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'most-old-chat-'))
    const store = new Corestore(dataPath, {
      primaryKey: Buffer.alloc(32).fill(GLOBAL_SHARED_SEED_STRING),
      unsafe: true,
    })
    const name = 'archive-room'
    const oldAddress = '0x' + '1'.repeat(40),
      stranger = '0x' + '3'.repeat(40)
    const core = store
      .namespace('channel-' + name)
      .get({ name: 'v1-writer', valueEncoding: 'json' })
    await core.append({
      type: 'message',
      author: oldAddress,
      authorName: 'Alice',
      timestamp: 123,
      content: 'old text',
      attachment: { link: 'ignored' },
    })
    const key = core.key.toString('hex')
    await store.close()
    fs.writeFileSync(
      path.join(dataPath, 'channels.json'),
      JSON.stringify([
        {
          channelId: name,
          channelKey: name,
          localWriterCoreKey: key,
          writerCoreKeys: [key],
          members: [{ address: oldAddress }],
        },
      ])
    )
    let engine = new MostBoxEngine({ dataPath, disableNetwork: true })
    t.after(async () => {
      await engine.stop()
      fs.rmSync(dataPath, { recursive: true, force: true })
    })
    await engine.start()
    await engine.createChannel(name, 'group', { ownerAddress: stranger })
    await engine.stop()
    engine = new MostBoxEngine({ dataPath, disableNetwork: true })
    await engine.start()
    const history = async ownerAddress =>
      (await engine.getChannelHistory(name, { ownerAddress })).messages
    const [message] = (await history(oldAddress)).filter(
      m => m.type === 'legacy'
    )
    assert.equal(message.content, 'old text')
    assert.ok(!JSON.stringify(message).includes(key))
    assert.equal(message.author, 'legacy')
    assert.equal(message.attachment, undefined)
    assert.ok(!(await history(stranger)).some(m => m.content === 'old text'))
    assert.ok(
      !engine
        .listChannels({ ownerAddress: oldAddress })[0]
        .writerCoreKeys.includes(key)
    )
  })
  it('clears lastMessageAt of upgraded channels with no readable messages', async t => {
    const dataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'most-old-empty-'))
    const store = new Corestore(dataPath, {
      primaryKey: Buffer.alloc(32).fill(GLOBAL_SHARED_SEED_STRING),
      unsafe: true,
    })
    const owner = '0x' + '1'.repeat(40)
    const core = store
      .namespace('channel-kept-room')
      .get({ name: 'v1-writer', valueEncoding: 'json' })
    await core.append({
      type: 'message',
      author: owner,
      timestamp: 123,
      content: 'old text',
    })
    const key = core.key.toString('hex')
    await store.close()
    const lastMessageAt = '2026-07-07T11:30:47.374Z'
    fs.writeFileSync(
      path.join(dataPath, 'channels.json'),
      JSON.stringify([
        {
          channelId: 'kept-room',
          channelKey: 'kept-room',
          localWriterCoreKey: key,
          writerCoreKeys: [key],
          lastMessageAt,
          members: [{ address: owner }],
        },
        {
          channelId: 'empty-room',
          channelKey: 'empty-room',
          // A v1 writer whose blocks never reached this node.
          localWriterCoreKey: 'a'.repeat(64),
          writerCoreKeys: ['a'.repeat(64)],
          lastMessageAt,
          members: [{ address: owner }],
        },
      ])
    )
    let engine = new MostBoxEngine({ dataPath, disableNetwork: true })
    t.after(async () => {
      await engine.stop()
      fs.rmSync(dataPath, { recursive: true, force: true })
    })
    const lastMessageAtById = () =>
      Object.fromEntries(
        engine
          .listChannels({ ownerAddress: owner })
          .map(channel => [channel.channelId, channel.lastMessageAt])
      )
    await engine.start()
    assert.deepEqual(lastMessageAtById(), {
      'kept-room': lastMessageAt,
      'empty-room': '',
    })
    await engine.stop()
    engine = new MostBoxEngine({ dataPath, disableNetwork: true })
    await engine.start()
    assert.deepEqual(lastMessageAtById(), {
      'kept-room': lastMessageAt,
      'empty-room': '',
    })
  })
})
