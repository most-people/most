import {
  createHash,
  createHmac,
  randomBytes as nodeRandomBytes,
} from 'node:crypto'

import Hyperswarm from 'hyperswarm'

export const P2P_PING_CODE_PATTERN = /^\d{6}$/
export const P2P_PING_TOPIC_DOMAIN = 'most-box-p2p-ping-v2'
export const P2P_PING_HOST_TTL_MS = 2 * 60 * 1000
export const P2P_PING_JOIN_TIMEOUT_MS = 45 * 1000
export const P2P_PING_DIRECTIONS = ['hostToJoin', 'joinToHost']

const DIRECTION_INITIATOR_ROLE = {
  hostToJoin: 'host',
  joinToHost: 'join',
}
const PROOF_KEY_DOMAIN = 'most-box-p2p-ping-proof-key-v2'
const PROOF_DOMAIN = 'most-box-p2p-ping-proof-v2'
const MAX_FRAME_BYTES = 4096
const MAX_RECORDS = 20
const TERMINAL_STATUSES = new Set([
  'success',
  'partial',
  'failed',
  'cancelled',
  'expired',
])
const DIRECTION_TERMINAL_STATUSES = new Set([
  'success',
  'failed',
  'cancelled',
  'expired',
])

function createError(message, code) {
  const error = new Error(message)
  error.code = code
  return error
}

function toHex(value) {
  if (!value) return null
  return Buffer.from(value).toString('hex')
}

function cloneRecord(record) {
  return JSON.parse(JSON.stringify(record))
}

function isTerminal(status) {
  return TERMINAL_STATUSES.has(status)
}

function isDirectionTerminal(status) {
  return DIRECTION_TERMINAL_STATUSES.has(status)
}

function validateDirection(direction) {
  if (!P2P_PING_DIRECTIONS.includes(direction)) {
    throw createError('Invalid P2P Ping direction', 'VALIDATION_ERROR')
  }
  return direction
}

function proofKey(code) {
  return createHash('sha256')
    .update(PROOF_KEY_DOMAIN)
    .update('\0')
    .update(code)
    .digest()
}

function createProof(code, direction, type, nonce) {
  return createHmac('sha256', proofKey(code))
    .update(PROOF_DOMAIN)
    .update('\0')
    .update(direction)
    .update('\0')
    .update(type)
    .update('\0')
    .update(nonce)
    .digest('hex')
}

function createFrame(code, direction, type, nonce) {
  return {
    type,
    version: 2,
    direction,
    nonce,
    proof: createProof(code, direction, type, nonce),
  }
}

function isValidFrame(code, direction, frame, expectedType, expectedNonce) {
  return (
    frame &&
    frame.type === expectedType &&
    frame.version === 2 &&
    frame.direction === direction &&
    frame.nonce === expectedNonce &&
    typeof frame.proof === 'string' &&
    frame.proof === createProof(code, direction, expectedType, expectedNonce)
  )
}

function createDirectionRecord(direction) {
  return {
    direction,
    initiatorRole: DIRECTION_INITIATOR_ROLE[direction],
    status: 'preparing',
    phase: 'preparing',
    elapsedMs: null,
    discoveredPeers: 0,
    localPeerKey: null,
    remotePeerKey: null,
    errorCode: null,
    errorMessage: null,
  }
}

export function validateP2PPingCode(code) {
  if (typeof code !== 'string' || !P2P_PING_CODE_PATTERN.test(code)) {
    throw createError(
      'Ping code must be exactly six digits',
      'VALIDATION_ERROR'
    )
  }
  return code
}

export function generateP2PPingCode(randomBytes = nodeRandomBytes) {
  const range = 0x100000000
  const limit = range - (range % 1000000)
  let value

  do {
    const bytes = randomBytes(4)
    value = Buffer.from(bytes).readUInt32BE(0)
  } while (value >= limit)

  return String(value % 1000000).padStart(6, '0')
}

export function deriveP2PPingTopic(code, direction) {
  validateP2PPingCode(code)
  validateDirection(direction)
  return createHash('sha256')
    .update(P2P_PING_TOPIC_DOMAIN)
    .update('\0')
    .update(code)
    .update('\0')
    .update(direction)
    .digest()
}

export function encodeP2PPingFrame(code, direction, type, nonce) {
  validateDirection(direction)
  return `${JSON.stringify(createFrame(code, direction, type, nonce))}\n`
}

