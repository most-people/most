import crypto from 'node:crypto'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'
import b4a from 'b4a'

import { ValidationError } from '../utils/errors.js'
import {
  compareAccountEntries,
  deriveAccountSyncTopic,
  openAccountEntry,
  sealAccountEntry,
} from '../utils/accountSync.js'
import { readMetadataFile, writeMetadataFile } from './metadataFile.js'

export const ACCOUNT_HELLO_TYPE = 'account-hello'
const ADDRESS_REGEX = /^0x[0-9a-f]{40}$/
const SYNC_KEY_REGEX = /^0x[0-9a-f]{64}$/
const CORE_KEY_REGEX = /^[0-9a-f]{64}$/
const NONCE_REGEX = /^[0-9a-f]{32}$/
const MAX_WRITER_CORES = 64

export function getAccountSyncMetadataPath(dataPath) {
  return path.join(dataPath, 'account-sync.json')
}

function normalizeAddress(input) {
  const address = String(input || '')
    .trim()
    .toLowerCase()
  if (!ADDRESS_REGEX.test(address)) {
    throw new ValidationError('valid account address is required')
  }
  return address
}

function normalizeSyncKey(input) {
  const syncKey = String(input || '')
    .trim()
    .toLowerCase()
  const prefixed = syncKey.startsWith('0x') ? syncKey : `0x${syncKey}`
  if (!SYNC_KEY_REGEX.test(prefixed)) {
    throw new ValidationError('valid sync key is required')
  }
  return prefixed
}

function chatTopicFor(topicHex) {
  return crypto.createHash('sha256').update(`${topicHex}:chat`).digest()
}

/**
 * 账号状态同步：同一账号的各设备各写一个单写者日志 core，条目用同步子密钥加密，
 * 读时按 kind+id 做 last-writer-wins 合并。节点不持有种子，只持有同步子密钥。
 *
 * 复制走文件 swarm（每个连接都会 store.replicate），设备互相发现 core 走聊天 swarm
 * 上的 account-hello。hello 本身是认证加密的，只有同密钥的设备能打开，
 * 旁人既读不到内容，也看不出它属于哪个账号。
 */
export class AccountSync extends EventEmitter {
  #store
  #dataPath
  #swarm
  #chatSwarm
  #now
  #accounts = new Map()
  #streams = new Set()

  constructor({ store, dataPath, swarm, chatSwarm, now = Date.now }) {
    super()
    this.#store = store
    this.#dataPath = dataPath
    this.#swarm = swarm
    this.#chatSwarm = chatSwarm
    this.#now = now
  }

  async start() {
    const records = this.#loadRecords()
    for (const [address, record] of Object.entries(records)) {
      await this.#activate(address, record)
    }
  }

  async stop() {
    this.#streams.clear()
    this.removeAllListeners()
  }

  has(addressInput) {
    return this.#accounts.has(String(addressInput || '').toLowerCase())
  }

  hasAccounts() {
    return this.#accounts.size > 0
  }

