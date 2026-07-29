import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { MostBoxEngine } from '../../src/index.js'

describe('transient game channels', () => {
  it('does not persist or export game channel membership', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'most-game-channel-'))
    const dataPath = path.join(tmpDir, 'data')
    const ownerAddress = '0x1234567890abcdef1234567890abcdef12345678'
    const engine = new MostBoxEngine({ dataPath, disableNetwork: true })

    try {
      await engine.start()
      await engine.createChannel('game.gandengyan.abc123', 'game', {
        ownerAddress,
        displayName: 'Player',
      })

      const saved = JSON.parse(
        fs.readFileSync(path.join(dataPath, 'channels.json'), 'utf8')
      )
      assert.ok(!saved.some(channel => channel.type === 'game'))
      assert.deepStrictEqual(engine.exportUserData(ownerAddress).channels, [])
    } finally {
      await engine.stop().catch(() => {})
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