export function createP2PPingFrameDecoder(onFrame, onError) {
  let buffered = ''

  return chunk => {
    try {
      buffered += Buffer.from(chunk).toString('utf8')
      if (Buffer.byteLength(buffered) > MAX_FRAME_BYTES) {
        throw createError('P2P Ping frame is too large', 'PING_FAILED')
      }

      let newlineIndex = buffered.indexOf('\n')
      while (newlineIndex >= 0) {
        const line = buffered.slice(0, newlineIndex)
        buffered = buffered.slice(newlineIndex + 1)
        if (!line) throw createError('P2P Ping frame is empty', 'PING_FAILED')
        onFrame(JSON.parse(line))
        newlineIndex = buffered.indexOf('\n')
      }
    } catch (error) {
      buffered = ''
      onError(error)
    }
  }
}

export class P2PPingManager {
  #activeSession = null
  #createSwarm
  #hostTtlMs
  #joinTimeoutMs
  #now
  #onUpdate
  #randomBytes
  #records = new Map()
  #swarmOptions

  constructor(options = {}) {
    this.#createSwarm =
      options.createSwarm || (swarmOptions => new Hyperswarm(swarmOptions))
    this.#swarmOptions = options.swarmOptions || {}
    this.#onUpdate = options.onUpdate || (() => {})
    this.#randomBytes = options.randomBytes || nodeRandomBytes
    this.#now = options.now || Date.now
    this.#hostTtlMs = options.hostTtlMs || P2P_PING_HOST_TTL_MS
    this.#joinTimeoutMs = options.joinTimeoutMs || P2P_PING_JOIN_TIMEOUT_MS
  }

  async start(input = {}) {
    if (this.#activeSession && !isTerminal(this.#activeSession.record.status)) {
      throw createError('Another P2P Ping is already active', 'CONFLICT')
    }

    const role = input.role
    if (role !== 'host' && role !== 'join') {
      throw createError('Ping role must be host or join', 'VALIDATION_ERROR')
    }

    const code =
      role === 'host'
        ? generateP2PPingCode(this.#randomBytes)
        : validateP2PPingCode(input.code)
    const createdAtMs = this.#now()
    const id = this.#randomBytes(16).toString('hex')
    const timeoutMs = role === 'host' ? this.#hostTtlMs : this.#joinTimeoutMs
    const record = {
      id,
      role,
      code,
      status: 'preparing',
      phase: 'preparing',
      createdAt: new Date(createdAtMs).toISOString(),
      expiresAt: new Date(createdAtMs + timeoutMs).toISOString(),
      completedAt: null,
      elapsedMs: null,
      discoveredPeers: 0,
      localPeerKey: null,
      remotePeerKey: null,
      errorCode: null,
      errorMessage: null,
      directions: Object.fromEntries(
        P2P_PING_DIRECTIONS.map(direction => [
          direction,
          createDirectionRecord(direction),
        ])
      ),
    }
    const session = {
      record,
      createdAtMs,
      timer: null,
      cleanupTimer: null,
      cleanedUp: false,
      testingStarted: role === 'join',
      directions: new Map(),
    }

    for (const direction of P2P_PING_DIRECTIONS) {
      session.directions.set(direction, {
        name: direction,
        record: record.directions[direction],
        client: DIRECTION_INITIATOR_ROLE[direction] === role,
        swarm: null,
        discovery: null,
        candidates: new Map(),
        stream: null,
        hadConnection: false,
      })
    }

    this.#activeSession = session
    this.#records.set(id, session)
    this.#trimRecords()
    this.#emit(session)
    this.#setTimer(session, timeoutMs)
    for (const runtime of session.directions.values()) {
      void this.#runDirection(session, runtime)
    }
    return cloneRecord(record)
  }

  cancel(id) {
    const session = this.#records.get(id)
    if (!session) return null
    if (!isTerminal(session.record.status)) {
      for (const runtime of session.directions.values()) {
        this.#finishDirection(
          session,
          runtime,
          'cancelled',
          'CANCELLED',
          'P2P Ping was cancelled',
          false
        )
      }
      this.#finish(session, 'cancelled', 'CANCELLED', 'P2P Ping was cancelled')
    }
    return cloneRecord(session.record)
  }

