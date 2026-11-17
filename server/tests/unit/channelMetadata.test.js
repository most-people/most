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
import {
  channelIdFromKey,
  encodeChannelCredential,
  resolveChannelHandle,
} from '../../src/core/channelKeysV2.js'

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

  it('migrates v1 records to v2 channel keys and drops invalid records', () => {
    withTempDir(directory => {
      const team = resolveChannelHandle('team-room')
      const legacyId = 'aaisem2ekvthpcezvk54zxpo74'
      const legacy = resolveChannelHandle(legacyId)
      const v2Key = Buffer.alloc(32, 7)
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
            channelId: legacyId,
            channelKey: legacyId,
            writerId: 'writer',
            localWriterCoreKey: 'old-core',
          },
          {
            channelId: encodeChannelCredential(v2Key),
            channelKey: channelIdFromKey(v2Key),
            secretKey: v2Key.toString('hex'),
            kind: 'private',
            writerGeneration: 2,
            localWriterCoreKey: 'v2-core',
            writerCoreKeys: ['v2-core'],
          },
          {
            channelId: 'mismatch',
            channelKey: 'f'.repeat(64),
            secretKey: v2Key.toString('hex'),
          },
          { channelId: 'has.dot', channelKey: 'has.dot' },
          null,
        ])
      )

      assert.deepEqual(loadChannelsMetadata(directory), [
        {
          channelId: 'team-room',
          channelKey: team.channelKey,
          name: 'team-room',
          secretKey: team.key.toString('hex'),
          kind: 'public',
          writerGeneration: 0,
          localWriterCoreKey: '',
          writerCoreKeys: ['remote-core', 'local-core'],
        },
        {
          channelId: legacyId,
          channelKey: legacy.channelKey,
          name: legacyId,
          secretKey: legacy.key.toString('hex'),
          kind: 'legacy',
          writerGeneration: 0,
          localWriterCoreKey: '',
          writerCoreKeys: ['old-core'],
        },
        {
          channelId: encodeChannelCredential(v2Key),
          channelKey: channelIdFromKey(v2Key),
          name: encodeChannelCredential(v2Key),
          secretKey: v2Key.toString('hex'),
          kind: 'private',
          writerGeneration: 2,
          localWriterCoreKey: 'v2-core',
          writerCoreKeys: ['v2-core'],
        },
      ])
    })
  })

  it('merges duplicate records of the same channel key', () => {
    withTempDir(directory => {
      const support = resolveChannelHandle('support-room')
      fs.writeFileSync(
        getChannelsMetadataPath(directory),
        JSON.stringify([
          {
            channelId: 'support-room',
            channelKey: 'support-room',
            writerId: 'writer-a',
            localWriterCoreKey: 'core-a',
            writerCoreKeys: ['core-a'],
            createdAt: '2026-10-07T05:41:14.636Z',
            lastMessageAt: '2026-10-07T05:41:35.791Z',
            members: [
              {
                address: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
                displayName: 'Owner',
              },
            ],
            remarks: {
              '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa': 'UID:46116',
            },
          },
          {
            channelId: 'support-room',
            channelKey: 'support-room',
            writerId: 'writer-b',
            localWriterCoreKey: 'core-b',
            writerCoreKeys: ['core-b', 'core-c'],
            createdAt: '2026-10-07T05:41:14.825Z',
            lastMessageAt: '',
            members: [
              {
                address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                displayName: 'Duplicate',
              },
              {
                address: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
                displayName: 'Agent',
              },
            ],
            remarks: {
              '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa': 'other',
              '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb': 'Agent remark',
            },
            pinnedBy: { '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb': true },
          },
        ])
      )

      assert.deepEqual(loadChannelsMetadata(directory), [
        {
          channelId: 'support-room',
          channelKey: support.channelKey,
          name: 'support-room',
          secretKey: support.key.toString('hex'),
          kind: 'public',
          writerGeneration: 0,
          localWriterCoreKey: '',
          writerCoreKeys: ['core-a', 'core-b', 'core-c'],
          createdAt: '2026-10-07T05:41:14.636Z',
          lastMessageAt: '2026-10-07T05:41:35.791Z',
          members: [
            {
              address: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
              displayName: 'Owner',
            },
            {
              address: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
              displayName: 'Agent',
            },
          ],
          remarks: {
            '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa': 'UID:46116',
            '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb': 'Agent remark',
          },
          pinnedBy: { '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb': true },
        },
      ])
    })
  })

  it('serializes only the stable channel fields', () => {
    const serialized = serializeChannelsMetadata([
      {
        channelId: 'team-room',
        channelKey: 'a'.repeat(64),
        secretKey: 'b'.repeat(64),
        kind: 'public',
        type: 'group',
        createdAt: '2026-08-31T00:00:00.000Z',
        writerGeneration: 1,
        localWriterCoreKey: 'local-core',
        writerCoreKeys: ['remote-core', 'remote-core'],
        members: 'invalid',
        runtimeOnly: true,
      },
    ])

    assert.deepEqual(JSON.parse(serialized), [
      {
        channelId: 'team-room',
        channelKey: 'a'.repeat(64),
        name: 'team-room',
        secretKey: 'b'.repeat(64),
        kind: 'public',
        type: 'group',
        createdAt: '2026-08-31T00:00:00.000Z',
        lastMessageAt: '',
        writerGeneration: 1,
        localWriterCoreKey: 'local-core',
        writerCoreKeys: ['remote-core'],
        members: [],
      },
    ])
  })
})