  addresses() {
    return [...this.#accounts.keys()]
  }

  /** 本设备写入日志用的 deviceId；其他设备的条目 deviceId 与它不同。 */
  deviceIdFor(addressInput) {
    return this.#accounts.get(String(addressInput || '').toLowerCase())
      ?.deviceId
  }

  /** 本机已发布条目的内容哈希（key 为 kind:id），用于只发布相对上次的变化。 */
  getPublished(addressInput) {
    return new Map(this.#requireAccount(addressInput).published)
  }

  setPublished(addressInput, published) {
    this.#requireAccount(addressInput).published = new Map(published)
    this.#persist()
  }

  /** 登记账号的同步子密钥并开始同步；同一密钥重复登记是幂等的。 */
  async register(addressInput, syncKeyInput) {
    const address = normalizeAddress(addressInput)
    const syncKey = normalizeSyncKey(syncKeyInput)
    const existing = this.#accounts.get(address)
    if (existing) {
      if (existing.syncKey !== syncKey) {
        throw new ValidationError(
          'a different sync key is already registered for this account'
        )
      }
      return this.status(address)
    }
    await this.#activate(address, { syncKey, writerCoreKeys: [] })
    this.#persist()
    this.#broadcastHello(address)
    return this.status(address)
  }

  /** 停止同步并删除该账号的同步密钥；已同步到本机的数据保留，日志 core 不再更新。 */
  async unregister(addressInput) {
    const address = normalizeAddress(addressInput)
    const account = this.#accounts.get(address)
    if (!account) return { registered: false }
    this.#accounts.delete(address)
    this.#persist()
    const topicBuffer = b4a.from(account.topic.slice(2), 'hex')
    this.#swarm?.leave?.(topicBuffer)?.catch?.(() => {})
    this.#chatSwarm?.leave?.(chatTopicFor(account.topic))?.catch?.(() => {})
    await Promise.allSettled(
      [...account.cores.values()].map(core => core.close())
    )
    return { registered: false }
  }

  status(addressInput) {
    const account = this.#accounts.get(String(addressInput || '').toLowerCase())
    if (!account) return { registered: false }
    return {
      registered: true,
      topic: account.topic,
      deviceId: account.deviceId,
      writerCores: account.cores.size,
      entries: [...account.state.values()].filter(entry => !entry.deleted)
        .length,
    }
  }

  /** 当前生效的条目（不含墓碑），可按 kind 过滤。 */
  list(addressInput, { kind } = {}) {
    const account = this.#requireAccount(addressInput)
    return [...account.state.values()].filter(
      entry => !entry.deleted && (!kind || entry.kind === kind)
    )
  }

  /** 追加一条本设备写入的条目；deleted 为 true 时写入墓碑。 */
  async append(addressInput, { kind, id, data = null, deleted = false }) {
    const account = this.#requireAccount(addressInput)
    const updatedAt = Math.max(this.#now(), account.maxUpdatedAt + 1)
    const envelope = sealAccountEntry(
      { kind, id, deviceId: account.deviceId, updatedAt, deleted, data },
      account.syncKey
    )
    await account.localCore.append(envelope)
    await this.#scan(account)
    return account.state.get(`${kind}:${id}`)
  }

  attachStream(stream) {
    this.#streams.add(stream)
    const detach = () => this.#streams.delete(stream)
    stream.on?.('close', detach)
    stream.on?.('error', detach)
    for (const address of this.#accounts.keys()) {
      this.#sendHello(stream, address)
    }
  }

  /** 处理聊天 swarm 上的消息；是 account-hello 则返回 true。 */
  async handleMessage(_stream, message) {
    if (message?.type !== ACCOUNT_HELLO_TYPE) return false
    for (const [address, account] of this.#accounts) {
      const hello = openAccountEntry(message.envelope, account.syncKey)
      if (!hello || hello.kind !== 'hello') continue
      const keys = Array.isArray(hello.data?.writerCoreKeys)
        ? hello.data.writerCoreKeys
        : []
      let learned = false
      for (const key of keys.slice(0, MAX_WRITER_CORES)) {
        if (await this.#openRemote(account, String(key))) learned = true
      }
      if (learned) {
        this.#persist()
        // 学到新设备后重新通告，让只经过中间设备相连的节点也能发现彼此。
        this.#broadcastHello(address)
      }
      this.#scheduleScan(address)
      break
    }
    return true
  }

  #requireAccount(addressInput) {
    const account = this.#accounts.get(normalizeAddress(addressInput))
    if (!account) {
      throw new ValidationError('account sync is not registered')
    }
    return account
  }

  #loadRecords() {
    return readMetadataFile(getAccountSyncMetadataPath(this.#dataPath), {
      label: 'account sync',
      fallback: () => ({}),
      parse: data => {
        const parsed = JSON.parse(data)
        const records = {}
        for (const [address, record] of Object.entries(
          parsed?.accounts || {}
        )) {
          if (!ADDRESS_REGEX.test(address)) continue
          if (!SYNC_KEY_REGEX.test(String(record?.syncKey || ''))) continue
          records[address] = {
            syncKey: record.syncKey,
            published: Object.fromEntries(
              Object.entries(record.published || {}).filter(
                ([key, hash]) => key && typeof hash === 'string'
              )
            ),
            deviceNonce: NONCE_REGEX.test(String(record.deviceNonce || ''))
              ? record.deviceNonce
              : '',
            writerCoreKeys: (record.writerCoreKeys || []).filter(key =>
              CORE_KEY_REGEX.test(String(key))
            ),
          }
        }
        return records
      },
    })
  }

  #persist() {
    const accounts = {}
    for (const [address, account] of this.#accounts) {
      accounts[address] = {
        syncKey: account.syncKey,
        deviceNonce: account.deviceNonce,
        published: Object.fromEntries(account.published),
        writerCoreKeys: [...account.cores.keys()].filter(
          key => key !== account.deviceId
        ),
      }
    }
    const filePath = getAccountSyncMetadataPath(this.#dataPath)
    writeMetadataFile(filePath, JSON.stringify({ version: 1, accounts }))
    try {
      fs.chmodSync(filePath, 0o600)
    } catch {}
  }

  async #activate(address, record) {
    // 引擎的 Corestore 使用固定 primaryKey，同名 core 在所有设备上密钥相同。
    // 名字里带每设备随机数，保证每台设备独占自己的写入 core，避免多设备写同一日志而分叉。
    const deviceNonce =
      record.deviceNonce || crypto.randomBytes(16).toString('hex')
    const namespace = this.#store.namespace(`account-sync-${address}`)
    const localCore = namespace.get({
      name: `log-${deviceNonce}`,
      valueEncoding: 'json',
    })
    await localCore.ready()
    const deviceId = b4a.toString(localCore.key, 'hex')
    const topic = deriveAccountSyncTopic(record.syncKey)
    const account = {
      address,
      syncKey: record.syncKey,
      deviceNonce,
      published: new Map(Object.entries(record.published || {})),
      topic,
      namespace,
      localCore,
      deviceId,
      cores: new Map([[deviceId, localCore]]),
      scanned: new Map(),
      state: new Map(),
      maxUpdatedAt: 0,
      scanning: Promise.resolve(),
    }
    this.#accounts.set(address, account)
    this.#watch(account, localCore)
    for (const key of record.writerCoreKeys) {
      await this.#openRemote(account, key)
    }
    await this.#scan(account)
    this.#join(account)
  }

  #join(account) {
    const topicBuffer = b4a.from(account.topic.slice(2), 'hex')
    const options = { server: true, client: true }
    this.#swarm?.join?.(topicBuffer, options)
    this.#chatSwarm?.join?.(chatTopicFor(account.topic), options)
  }

