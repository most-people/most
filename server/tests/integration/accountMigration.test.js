import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { MostBoxEngine } from '../../src/index.js'
import { mostWallet } from '../../src/utils/mostWallet.js'
import {
  chatAccountFromSeed,
  deriveChatSeed,
  signAccountMigration,
} from '../../src/utils/chatIdentity.js'
import { verifyAccountMigration } from '../../src/utils/auth.js'

// docs/protocol/v2/signatures.md §7.4: a v1 account hands its node data to
// its v2 chat identity, approved by a signature of the v1 account.
describe('v1 to v2 account migration', () => {
  it('accepts only the v1 account approving its own v2 address', async () => {
    const v1 = mostWallet('alice', 'correct horse battery staple')
    const other = mostWallet('mallory', 'correct horse battery staple')
    const v2Address = chatAccountFromSeed(
      await deriveChatSeed('alice', 'correct horse battery staple')
    ).address
    const signature = await signAccountMigration(v1.danger, v2Address)

    assert.equal(
      verifyAccountMigration({
        oldAddress: v1.address,
        newAddress: v2Address,
        signature,
      }),
      true
    )
    // The approval names one target; it cannot be reused for another.
    assert.equal(
      verifyAccountMigration({
        oldAddress: v1.address,
        newAddress: other.address,
        signature,
      }),
      false
    )
    // Someone else cannot claim to be the v1 account.
    assert.equal(
      verifyAccountMigration({
        oldAddress: v1.address,
        newAddress: v2Address,
        signature: await signAccountMigration(other.danger, v2Address),
      }),
      false
    )
    assert.equal(
      verifyAccountMigration({
        oldAddress: v1.address,
        newAddress: v1.address,
        signature,
      }),
      false
    )
  })

  it('moves profile, files and channels to the new address', async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'most-migrate-'))
    const engine = new MostBoxEngine({
      dataPath: directory,
      disableNetwork: true,
    })
    t.after(async () => {
      await engine.stop()
      fs.rmSync(directory, { recursive: true, force: true })
    })
    await engine.start()

    const oldAddress = `0x${'1'.repeat(40)}`
    const newAddress = `0x${'2'.repeat(40)}`
    engine.saveUserProfile(oldAddress, { displayName: 'Alice' })
    const { cid } = await engine.publishFile(
      Buffer.from('migrated file'),
      'notes.txt',
      { ownerAddress: oldAddress }
    )
    await engine.createChannel('migrate-room', 'group', {
      ownerAddress: oldAddress,
      remark: 'Team',
    })

    assert.equal(
      await engine.migrateUserData(newAddress, `0x${'3'.repeat(40)}`),
      null
    )
    const result = await engine.migrateUserData(oldAddress, newAddress)
    assert.ok(result)

    assert.equal(engine.getUserProfile(newAddress).displayName, 'Alice')
    assert.equal(engine.getUserProfile(oldAddress), null)
    const moved = engine.exportUserData(newAddress)
    assert.deepEqual(
      moved.files.map(file => file.cid),
      [cid]
    )
    assert.deepEqual(
      moved.channels.map(channel => channel.channelId),
      ['migrate-room']
    )
    const left = engine.exportUserData(oldAddress)
    assert.equal(left.files.length, 0)
    assert.equal(left.channels.length, 0)
  })
})
