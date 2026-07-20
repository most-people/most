import { EventEmitter } from 'node:events'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createDownloadTaskRegistry } from '../../src/http/downloadTasks.js'

describe('download task registry', () => {
  it('tracks active task progress and isolates owners', () => {
    const engine = new EventEmitter()
    const registry = createDownloadTaskRegistry(engine)
    registry.register({
      taskId: 'download-1',
      ownerAddress: '0xAbC',
      cid: 'cid-1',
      fileName: 'large.bin',
    })

    engine.emit('download:status', {
      taskId: 'download-1',
      status: 'finding-peers',
    })
    engine.emit('download:progress', {
      taskId: 'download-1',
      loaded: 25,
      total: 100,
      percent: 25,
    })

    assert.deepStrictEqual(registry.list('0xdef'), [])
    assert.deepStrictEqual(registry.list('0xabc')[0], {
      taskId: 'download-1',
      cid: 'cid-1',
      fileName: 'large.bin',
      kind: 'file',
      status: 'downloading',
      progress: 25,
      loadedBytes: 25,
      totalBytes: 100,
      completedFiles: 0,
      totalFiles: 0,
      startedAt: registry.list('0xabc')[0].startedAt,
      updatedAt: registry.list('0xabc')[0].updatedAt,
    })
  })

  it('tracks collection counts and removes terminal tasks', () => {
    const engine = new EventEmitter()
    const registry = createDownloadTaskRegistry(engine)
    registry.register({
      taskId: 'download-2',
      ownerAddress: '0xabc',
      cid: 'cid-2',
      fileName: 'photos',
    })

    engine.emit('download:progress', {
      taskId: 'download-2',
      collection: true,
      completedFiles: 2,
      totalFiles: 5,
      percent: 40,
    })
    assert.deepStrictEqual(registry.list('0xabc')[0], {
      ...registry.list('0xabc')[0],
      kind: 'collection',
      completedFiles: 2,
      totalFiles: 5,
      progress: 40,
    })

    engine.emit('download:success', { taskId: 'download-2' })
    assert.deepStrictEqual(registry.list('0xabc'), [])
  })

  it('only marks an owned task as cancelling', () => {
    const engine = new EventEmitter()
    const registry = createDownloadTaskRegistry(engine)
    registry.register({
      taskId: 'download-3',
      ownerAddress: '0xabc',
      cid: 'cid-3',
      fileName: 'video.mp4',
    })

    assert.strictEqual(registry.markCancelling('download-3', '0xdef'), null)
    assert.strictEqual(
      registry.markCancelling('download-3', '0xabc')?.status,
      'cancelling'
    )
  })

  it('keeps non-visible tasks cancellable without listing them', () => {
    const engine = new EventEmitter()
    const registry = createDownloadTaskRegistry(engine)
    registry.register({
      taskId: 'download-hidden',
      ownerAddress: '0xabc',
      cid: 'cid-hidden',
      fileName: 'attachment.bin',
      visible: false,
    })

    assert.deepStrictEqual(registry.list('0xabc'), [])
    assert.strictEqual(
      registry.markCancelling('download-hidden', '0xabc')?.status,
      'cancelling'
    )
  })
})
