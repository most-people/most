import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { pipeline } from 'node:stream/promises'
import b4a from 'b4a'
import Corestore from 'corestore'
import Hyperdrive from 'hyperdrive'
import * as dagPb from '@ipld/dag-pb'
import { UnixFS } from 'ipfs-unixfs'
import { CID } from 'multiformats/cid'
import { sha256 } from 'multiformats/hashes/sha2'
import { MostBoxEngine } from '../index.js'
import { calculateCid } from '../core/cid.js'
import { getCidInfo } from '../core/cidTopic.js'
import { createChannelWriterId } from '../core/channelIdentity.js'
import { ensureStorageSchema } from './storageSchema.js'

const LEGACY_PRIMARY_KEY_TEXT = 'most-box-global-shared-seed-v1'
const LEGACY_BACKUP_SUFFIX = '.bak'

function migrationError(message, code, details = {}) {
  const error = new Error(message)
  error.code = code
  error.details = details
  return error
}

function resolveSafeDirectory(input, label, options = {}) {
  const raw = String(input || '').trim()
  if (!raw) {
    throw migrationError(`${label} is required.`, 'MIGRATION_UNSAFE_PATH')
  }
  const resolved = path.resolve(raw)
  if (
    resolved === path.parse(resolved).root ||
    resolved === path.resolve(os.homedir())
  ) {
    throw migrationError(
      `Refusing to use an unsafe ${label}: ${resolved}`,
      'MIGRATION_UNSAFE_PATH'
    )
  }
  if (fs.existsSync(resolved) && !fs.statSync(resolved).isDirectory()) {
    throw migrationError(
      `${label} is not a directory: ${resolved}`,
      'MIGRATION_UNSAFE_PATH'
    )
  }
  if (options.mustExist && !fs.existsSync(resolved)) {
    throw migrationError(
      `${label} does not exist: ${resolved}`,
      'MIGRATION_SOURCE_NOT_FOUND'
    )
  }
  return resolved
}

function samePath(left, right) {
  if (process.platform === 'win32') {
    return left.toLowerCase() === right.toLowerCase()
  }
  return left === right
}

function isNestedPath(parent, child) {
  const relative = path.relative(parent, child)
  return Boolean(
    relative &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== '..' &&
    !path.isAbsolute(relative)
  )
}

function isRecoverableContentError(error) {
  return new Set([
    'BLOCK_NOT_AVAILABLE',
    'LEGACY_CONTENT_INCOMPLETE',
    'LEGACY_CONTENT_CID_MISMATCH',
    'LEGACY_UNIXFS_INVALID',
  ]).has(error?.code)
}

function canonicalCid(input) {
  return CID.parse(String(input || '').trim()).toString()
}

function legacyDriveName(cid) {
  return `drive-${b4a.toString(CID.parse(cid).multihash.digest, 'hex')}`
}

function readJsonGeneration(dataPath, fileName, fallback) {
  const primaryPath = path.join(dataPath, fileName)
  const backupPath = `${primaryPath}${LEGACY_BACKUP_SUFFIX}`
  const candidates = [primaryPath, backupPath]
  const errors = []

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue
    try {
      return {
        value: JSON.parse(fs.readFileSync(candidate, 'utf8')),
        sourcePath: candidate,
      }
    } catch (error) {
      errors.push(`${candidate}: ${error.message}`)
    }
  }

  if (errors.length > 0) {
    throw migrationError(
      `Could not parse legacy metadata ${fileName}.`,
      'LEGACY_METADATA_INVALID',
      { errors }
    )
  }
  return { value: fallback, sourcePath: '' }
}

function normalizeLegacyMetadata(sourcePath) {
  const published = readJsonGeneration(
    sourcePath,
    'published-files.json',
    {}
  ).value
  const holdings = readJsonGeneration(
    sourcePath,
    'node-holdings.json',
    []
  ).value
  const channels = readJsonGeneration(sourcePath, 'channels.json', []).value
  const accountMetadata = readJsonGeneration(
    sourcePath,
    'account-metadata.json',
    {}
  ).value

  if (!published || typeof published !== 'object' || Array.isArray(published)) {
    throw migrationError(
      'Legacy published-files.json must contain owner buckets.',
      'LEGACY_METADATA_INVALID'
    )
  }
  if (!Array.isArray(holdings) || !Array.isArray(channels)) {
    throw migrationError(
      'Legacy holdings and channels metadata must be arrays.',
      'LEGACY_METADATA_INVALID'
    )
  }

  return { published, holdings, channels, accountMetadata }
}

