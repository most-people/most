import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createUniqueKnowledgeFilePath } from './knowledgeModel'
import { createKnowledgeRepository } from './knowledgeRepository'
import type { KnowledgeFileInfo, KnowledgeStorageAdapter } from './types'

type Entry =
  | { kind: 'directory'; mtimeMs: number }
  | { kind: 'file'; content: string; mtimeMs: number }

class MemoryKnowledgeStorage implements KnowledgeStorageAdapter {
  entries = new Map<string, Entry>()
  failMoveFrom = ''
  clock = 1

  normalize(path: string) {
    return path.replace(/^\/+|\/+$/g, '')
  }

  parent(path: string) {
    const value = this.normalize(path)
    const index = value.lastIndexOf('/')
    return index === -1 ? '' : value.slice(0, index)
  }

  async getInfo(path: string): Promise<KnowledgeFileInfo> {
    const entry = this.entries.get(this.normalize(path))
    return {
      exists: !!entry,
      isDirectory: entry?.kind === 'directory',
      size:
        entry?.kind === 'file'
          ? new TextEncoder().encode(entry.content).byteLength
          : 0,
      mtimeMs: entry?.mtimeMs || 0,
    }
  }

  async list(path: string) {
    const directory = this.normalize(path)
    const prefix = directory ? `${directory}/` : ''
    const names = new Set<string>()
    for (const key of this.entries.keys()) {
      if (!key.startsWith(prefix) || key === directory) continue
      const relative = key.slice(prefix.length)
      names.add(relative.split('/')[0])
    }
    return [...names]
  }

  async read(path: string) {
    const entry = this.entries.get(this.normalize(path))
    if (entry?.kind !== 'file') throw new Error('file not found')
    return entry.content
  }

  async write(path: string, content: string) {
    const target = this.normalize(path)
    const parent = this.parent(target)
    if (parent && this.entries.get(parent)?.kind !== 'directory') {
      throw new Error('parent not found')
    }
    this.entries.set(target, {
      kind: 'file',
      content,
      mtimeMs: this.clock++,
    })
  }

  async mkdir(path: string) {
    const target = this.normalize(path)
    const parts = target.split('/').filter(Boolean)
    for (let index = 1; index <= parts.length; index += 1) {
      const current = parts.slice(0, index).join('/')
      if (!this.entries.has(current)) {
        this.entries.set(current, {
          kind: 'directory',
          mtimeMs: this.clock++,
        })
      }
    }
  }

  async move(from: string, to: string) {
    const source = this.normalize(from)
    const target = this.normalize(to)
    if (source === this.failMoveFrom) throw new Error('injected move failure')
    const sourceEntries = [...this.entries.entries()].filter(
      ([key]) => key === source || key.startsWith(`${source}/`)
    )
    if (!sourceEntries.length) throw new Error('source not found')
    if (this.entries.has(target)) throw new Error('target exists')
    for (const [key, entry] of sourceEntries) {
      this.entries.set(target + key.slice(source.length), entry)
      this.entries.delete(key)
    }
  }

  async remove(path: string) {
    const target = this.normalize(path)
    for (const key of [...this.entries.keys()]) {
      if (key === target || key.startsWith(`${target}/`)) {
        this.entries.delete(key)
      }
    }
  }
}

