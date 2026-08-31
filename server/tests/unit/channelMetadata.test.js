import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'

import {
  getChannelConfigPath,
  getChannelsMetadataPath,
  loadChannelConfig,
  loadChannelsMetadata,
  serializeChannelsMetadata,
} from '../../src/node/channelMetadata.js'

function withTempDir(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'most-channels-'))
  try {
    return run(directory)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
}

describe('channel metadata', () => {
  it('uses stable metadata paths and empty fallbacks', () => {
    withTempDir(directory => {
      assert.equal(
        getChannelsMetadataPath(directory),
        path.join(directory, 'channels.json')
      )
      assert.equal(
        getChannelConfigPath(directory),
        path.join(directory, 'channel-config.json')
      )
      assert.deepEqual(loadChannelsMetadata(directory), [])
      assert.deepEqual(loadChannelConfig(directory), {})
    })
  })

  it('normalizes valid channels and drops invalid persisted records', () => {
    withTempDir(directory => {
      fs.writeFileSync(
        getChannelsMetadataPath(directory),
        JSON.stringify([
          {
            channelId: ' Team-Room ',
            channelKey: 'team-room',
            writerId: 'writer',
            localWriterCoreKey: 'local-core',
            writerCoreKeys: [' remote-core ', 'remote-core', ''],
          },
          {
            channelId: 'wrong-key',
            channelKey: 'other',
            writerId: 'writer',
            localWriterCoreKey: 'local-core',
          },
          null,
        ])
      )

      assert.deepEqual(loadChannelsMetadata(directory), [
        {
          channelId: 'team-room',
          channelKey: 'team-room',
          name: 'team-room',
          writerId: 'writer',
          localWriterCoreKey: 'local-core',
          writerCoreKeys: ['remote-core'],
        },
      ])
    })
  })

  it('serializes only the stable channel fields', () => {
    const serialized = serializeChannelsMetadata([
      {
        channelId: 'team-room',
        channelKey: 'team-room',
        type: 'group',
        createdAt: '2026-08-31T00:00:00.000Z',
        writerId: 'writer',
        localWriterCoreKey: 'local-core',
        writerCoreKeys: ['remote-core', 'remote-core'],
        members: 'invalid',
        runtimeOnly: true,
      },
    ])

    assert.deepEqual(JSON.parse(serialized), [
      {
        channelId: 'team-room',
        channelKey: 'team-room',
        name: 'team-room',
        type: 'group',
        createdAt: '2026-08-31T00:00:00.000Z',
        lastMessageAt: '',
        writerId: 'writer',
        localWriterCoreKey: 'local-core',
        writerCoreKeys: ['remote-core'],
        members: [],
      },
    ])
  })
})