  async #openRemote(account, keyHex) {
    if (!CORE_KEY_REGEX.test(keyHex) || account.cores.has(keyHex)) return false
    if (account.cores.size >= MAX_WRITER_CORES) return false
    const core = account.namespace.get({
      key: b4a.from(keyHex, 'hex'),
      valueEncoding: 'json',
    })
    await core.ready()
    account.cores.set(keyHex, core)
    this.#watch(account, core)
    return true
  }

  #watch(account, core) {
    const rescan = () => this.#scheduleScan(account.address)
    core.on('append', rescan)
    core.on('download', rescan)
    if (core.writable === false) core.download({ start: 0, end: -1 })
  }

  #scheduleScan(address) {
    const account = this.#accounts.get(address)
    if (account) this.#scan(account).catch(() => {})
  }

  #scan(account) {
    account.scanning = account.scanning.then(() => this.#scanNow(account))
    return account.scanning
  }

  async #scanNow(account) {
    const changed = []
    for (const [coreKey, core] of account.cores) {
      let index = account.scanned.get(coreKey) || 0
      for (; index < core.length; index++) {
        let block
        try {
          block = await core.get(index, { wait: false })
        } catch {
          break
        }
        if (block == null) break
        const entry = openAccountEntry(block, account.syncKey)
        if (!entry || entry.kind === 'hello') continue
        account.maxUpdatedAt = Math.max(account.maxUpdatedAt, entry.updatedAt)
        const key = `${entry.kind}:${entry.id}`
        const current = account.state.get(key)
        if (!current || compareAccountEntries(entry, current) > 0) {
          account.state.set(key, entry)
          changed.push(entry)
        }
      }
      account.scanned.set(coreKey, index)
    }
    if (changed.length > 0) {
      this.emit('change', { address: account.address, changed })
    }
  }

  #broadcastHello(address) {
    for (const stream of this.#streams) this.#sendHello(stream, address)
  }

  #sendHello(stream, address) {
    const account = this.#accounts.get(address)
    if (!account) return
    const envelope = sealAccountEntry(
      {
        kind: 'hello',
        id: 'writers',
        deviceId: account.deviceId,
        updatedAt: this.#now(),
        data: { writerCoreKeys: [...account.cores.keys()] },
      },
      account.syncKey
    )
    try {
      stream.write(
        `${JSON.stringify({ type: ACCOUNT_HELLO_TYPE, envelope })}\n`
      )
    } catch {
      this.#streams.delete(stream)
    }
  }
}