describe('mobile knowledge repository', () => {
  it('creates, reads, persists, moves, and deletes notes', async () => {
    const storage = new MemoryKnowledgeStorage()
    const repository = createKnowledgeRepository(storage)

    await repository.create('项目/说明.md', '# 初稿')
    await assert.rejects(() => repository.create('项目/说明.md', '重复'))
    await repository.write('项目/说明.md', '# 完成')
    await repository.move('项目/说明.md', '归档/说明.md')

    const restarted = createKnowledgeRepository(storage)
    assert.equal((await restarted.read('归档/说明.md')).content, '# 完成')
    assert.deepEqual(
      (await restarted.list()).map(item => item.path),
      ['归档/说明.md']
    )

    await restarted.delete('归档/说明.md')
    assert.deepEqual(await restarted.list(), [])
    assert.equal(
      (await storage.getInfo('mostbox-knowledge/归档')).exists,
      false
    )
  })

  it('imports a single note and keeps a conflicting copy across restarts', async () => {
    const storage = new MemoryKnowledgeStorage()
    const repository = createKnowledgeRepository(storage)
    await repository.create('导入/说明.md', 'original')
    const importPath = createUniqueKnowledgeFilePath(
      (await repository.list()).map(note => note.path),
      '导入/说明.md'
    )
    await repository.create(importPath, 'imported')

    const restarted = createKnowledgeRepository(storage)
    assert.equal((await restarted.read('导入/说明.md')).content, 'original')
    assert.equal((await restarted.read('导入/说明 (1).md')).content, 'imported')
  })

  it('keeps note paths unique regardless of letter casing', async () => {
    const storage = new MemoryKnowledgeStorage()
    const repository = createKnowledgeRepository(storage)
    await repository.create('A.md', 'original')

    await assert.rejects(() => repository.create('a.md', 'duplicate'))
    const overwritten = await repository.write('a.md', 'updated')
    assert.equal(overwritten.path, 'A.md')
    assert.equal(overwritten.content, 'updated')

    const renamed = await repository.move('A.md', 'a.md')
    assert.equal(renamed.path, 'a.md')
    assert.deepEqual(
      (await repository.list()).map(note => note.path),
      ['a.md']
    )

    const snapshot = await repository.exportSnapshot()
    await repository.restoreSnapshot(snapshot)
    assert.equal((await repository.read('a.md')).content, 'updated')
  })

  it('moves and deletes inferred directories without collisions', async () => {
    const storage = new MemoryKnowledgeStorage()
    const repository = createKnowledgeRepository(storage)
    await repository.create('项目/a.md', 'a')
    await repository.create('项目/子目录/b.md', 'b')
    await repository.moveDirectory('项目', '归档/项目')
    assert.deepEqual((await repository.list()).map(item => item.path).sort(), [
      '归档/项目/a.md',
      '归档/项目/子目录/b.md',
    ])
    await repository.deleteDirectory('归档/项目')
    assert.deepEqual(await repository.list(), [])
  })

  it('exports and replaces the complete vault from a snapshot', async () => {
    const storage = new MemoryKnowledgeStorage()
    const repository = createKnowledgeRepository(storage)
    await repository.create('old.md', 'old')

    await repository.restoreSnapshot({
      format: 'mostbox-knowledge',
      version: 1,
      exportedAt: '2026-08-08T00:00:00.000Z',
      files: [
        { path: 'new.md', content: 'new', size: 3, mtimeMs: 1 },
        { path: '目录/资料.md', content: '资料', size: 6, mtimeMs: 2 },
      ],
    })

    const snapshot = await repository.exportSnapshot()
    assert.deepEqual(
      snapshot.files.map(item => item.path),
      ['new.md', '目录/资料.md']
    )
    await assert.rejects(() => repository.read('old.md'))
  })

  it('rolls back when the staged vault cannot replace the active vault', async () => {
    const storage = new MemoryKnowledgeStorage()
    const repository = createKnowledgeRepository(storage)
    await repository.create('safe.md', 'keep me')
    const originalMove = storage.move.bind(storage)
    storage.move = async (from, to) => {
      if (from.includes('.import-')) throw new Error('injected move failure')
      await originalMove(from, to)
    }

    await assert.rejects(() =>
      repository.restoreSnapshot({
        format: 'mostbox-knowledge',
        version: 1,
        exportedAt: '2026-08-08T00:00:00.000Z',
        files: [{ path: 'lost.md', content: 'no', size: 2, mtimeMs: 1 }],
      })
    )
    assert.equal((await repository.read('safe.md')).content, 'keep me')
    await assert.rejects(() => repository.read('lost.md'))
  })

  it('rolls back when the activated vault cannot be verified', async () => {
    const storage = new MemoryKnowledgeStorage()
    const repository = createKnowledgeRepository(storage)
    await repository.create('safe.md', 'keep me')
    const originalMove = storage.move.bind(storage)
    const originalRead = storage.read.bind(storage)
    let failActivatedRead = false
    storage.move = async (from, to) => {
      await originalMove(from, to)
      if (from.includes('.import-')) failActivatedRead = true
    }
    storage.read = async path => {
      if (failActivatedRead && path.endsWith('/replacement.md')) {
        failActivatedRead = false
        throw new Error('injected post-activation read failure')
      }
      return originalRead(path)
    }

    await assert.rejects(() =>
      repository.restoreSnapshot({
        format: 'mostbox-knowledge',
        version: 1,
        exportedAt: '2026-08-08T00:00:00.000Z',
        files: [
          { path: 'replacement.md', content: 'new', size: 3, mtimeMs: 1 },
        ],
      })
    )
    assert.equal((await repository.read('safe.md')).content, 'keep me')
    await assert.rejects(() => repository.read('replacement.md'))
  })
})