  async destroy() {
    const sessions = [...this.#records.values()]
    for (const session of sessions) {
      if (!isTerminal(session.record.status)) {
        for (const runtime of session.directions.values()) {
          this.#finishDirection(
            session,
            runtime,
            'cancelled',
            'CANCELLED',
            'P2P Ping stopped with the node',
            false
          )
        }
        this.#finish(
          session,
          'cancelled',
          'CANCELLED',
          'P2P Ping stopped with the node'
        )
      }
    }
    await Promise.allSettled(sessions.map(session => this.#cleanup(session)))
    this.#activeSession = null
  }

  async #runDirection(session, runtime) {
    try {
      const swarm = this.#createSwarm(this.#swarmOptions)
      runtime.swarm = swarm
      runtime.record.localPeerKey = toHex(swarm.keyPair?.publicKey)
      if (!session.record.localPeerKey) {
        session.record.localPeerKey = runtime.record.localPeerKey
      }
      swarm.on('connection', (connection, info) =>
        this.#handleConnection(session, runtime, connection, info)
      )
      swarm.on('update', () => this.#handleUpdate(session, runtime))
      swarm.on('error', error =>
        this.#handleSwarmError(session, runtime, error)
      )

      runtime.discovery = swarm.join(
        deriveP2PPingTopic(session.record.code, runtime.name),
        {
          server: !runtime.client,
          client: runtime.client,
        }
      )
      const flushed = await runtime.discovery.flushed()
      if (flushed === false) throw new Error('DHT setup did not flush')
      if (
        isTerminal(session.record.status) ||
        isDirectionTerminal(runtime.record.status) ||
        runtime.candidates.size > 0
      ) {
        return
      }

      this.#setDirectionStatus(
        session,
        runtime,
        runtime.client ? 'discovering' : 'waiting'
      )
    } catch (error) {
      this.#finishDirection(
        session,
        runtime,
        'failed',
        'ANNOUNCE_FAILED',
        error.message || 'DHT setup failed'
      )
    }
  }

  #handleUpdate(session, runtime) {
    if (
      isTerminal(session.record.status) ||
      isDirectionTerminal(runtime.record.status) ||
      !runtime.swarm
    ) {
      return
    }
    const discoveredPeers = runtime.swarm.peers?.size || 0
    if (discoveredPeers > runtime.record.discoveredPeers) {
      runtime.record.discoveredPeers = discoveredPeers
      this.#markTestingStarted(session)
      if (runtime.client && runtime.record.status === 'discovering') {
        runtime.record.status = 'connecting'
        runtime.record.phase = 'connecting'
      }
      this.#refreshAggregate(session)
    }
  }

  #handleSwarmError(session, runtime, error) {
    if (
      isTerminal(session.record.status) ||
      isDirectionTerminal(runtime.record.status)
    ) {
      return
    }
    if (runtime.record.status === 'preparing') {
      this.#finishDirection(
        session,
        runtime,
        'failed',
        'ANNOUNCE_FAILED',
        error.message || 'DHT setup failed'
      )
    }
  }

  #handleConnection(session, runtime, connection, info = {}) {
    if (
      isTerminal(session.record.status) ||
      isDirectionTerminal(runtime.record.status)
    ) {
      connection.destroy()
      return
    }

    this.#markTestingStarted(session)
    runtime.hadConnection = true
    const candidate = {
      nonce: runtime.client ? this.#randomBytes(16).toString('hex') : null,
      remotePeerKey: toHex(connection.remotePublicKey || info.publicKey),
    }
    runtime.candidates.set(connection, candidate)
    runtime.record.discoveredPeers = Math.max(1, runtime.record.discoveredPeers)
    this.#setDirectionStatus(session, runtime, 'verifying')

    const decode = createP2PPingFrameDecoder(
      frame =>
        this.#handleFrame(session, runtime, connection, candidate, frame),
      () => this.#rejectCandidate(session, runtime, connection)
    )
    connection.on('data', decode)
    connection.on('error', () => {
      this.#rejectCandidate(session, runtime, connection)
    })
    connection.on('close', () => {
      if (runtime.stream === connection) runtime.stream = null
      if (isDirectionTerminal(runtime.record.status)) return
      runtime.candidates.delete(connection)
      if (runtime.candidates.size === 0) {
        this.#setDirectionStatus(
          session,
          runtime,
          runtime.client ? 'discovering' : 'waiting'
        )
      }
    })

    if (runtime.client) {
      this.#writeFrame(
        session,
        runtime,
        connection,
        'p2p-ping',
        candidate.nonce
      )
    }
  }

  #handleFrame(session, runtime, connection, candidate, frame) {
    if (
      isTerminal(session.record.status) ||
      isDirectionTerminal(runtime.record.status)
    ) {
      return
    }
    const code = session.record.code

    if (
      !runtime.client &&
      !candidate.nonce &&
      frame?.direction === runtime.name &&
      typeof frame.nonce === 'string' &&
      /^[0-9a-f]{32}$/.test(frame.nonce) &&
      isValidFrame(code, runtime.name, frame, 'p2p-ping', frame.nonce)
    ) {
      candidate.nonce = frame.nonce
      this.#writeFrame(
        session,
        runtime,
        connection,
        'p2p-pong',
        candidate.nonce
      )
      return
    }

    if (
      runtime.client &&
      isValidFrame(code, runtime.name, frame, 'p2p-pong', candidate.nonce)
    ) {
      this.#writeFrame(session, runtime, connection, 'p2p-ack', candidate.nonce)
      this.#completeDirection(session, runtime, connection, candidate)
      return
    }

    if (
      !runtime.client &&
      candidate.nonce &&
      isValidFrame(code, runtime.name, frame, 'p2p-ack', candidate.nonce)
    ) {
      this.#completeDirection(session, runtime, connection, candidate)
      return
    }

    this.#rejectCandidate(session, runtime, connection)
  }

  #writeFrame(session, runtime, connection, type, nonce) {
    try {
      connection.write(
        encodeP2PPingFrame(session.record.code, runtime.name, type, nonce)
      )
    } catch {
      this.#rejectCandidate(session, runtime, connection)
    }
  }

  #completeDirection(session, runtime, connection, candidate) {
    runtime.stream = connection
    runtime.record.remotePeerKey = candidate.remotePeerKey
    for (const otherConnection of runtime.candidates.keys()) {
      if (otherConnection !== connection) otherConnection.destroy()
    }
    runtime.candidates.clear()
    runtime.candidates.set(connection, candidate)
    this.#finishDirection(session, runtime, 'success')
  }

  #rejectCandidate(session, runtime, connection) {
    if (!runtime.candidates.has(connection)) return
    runtime.candidates.delete(connection)
    connection.destroy()
    if (
      !isTerminal(session.record.status) &&
      !isDirectionTerminal(runtime.record.status) &&
      runtime.candidates.size === 0
    ) {
      this.#setDirectionStatus(
        session,
        runtime,
        runtime.client ? 'discovering' : 'waiting'
      )
    }
  }

  #markTestingStarted(session) {
    if (session.testingStarted || session.record.role !== 'host') return
    session.testingStarted = true
    session.record.expiresAt = new Date(
      this.#now() + this.#joinTimeoutMs
    ).toISOString()
    this.#setTimer(session, this.#joinTimeoutMs)
  }

  #setTimer(session, timeoutMs) {
    clearTimeout(session.timer)
    session.timer = setTimeout(() => this.#handleTimeout(session), timeoutMs)
  }

  #handleTimeout(session) {
    if (isTerminal(session.record.status)) return

    if (session.record.role === 'host' && !session.testingStarted) {
      for (const runtime of session.directions.values()) {
        this.#finishDirection(
          session,
          runtime,
          'expired',
          'TIMEOUT',
          'Ping code expired before another device started testing',
          false
        )
      }
      this.#finish(
        session,
        'expired',
        'TIMEOUT',
        'Ping code expired before another device started testing'
      )
      return
    }

    for (const runtime of session.directions.values()) {
      if (isDirectionTerminal(runtime.record.status)) continue
      if (runtime.record.discoveredPeers === 0 && !runtime.hadConnection) {
        this.#finishDirection(
          session,
          runtime,
          'failed',
          'PEER_NOT_FOUND',
          'No peer was discovered for this connection direction',
          false
        )
      } else if (!runtime.hadConnection) {
        this.#finishDirection(
          session,
          runtime,
          'failed',
          'CONNECTION_FAILED',
          'A peer was found but a connection was not established',
          false
        )
      } else {
        this.#finishDirection(
          session,
          runtime,
          'failed',
          'PING_FAILED',
          'The connection opened but Ping/Pong proof did not complete',
          false
        )
      }
    }
    this.#refreshAggregate(session)
  }

  #setDirectionStatus(session, runtime, status) {
    if (
      isTerminal(session.record.status) ||
      isDirectionTerminal(runtime.record.status)
    ) {
      return
    }
    runtime.record.status = status
    runtime.record.phase = status
    this.#refreshAggregate(session)
  }

  #finishDirection(
    session,
    runtime,
    status,
    errorCode = null,
    errorMessage = null,
    refresh = true
  ) {
    if (isDirectionTerminal(runtime.record.status)) return
    const completedPhase = runtime.record.phase
    runtime.record.status = status
    runtime.record.phase = status === 'success' ? 'success' : completedPhase
    runtime.record.elapsedMs = Math.max(0, this.#now() - session.createdAtMs)
    runtime.record.errorCode = errorCode
    runtime.record.errorMessage = errorMessage
    if (refresh) this.#refreshAggregate(session)
  }

  #refreshAggregate(session) {
    if (isTerminal(session.record.status)) return
    const directions = [...session.directions.values()]
    const records = directions.map(runtime => runtime.record)
    session.record.discoveredPeers = records.reduce(
      (total, record) => total + record.discoveredPeers,
      0
    )
    session.record.localPeerKey =
      records.find(record => record.localPeerKey)?.localPeerKey || null
    session.record.remotePeerKey =
      records.find(record => record.remotePeerKey)?.remotePeerKey || null

    if (records.every(record => record.status === 'success')) {
      this.#finish(session, 'success')
      return
    }

    if (records.every(record => isDirectionTerminal(record.status))) {
      const succeeded = records.filter(record => record.status === 'success')
      if (succeeded.length > 0) {
        this.#finish(session, 'partial')
        return
      }
      const errors = records.filter(record => record.errorCode)
      const sharedCode = errors.every(
        record => record.errorCode === errors[0]?.errorCode
      )
        ? errors[0]?.errorCode
        : 'TIMEOUT'
      this.#finish(
        session,
        'failed',
        sharedCode || 'TIMEOUT',
        'Neither connection direction completed Ping/Pong proof'
      )
      return
    }

    const statuses = new Set(records.map(record => record.status))
    let status = 'discovering'
    if (statuses.has('verifying')) status = 'verifying'
    else if (statuses.has('connecting')) status = 'connecting'
    else if (statuses.has('preparing')) status = 'preparing'
    else if (session.record.role === 'host' && !session.testingStarted) {
      status = 'waiting'
    }
    session.record.status = status
    session.record.phase = status
    this.#emit(session)
  }

  #finish(session, status, errorCode = null, errorMessage = null) {
    if (isTerminal(session.record.status)) return
    clearTimeout(session.timer)
    session.timer = null
    const completedPhase = session.record.phase
    session.record.status = status
    session.record.phase =
      status === 'success' || status === 'partial' ? status : completedPhase
    session.record.completedAt = new Date(this.#now()).toISOString()
    session.record.elapsedMs = Math.max(0, this.#now() - session.createdAtMs)
    session.record.errorCode = errorCode
    session.record.errorMessage = errorMessage
    if (this.#activeSession === session) this.#activeSession = null
    this.#emit(session)
    session.cleanupTimer = setTimeout(
      () => void this.#cleanup(session),
      status === 'success' || status === 'partial' ? 500 : 0
    )
  }

  async #cleanup(session) {
    if (session.cleanedUp) return
    session.cleanedUp = true
    clearTimeout(session.timer)
    clearTimeout(session.cleanupTimer)
    const tasks = []
    for (const runtime of session.directions.values()) {
      if (runtime.discovery?.destroy) {
        tasks.push(Promise.resolve(runtime.discovery.destroy()))
      }
      for (const connection of runtime.candidates.keys()) connection.destroy()
      runtime.candidates.clear()
      if (runtime.swarm?.destroy) {
        tasks.push(Promise.resolve(runtime.swarm.destroy()))
      }
    }
    await Promise.allSettled(tasks)
  }

  #emit(session) {
    this.#onUpdate(cloneRecord(session.record))
  }

  #trimRecords() {
    while (this.#records.size > MAX_RECORDS) {
      const oldestId = this.#records.keys().next().value
      if (oldestId === this.#activeSession?.record.id) return
      this.#records.delete(oldestId)
    }
  }
}