function flattenPublished(published) {
  const records = []
  for (const [ownerAddress, bucket] of Object.entries(published)) {
    if (!Array.isArray(bucket)) continue
    for (const record of bucket) {
      if (!record?.cid) continue
      records.push({ ownerAddress, record })
    }
  }
  return records
}

function collectLegacyRoots(metadata) {
  const byCid = new Map()
  for (const holding of metadata.holdings) {
    if (!holding?.cid) continue
    const cid = canonicalCid(holding.cid)
    byCid.set(cid, {
      ...holding,
      cid,
      driveName: holding.driveName || legacyDriveName(cid),
      kind: holding.kind === 'collection' ? 'collection' : 'file',
    })
  }
  for (const { record } of flattenPublished(metadata.published)) {
    const cid = canonicalCid(record.cid)
    const existing = byCid.get(cid)
    byCid.set(cid, {
      ...record,
      ...existing,
      cid,
      driveName:
        existing?.driveName || record.driveName || legacyDriveName(cid),
      kind:
        existing?.kind === 'collection' || record.kind === 'collection'
          ? 'collection'
          : 'file',
    })
  }
  return [...byCid.values()]
}

function assertSafeChildPath(input) {
  const value = String(input || '')
    .replace(/\\/g, '/')
    .trim()
  const segments = value.split('/').filter(Boolean)
  if (
    !value ||
    value.startsWith('/') ||
    segments.some(segment => segment === '.' || segment === '..')
  ) {
    throw migrationError(
      `Unsafe legacy collection path: ${value}`,
      'LEGACY_COLLECTION_PATH_INVALID'
    )
  }
  return segments.join('/')
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const content = `${JSON.stringify(value, null, 2)}\n`
  const tempPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`
  fs.writeFileSync(tempPath, content)
  fs.renameSync(tempPath, filePath)
  fs.writeFileSync(`${filePath}.bak`, content)
}

function copyIfPresent(sourcePath, targetPath) {
  if (!fs.existsSync(sourcePath)) return false
  fs.copyFileSync(sourcePath, targetPath)
  return true
}

function getAvailableSiblingPath(basePath, label, now = new Date()) {
  const timestamp = now.toISOString().replace(/[-:.TZ]/g, '')
  const base = `${basePath}.${label}-${timestamp}`
  let candidate = base
  let suffix = 1
  while (fs.existsSync(candidate)) {
    candidate = `${base}-${suffix}`
    suffix += 1
  }
  return candidate
}

class LegacyV042Reader {
  constructor(sourcePath) {
    this.sourcePath = sourcePath
    this.store = null
    this.drives = new Map()
  }

  async open() {
    const primaryKey = b4a.alloc(32).fill(LEGACY_PRIMARY_KEY_TEXT)
    this.store = new Corestore(this.sourcePath, {
      primaryKey,
      unsafe: true,
      readOnly: true,
    })
    await this.store.ready()
  }

  async close() {
    await Promise.allSettled(
      [...this.drives.values()].map(drive => drive.close())
    )
    this.drives.clear()
    if (this.store) await this.store.close().catch(() => {})
    this.store = null
  }

  async getDrive(name) {
    if (this.drives.has(name)) return this.drives.get(name)
    const drive = new Hyperdrive(this.store.namespace(name))
    try {
      await drive.ready()
    } catch (error) {
      await drive.close().catch(() => {})
      if (error?.code === 'ENOSYS' || error?.cause?.code === 'ENOSYS') {
        throw migrationError(
          `Legacy drive does not exist: ${name}`,
          'LEGACY_CONTENT_INCOMPLETE',
          { driveName: name }
        )
      }
      throw error
    }
    this.drives.set(name, drive)
    return drive
  }

  async getFileEntry(cid, driveName = legacyDriveName(cid)) {
    const drive = await this.getDrive(driveName)
    const driveKey = `/${cid}`
    const entry = await drive.entry(driveKey, { wait: false })
    if (!entry?.value?.blob || !(await drive.has(driveKey))) {
      throw migrationError(
        `Legacy content is incomplete for ${cid}.`,
        'LEGACY_CONTENT_INCOMPLETE',
        { cid, driveName }
      )
    }
    return { drive, driveKey, entry }
  }

  async verifyFile(cid, driveName) {
    const source = await this.getFileEntry(cid, driveName)
    const calculated = await calculateCid(
      source.drive.createReadStream(source.driveKey)
    )
    if (calculated.cid.toString() !== cid) {
      throw migrationError(
        `Legacy file CID mismatch for ${cid}.`,
        'LEGACY_CONTENT_CID_MISMATCH',
        { cid, actualCid: calculated.cid.toString() }
      )
    }
    return Number(source.entry.value.blob.byteLength) || 0
  }

  async exportFile(cid, outputPath, driveName) {
    const source = await this.getFileEntry(cid, driveName)
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    await pipeline(
      source.drive.createReadStream(source.driveKey),
      fs.createWriteStream(outputPath)
    )
    const calculated = await calculateCid(outputPath)
    if (calculated.cid.toString() !== cid) {
      throw migrationError(
        `Exported legacy file CID mismatch for ${cid}.`,
        'LEGACY_CONTENT_CID_MISMATCH',
        { cid, actualCid: calculated.cid.toString() }
      )
    }
    return calculated.size
  }

  async readDriveBuffer(drive, driveKey) {
    const entry = await drive.entry(driveKey, { wait: false })
    if (!entry?.value?.blob || !(await drive.has(driveKey))) {
      throw migrationError(
        `Legacy UnixFS block is incomplete: ${driveKey}`,
        'LEGACY_CONTENT_INCOMPLETE'
      )
    }
    const chunks = []
    for await (const chunk of drive.createReadStream(driveKey)) {
      chunks.push(Buffer.from(chunk))
    }
    return Buffer.concat(chunks)
  }

  async readUnixfsBlock(drive, cid, rootCid) {
    const driveKey = cid === rootCid ? `/${cid}` : `/.unixfs/${cid}`
    const block = await this.readDriveBuffer(drive, driveKey)
    const actualCid = CID.create(1, 0x70, await sha256.digest(block)).toString()
    if (actualCid !== cid) {
      throw migrationError(
        `Legacy UnixFS block CID mismatch for ${cid}.`,
        'LEGACY_CONTENT_CID_MISMATCH',
        { cid, actualCid, rootCid }
      )
    }
    try {
      const node = dagPb.decode(block)
      const unixfs = UnixFS.unmarshal(node.Data)
      return { node, unixfs, block }
    } catch (cause) {
      throw migrationError(
        `Legacy UnixFS block is invalid for ${cid}.`,
        'LEGACY_UNIXFS_INVALID',
        { cid, rootCid, cause: cause.message }
      )
    }
  }

  async readCollection(record) {
    const drive = await this.getDrive(
      record.driveName || legacyDriveName(record.cid)
    )
    const root = await this.readUnixfsBlock(drive, record.cid, record.cid)
    if (!root.unixfs.isDirectory()) {
      throw migrationError(
        `Legacy collection root is not a directory: ${record.cid}`,
        'LEGACY_UNIXFS_INVALID'
      )
    }
    const files = []
    const blocks = new Map([[record.cid, root.block]])
    await this.collectDirectoryFiles(
      drive,
      root.node,
      '',
      files,
      record.cid,
      blocks
    )
    return { cid: record.cid, files, blocks }
  }

  async collectDirectoryFiles(
    drive,
    directoryNode,
    prefix,
    files,
    rootCid,
    blocks
  ) {
    const links = [...(directoryNode.Links || [])].sort((left, right) =>
      String(left.Name || '').localeCompare(String(right.Name || ''))
    )
    for (const link of links) {
      const name = String(link.Name || '').trim()
      if (!name) continue
      const childPath = assertSafeChildPath(prefix ? `${prefix}/${name}` : name)
      const cid = link.Hash.toString()
      if (link.Hash.code === 0x55) {
        files.push({ path: childPath, cid })
        continue
      }
      const child = await this.readUnixfsBlock(drive, cid, rootCid)
      blocks.set(cid, child.block)
      if (child.unixfs.isDirectory()) {
        await this.collectDirectoryFiles(
          drive,
          child.node,
          childPath,
          files,
          rootCid,
          blocks
        )
      } else {
        files.push({ path: childPath, cid })
      }
    }
  }

  async readChannelEntries(channel) {
    const writerKeys = Array.from(
      new Set(
        [channel.localWriterCoreKey, ...(channel.writerCoreKeys || [])].filter(
          key => /^[a-f0-9]{64}$/i.test(String(key || ''))
        )
      )
    )
    const namespace = this.store.namespace(`channel-${channel.channelKey}`)
    const collected = []
    const unavailableItems = []
    for (const writerKey of writerKeys) {
      const core = namespace.get({
        key: b4a.from(writerKey, 'hex'),
        valueEncoding: 'json',
        writable: false,
      })
      try {
        await core.ready()
        for (let index = 0; index < core.length; index += 1) {
          let value = null
          let unavailable = false
          try {
            value = await core.get(index, { wait: false })
          } catch (error) {
            unavailable = true
            unavailableItems.push({
              kind: 'channel-entry',
              channelKey: channel.channelKey,
              writerKey,
              index,
              reason: error.code || 'BLOCK_NOT_AVAILABLE',
            })
          }
          if (value && typeof value === 'object') {
            collected.push(value)
          } else if (!unavailable) {
            unavailableItems.push({
              kind: 'channel-entry',
              channelKey: channel.channelKey,
              writerKey,
              index,
              reason: value === null ? 'BLOCK_NOT_AVAILABLE' : 'INVALID_ENTRY',
            })
          }
        }
      } finally {
        await core.close().catch(() => {})
      }
    }
    const entries = collected.sort((left, right) => {
      const leftTime = Number(left.timestamp) || 0
      const rightTime = Number(right.timestamp) || 0
      return leftTime - rightTime
    })
    return { entries, unavailableItems }
  }
}

async function scanWithReader(reader, metadata, onProgress = () => {}) {
  const roots = collectLegacyRoots(metadata)
  const verifiedFiles = new Set()
  const unavailableItems = []
  let totalBytes = 0
  let collectionCount = 0

  const verifyFileOnce = async (cid, driveName) => {
    if (verifiedFiles.has(cid)) return
    totalBytes += await reader.verifyFile(cid, driveName)
    verifiedFiles.add(cid)
    onProgress({ stage: 'verified-file', cid })
  }

  for (const record of roots.filter(item => item.kind !== 'collection')) {
    try {
      await verifyFileOnce(record.cid, record.driveName)
    } catch (error) {
      if (!isRecoverableContentError(error)) throw error
      unavailableItems.push({
        kind: 'file',
        cid: record.cid,
        fileName: record.fileName || record.cid,
        reason: error.code || 'LEGACY_CONTENT_UNAVAILABLE',
      })
    }
  }
  for (const record of roots.filter(item => item.kind === 'collection')) {
    let collection
    try {
      collection = await reader.readCollection(record)
    } catch (error) {
      if (!isRecoverableContentError(error)) throw error
      unavailableItems.push({
        kind: 'collection',
        cid: record.cid,
        fileName: record.fileName || record.cid,
        reason: error.code || 'LEGACY_CONTENT_UNAVAILABLE',
      })
      continue
    }
    for (const file of collection.files) {
      try {
        await verifyFileOnce(file.cid, legacyDriveName(file.cid))
      } catch (error) {
        if (!isRecoverableContentError(error)) throw error
        unavailableItems.push({
          kind: 'collection-file',
          cid: file.cid,
          collectionCid: record.cid,
          collectionPath: file.path,
          reason: error.code || 'LEGACY_CONTENT_UNAVAILABLE',
        })
      }
    }
    collectionCount += 1
    onProgress({ stage: 'verified-collection', cid: record.cid })
  }

  let channelEntryCount = 0
  for (const channel of metadata.channels) {
    const channelResult = await reader.readChannelEntries(channel)
    channelEntryCount += channelResult.entries.length
    unavailableItems.push(...channelResult.unavailableItems)
    onProgress({
      stage: 'verified-channel',
      channelKey: channel.channelKey,
      entries: channelResult.entries.length,
    })
  }

  return {
    holdingCount: metadata.holdings.length,
    publishedCount: flattenPublished(metadata.published).length,
    rootCount: roots.length,
    fileCount: verifiedFiles.size,
    collectionCount,
    channelCount: metadata.channels.length,
    channelEntryCount,
    totalBytes,
    unavailableCount: unavailableItems.length,
    unavailableItems,
  }
}

export async function scanLegacyV042Storage(sourcePath, options = {}) {
  const resolvedSourcePath = resolveSafeDirectory(sourcePath, 'source path', {
    mustExist: true,
  })
  const metadata = normalizeLegacyMetadata(resolvedSourcePath)
  const reader = new LegacyV042Reader(resolvedSourcePath)
  await reader.open()
  try {
    return await scanWithReader(reader, metadata, options.onProgress)
  } finally {
    await reader.close()
  }
}

function transformPublishedMetadata(published, importedCids) {
  const result = {}
  for (const [ownerAddress, bucket] of Object.entries(published)) {
    if (!Array.isArray(bucket)) continue
    result[ownerAddress] = bucket
      .filter(record => {
        try {
          return importedCids.has(canonicalCid(record.cid))
        } catch {
          return false
        }
      })
      .map(record => {
        const cid = canonicalCid(record.cid)
        return { ...record, cid, driveName: getCidInfo(cid).driveName }
      })
  }
  return result
}

function patchHoldingMetadata(stagePath, legacyByCid) {
  const holdingsPath = path.join(stagePath, 'node-holdings.json')
  const persisted = JSON.parse(fs.readFileSync(holdingsPath, 'utf8'))
  persisted.holdings = persisted.holdings.map(holding => {
    const legacy = legacyByCid.get(holding.cid)
    if (!legacy) return holding
    return {
      ...holding,
      fileName: legacy.fileName || holding.fileName,
      source: legacy.source === 'downloaded' ? 'downloaded' : 'published',
      ...(legacy.kind === 'collection' ? { kind: 'collection' } : {}),
    }
  })
  writeJsonFile(holdingsPath, persisted)
}

async function importCollectionSnapshots(stagePath, snapshots, legacyByCid) {
  if (snapshots.length === 0) return
  const holdingsPath = path.join(stagePath, 'node-holdings.json')
  const persisted = JSON.parse(fs.readFileSync(holdingsPath, 'utf8'))
  const existingCids = new Set(persisted.holdings.map(holding => holding.cid))
  const store = new Corestore(path.join(stagePath, 'stores', 'files'))
  await store.ready()
  try {
    for (const snapshot of snapshots) {
      if (existingCids.has(snapshot.cid)) continue
      const drive = new Hyperdrive(
        store.namespace(`legacy-collection-${crypto.randomUUID()}`)
      )
      await drive.ready()
      for (const [blockCid, block] of snapshot.blocks) {
        const driveKey =
          blockCid === snapshot.cid ? `/${blockCid}` : `/.unixfs/${blockCid}`
        await drive.put(driveKey, block)
      }
      const transport = {
        type: 'hyperdrive',
        key: b4a.toString(drive.key, 'hex'),
        version: drive.version,
      }
      await drive.close()
      const legacy = legacyByCid.get(snapshot.cid) || {}
      const now = new Date().toISOString()
      persisted.holdings.push({
        cid: snapshot.cid,
        fileName: legacy.fileName || snapshot.cid,
        kind: 'collection',
        size: 0,
        source: legacy.source === 'downloaded' ? 'downloaded' : 'published',
        state: 'ready',
        transport,
        createdAt: legacy.createdAt || now,
        updatedAt: now,
      })
      existingCids.add(snapshot.cid)
    }
  } finally {
    await store.close().catch(() => {})
  }
  writeJsonFile(holdingsPath, persisted)
}

async function importChannels(stagePath, channels, histories) {
  const store = new Corestore(path.join(stagePath, 'stores', 'channels'))
  await store.ready()
  const migrated = []
  try {
    for (const channel of channels) {
      const channelId = String(channel.channelId || channel.name || '').trim()
      const channelKey = String(channel.channelKey || channelId).trim()
      if (!channelId || !channelKey) continue
      const writerId = createChannelWriterId()
      const core = store
        .namespace(`channel-${channelKey}`)
        .get({ name: `messages-${writerId}`, valueEncoding: 'json' })
      await core.ready()
      const entries = histories.get(channelKey) || []
      if (entries.length > 0) await core.append(entries)
      const localWriterCoreKey = b4a.toString(core.key, 'hex')
      await core.close()
      migrated.push({
        channelId,
        channelKey,
        name: channelId,
        type: String(channel.type || 'personal').trim() || 'personal',
        createdAt: channel.createdAt || new Date().toISOString(),
        lastMessageAt: channel.lastMessageAt || '',
        writerId,
        localWriterCoreKey,
        writerCoreKeys: [localWriterCoreKey],
        members: Array.isArray(channel.members) ? channel.members : [],
        ...(channel.remarks ? { remarks: channel.remarks } : {}),
        ...(channel.pinnedBy ? { pinnedBy: channel.pinnedBy } : {}),
        syncUpdatedAt: Number(channel.syncUpdatedAt) || Date.now(),
      })
    }
  } finally {
    await store.close().catch(() => {})
  }
  writeJsonFile(path.join(stagePath, 'channels.json'), migrated)
  return migrated
}

async function verifyStage(stagePath, expected) {
  const persistedChannels = JSON.parse(
    fs.readFileSync(path.join(stagePath, 'channels.json'), 'utf8')
  )
  if (
    !Array.isArray(persistedChannels) ||
    persistedChannels.length !== expected.channels.length
  ) {
    throw migrationError(
      'Migrated channel count is invalid.',
      'MIGRATION_VERIFICATION_FAILED'
    )
  }
  const persistedHoldings = JSON.parse(
    fs.readFileSync(path.join(stagePath, 'node-holdings.json'), 'utf8')
  )
  const holdings = new Map(
    persistedHoldings.holdings.map(holding => [holding.cid, holding])
  )
  const fileStore = new Corestore(path.join(stagePath, 'stores', 'files'))
  await fileStore.ready()
  try {
    for (const record of expected.roots) {
      const holding = holdings.get(record.cid)
      if (!holding) {
        throw migrationError(
          `Migrated holding is missing: ${record.cid}`,
          'MIGRATION_VERIFICATION_FAILED'
        )
      }
      if (record.kind === 'collection') continue

      const baseDrive = new Hyperdrive(
        fileStore.session(),
        b4a.from(holding.transport.key, 'hex')
      )
      await baseDrive.ready()
      const drive = baseDrive.checkout(holding.transport.version)
      try {
        const driveKey = `/${record.cid}`
        if (!(await drive.has(driveKey))) {
          throw migrationError(
            `Migrated file is incomplete: ${record.cid}`,
            'MIGRATION_VERIFICATION_FAILED'
          )
        }
        const calculated = await calculateCid(drive.createReadStream(driveKey))
        if (calculated.cid.toString() !== record.cid) {
          throw migrationError(
            `Migrated file CID changed: ${record.cid}`,
            'MIGRATION_VERIFICATION_FAILED'
          )
        }
      } finally {
        await drive.close().catch(() => {})
        await baseDrive.close().catch(() => {})
      }
    }
  } finally {
    await fileStore.close().catch(() => {})
  }

  const engine = new MostBoxEngine({
    dataPath: stagePath,
    disableNetwork: true,
    maxFileSize: Number.MAX_SAFE_INTEGER,
    capacityBytes: Number.MAX_SAFE_INTEGER,
  })
  await engine.start()
  try {
    for (const record of expected.roots) {
      if (record.kind === 'collection') {
        const collection = await engine.getCollection(record.cid)
        if (collection.cid !== record.cid) {
          throw migrationError(
            `Migrated collection CID changed: ${record.cid}`,
            'MIGRATION_VERIFICATION_FAILED'
          )
        }
      }
    }
  } finally {
    await engine.stop().catch(() => {})
  }

  const store = new Corestore(path.join(stagePath, 'stores', 'channels'))
  await store.ready()
  try {
    for (const channel of persistedChannels) {
      const expectedEntries =
        expected.channelHistories.get(channel.channelKey) || []
      const core = store.namespace(`channel-${channel.channelKey}`).get({
        key: b4a.from(channel.localWriterCoreKey, 'hex'),
        valueEncoding: 'json',
        writable: false,
      })
      try {
        await core.ready()
        if (core.length !== expectedEntries.length) {
          throw migrationError(
            `Migrated channel history length changed: ${channel.channelKey}`,
            'MIGRATION_VERIFICATION_FAILED'
          )
        }
        for (let index = 0; index < expectedEntries.length; index += 1) {
          const actual = await core.get(index, { wait: false })
          if (
            JSON.stringify(actual) !== JSON.stringify(expectedEntries[index])
          ) {
            throw migrationError(
              `Migrated channel history changed: ${channel.channelKey}`,
              'MIGRATION_VERIFICATION_FAILED'
            )
          }
        }
      } finally {
        await core.close().catch(() => {})
      }
    }
  } finally {
    await store.close().catch(() => {})
  }
}

function atomicSwitch(stagePath, targetPath, archivedTarget) {
  if (archivedTarget) fs.renameSync(targetPath, archivedTarget)
  try {
    fs.renameSync(stagePath, targetPath)
  } catch (error) {
    if (archivedTarget && !fs.existsSync(targetPath)) {
      fs.renameSync(archivedTarget, targetPath)
    }
    throw error
  }
  return archivedTarget
}

export async function migrateLegacyV042Storage(input, options = {}) {
  const sourcePath = resolveSafeDirectory(input.sourcePath, 'source path', {
    mustExist: true,
  })
  const targetPath = resolveSafeDirectory(input.targetPath, 'target path')
  const now = options.now instanceof Date ? options.now : new Date()
  const onProgress = options.onProgress || (() => {})
  if (
    !samePath(sourcePath, targetPath) &&
    (isNestedPath(sourcePath, targetPath) ||
      isNestedPath(targetPath, sourcePath))
  ) {
    throw migrationError(
      'Source and target paths must be identical or separate sibling trees.',
      'MIGRATION_UNSAFE_PATH'
    )
  }
  if (fs.existsSync(path.join(targetPath, 'v0.5-import-report.json'))) {
    throw migrationError(
      `Target was already migrated: ${targetPath}`,
      'MIGRATION_ALREADY_APPLIED'
    )
  }

  const metadata = normalizeLegacyMetadata(sourcePath)
  const roots = collectLegacyRoots(metadata)
  const legacyByCid = new Map(roots.map(record => [record.cid, record]))
  const stagePath = getAvailableSiblingPath(targetPath, 'v0.5-import', now)
  fs.mkdirSync(stagePath, { recursive: true })
  ensureStorageSchema(stagePath)
  copyIfPresent(
    path.join(sourcePath, 'node-identity.json'),
    path.join(stagePath, 'node-identity.json')
  )
  const tempRoot = path.join(stagePath, '.legacy-import-tmp')
  fs.mkdirSync(tempRoot)

  const reader = new LegacyV042Reader(sourcePath)
  let readerOpen = false
  let engine = null
  const importedCids = new Set()
  const channelHistories = new Map()
  const collectionSnapshots = []
  try {
    await reader.open()
    readerOpen = true
    const scanResult = await scanWithReader(reader, metadata, onProgress)
    const unavailableFileCids = new Set(
      scanResult.unavailableItems
        .filter(item => item.kind === 'file' || item.kind === 'collection-file')
        .map(item => item.cid)
    )
    const unavailableCollectionCids = new Set(
      scanResult.unavailableItems
        .filter(item => item.kind === 'collection')
        .map(item => item.cid)
    )

    engine = new MostBoxEngine({
      dataPath: stagePath,
      disableNetwork: true,
      maxFileSize: Number.MAX_SAFE_INTEGER,
      capacityBytes: Number.MAX_SAFE_INTEGER,
    })
    await engine.start()

    let fileIndex = 0
    for (const record of roots.filter(item => item.kind !== 'collection')) {
      if (unavailableFileCids.has(record.cid)) continue
      const tempPath = path.join(tempRoot, `file-${fileIndex}.bin`)
      fileIndex += 1
      await reader.exportFile(record.cid, tempPath, record.driveName)
      const result = await engine.publishFile(
        tempPath,
        record.fileName || record.cid,
        { addToLibrary: false }
      )
      if (result.cid !== record.cid) {
        throw migrationError(
          `Migrated file CID changed: ${record.cid}`,
          'MIGRATION_VERIFICATION_FAILED'
        )
      }
      importedCids.add(record.cid)
      fs.rmSync(tempPath, { force: true })
      onProgress({ stage: 'imported-file', cid: record.cid })
    }

    for (const record of roots.filter(item => item.kind === 'collection')) {
      if (unavailableCollectionCids.has(record.cid)) continue
      const collection = await reader.readCollection(record)
      collectionSnapshots.push({ cid: record.cid, blocks: collection.blocks })
      importedCids.add(record.cid)
      for (let index = 0; index < collection.files.length; index += 1) {
        const file = collection.files[index]
        if (unavailableFileCids.has(file.cid) || importedCids.has(file.cid)) {
          continue
        }
        const tempPath = path.join(tempRoot, `file-${fileIndex}.bin`)
        fileIndex += 1
        await reader.exportFile(file.cid, tempPath, legacyDriveName(file.cid))
        const result = await engine.publishFile(tempPath, file.path, {
          addToLibrary: false,
        })
        if (result.cid !== file.cid) {
          throw migrationError(
            `Migrated file CID changed: ${file.cid}`,
            'MIGRATION_VERIFICATION_FAILED'
          )
        }
        importedCids.add(file.cid)
        fs.rmSync(tempPath, { force: true })
        onProgress({ stage: 'imported-file', cid: file.cid })
      }
      onProgress({ stage: 'imported-collection', cid: record.cid })
    }

    for (const channel of metadata.channels) {
      const channelResult = await reader.readChannelEntries(channel)
      channelHistories.set(channel.channelKey, channelResult.entries)
    }

    await engine.stop()
    engine = null
    await importCollectionSnapshots(stagePath, collectionSnapshots, legacyByCid)
    patchHoldingMetadata(stagePath, legacyByCid)
    const migratedPublished = transformPublishedMetadata(
      metadata.published,
      importedCids
    )
    writeJsonFile(
      path.join(stagePath, 'published-files.json'),
      migratedPublished
    )
    if (
      metadata.accountMetadata &&
      typeof metadata.accountMetadata === 'object'
    ) {
      writeJsonFile(
        path.join(stagePath, 'account-metadata.json'),
        metadata.accountMetadata
      )
    }
    const migratedChannels = await importChannels(
      stagePath,
      metadata.channels,
      channelHistories
    )
    fs.rmSync(tempRoot, { recursive: true, force: true })

    const importedRoots = roots.filter(record => importedCids.has(record.cid))
    const collectionCids = new Set(
      collectionSnapshots.map(snapshot => snapshot.cid)
    )
    const importedRecords = [...importedCids].map(cid => ({
      cid,
      kind: collectionCids.has(cid) ? 'collection' : 'file',
    }))
    const archivedTarget = fs.existsSync(targetPath)
      ? getAvailableSiblingPath(targetPath, 'before-v0.5-import', now)
      : ''
    const legacySourcePath = samePath(sourcePath, targetPath)
      ? archivedTarget
      : sourcePath
    const cleanupCandidates = [
      ...(legacySourcePath
        ? [{ kind: 'legacy-source', path: legacySourcePath }]
        : []),
      ...(archivedTarget && !samePath(archivedTarget, legacySourcePath)
        ? [{ kind: 'previous-target', path: archivedTarget }]
        : []),
    ]

    const report = {
      schemaVersion: 1,
      sourcePath,
      targetPath,
      createdAt: now.toISOString(),
      cleanupCandidates,
      importedRootCids: importedRoots.map(record => record.cid),
      importedHoldingCount: importedCids.size,
      importedPublishedCount: flattenPublished(migratedPublished).length,
      importedChannelCount: migratedChannels.length,
      importedChannelEntryCount: [...channelHistories.values()].reduce(
        (sum, entries) => sum + entries.length,
        0
      ),
      unavailableCount: scanResult.unavailableCount,
      unavailableItems: scanResult.unavailableItems,
    }
    writeJsonFile(path.join(stagePath, 'v0.5-import-report.json'), report)
    await verifyStage(stagePath, {
      roots: importedRecords,
      channels: migratedChannels,
      channelHistories,
    })

    await reader.close()
    readerOpen = false
    atomicSwitch(stagePath, targetPath, archivedTarget)
    return { ...report, targetPath, archivedTarget }
  } catch (error) {
    if (engine) await engine.stop().catch(() => {})
    error.stagePath = stagePath
    throw error
  } finally {
    if (readerOpen) await reader.close()
  }
}
