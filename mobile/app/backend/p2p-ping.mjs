import {
  createHash,
  createHmac,
  randomBytes as nodeRandomBytes,
} from 'node:crypto'

import Hyperswarm from 'hyperswarm'

export const P2P_PING_CODE_PATTERN = /^\d{6}$/
export const P2P_PING_TOPIC_DOMAIN = 'most-box-p2p-ping-v1'
export const P2P_PING_HOST_TTL_MS = 2 * 60 * 1000
export const P2P_PING_JOIN_TIMEOUT_MS = 45 * 1000

const PROOF_KEY_DOMAIN = 'most-box-p2p-ping-proof-key-v1'
const PROOF_DOMAIN = 'most-box-p2p-ping-proof-v1'
const MAX_FRAME_BYTES = 4096
const MAX_RECORDS = 20
const TERMINAL_STATUSES = new Set(['success', 'failed', 'cancelled', 'expired'])

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

function proofKey(code) {
  return createHash('sha256')
    .update(PROOF_KEY_DOMAIN)
    .update('\0')
    .update(code)
    .digest()
}

function createProof(code, type, nonce) {
  return createHmac('sha256', proofKey(code))
    .update(PROOF_DOMAIN)
    .update('\0')
    .update(type)
    .update('\0')
    .update(nonce)
    .digest('hex')
}

function createFrame(code, type, nonce) {
  return {
    type,
    version: 1,
    nonce,
    proof: createProof(code, type, nonce),
  }
}

function isValidFrame(code, frame, expectedType, expectedNonce) {
  return (
    frame &&
    frame.type === expectedType &&
    frame.version === 1 &&
    frame.nonce === expectedNonce &&
    typeof frame.proof === 'string' &&
    frame.proof === createProof(code, expectedType, expectedNonce)
  )
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

export function deriveP2PPingTopic(code) {
  validateP2PPingCode(code)
  return createHash('sha256')
    .update(P2P_PING_TOPIC_DOMAIN)
    .update('\0')
    .update(code)
    .digest()
}

export function encodeP2PPingFrame(code, type, nonce) {
  return `${JSON.stringify(createFrame(code, type, nonce))}\n`
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
    const record = {
      id,
      role,
      code,
      status: 'preparing',
      phase: 'preparing',
      createdAt: new Date(createdAtMs).toISOString(),
      expiresAt: new Date(
        createdAtMs + (role === 'host' ? this.#hostTtlMs : this.#joinTimeoutMs)
      ).toISOString(),
      completedAt: null,
      elapsedMs: null,
      discoveredPeers: 0,
      localPeerKey: null,
      remotePeerKey: null,
      errorCode: null,
      errorMessage: null,
    }
    const session = {
      record,
      createdAtMs,
      swarm: null,
      discovery: null,
      stream: null,
      candidateStreams: new Map(),
      timer: null,
      cleanupTimer: null,
      nonce: null,
      cleanedUp: false,
    }

    this.#activeSession = session
    this.#records.set(id, session)
    this.#trimRecords()
    this.#emit(session)
    session.timer = setTimeout(
      () => this.#handleTimeout(session),
      role === 'host' ? this.#hostTtlMs : this.#joinTimeoutMs
    )
    void this.#run(session)
    return cloneRecord(record)
  }

  get(id) {
    const session = this.#records.get(id)
    return session ? cloneRecord(session.record) : null
  }

  cancel(id) {
    const session = this.#records.get(id)
    if (!session) return null
    if (!isTerminal(session.record.status)) {
      this.#finish(session, 'cancelled', 'CANCELLED', 'P2P Ping was cancelled')
    }
    return cloneRecord(session.record)
  }

  async destroy() {
    const sessions = [...this.#records.values()]
    for (const session of sessions) {
      if (!isTerminal(session.record.status)) {
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

  async #run(session) {
    try {
      const swarm = this.#createSwarm(this.#swarmOptions)
      session.swarm = swarm
      session.record.localPeerKey = toHex(swarm.keyPair?.publicKey)
      swarm.on('connection', (connection, info) =>
        this.#handleConnection(session, connection, info)
      )
      swarm.on('update', () => this.#handleUpdate(session))
      swarm.on('error', error => this.#handleSwarmError(session, error))

      session.discovery = swarm.join(deriveP2PPingTopic(session.record.code), {
        server: session.record.role === 'host',
        client: session.record.role === 'join',
      })
      const announced = await session.discovery.flushed()
      if (announced === false) throw new Error('DHT announce did not flush')
      if (
        isTerminal(session.record.status) ||
        session.stream ||
        session.candidateStreams.size > 0
      )
        return

      this.#setStatus(
        session,
        session.record.role === 'host' ? 'waiting' : 'discovering'
      )
    } catch (error) {
      this.#finish(
        session,
        'failed',
        'ANNOUNCE_FAILED',
        error.message || 'DHT announce failed'
      )
    }
  }

  #handleUpdate(session) {
    if (isTerminal(session.record.status) || !session.swarm) return
    const discoveredPeers = session.swarm.peers?.size || 0
    if (discoveredPeers !== session.record.discoveredPeers) {
      session.record.discoveredPeers = discoveredPeers
      if (
        session.record.role === 'join' &&
        discoveredPeers > 0 &&
        session.record.status === 'discovering'
      ) {
        this.#setStatus(session, 'connecting')
      } else {
        this.#emit(session)
      }
    }
  }

  #handleSwarmError(session, error) {
    if (isTerminal(session.record.status)) return
    if (session.record.status === 'preparing') {
      this.#finish(
        session,
        'failed',
        'ANNOUNCE_FAILED',
        error.message || 'DHT announce failed'
      )
    }
  }

  #handleConnection(session, connection, info = {}) {
    if (
      isTerminal(session.record.status) ||
      (session.record.role === 'join' && session.stream)
    ) {
      connection.destroy()
      return
    }

    const remotePeerKey = toHex(connection.remotePublicKey || info.publicKey)
    const candidate = {
      nonce:
        session.record.role === 'host'
          ? this.#randomBytes(16).toString('hex')
          : null,
      remotePeerKey,
    }
    if (session.record.role === 'host') {
      session.candidateStreams.set(connection, candidate)
    } else {
      session.stream = connection
      session.record.remotePeerKey = remotePeerKey
    }
    session.record.discoveredPeers = Math.max(1, session.record.discoveredPeers)
    this.#setStatus(session, 'verifying')

    const decode = createP2PPingFrameDecoder(
      frame => this.#handleFrame(session, connection, candidate, frame),
      error => this.#handleConnectionFailure(session, connection, error)
    )
    connection.on('data', decode)
    connection.on('error', error => {
      this.#handleConnectionFailure(session, connection, error)
    })
    connection.on('close', () => {
      if (session.record.role === 'host') {
        session.candidateStreams.delete(connection)
        if (
          !isTerminal(session.record.status) &&
          session.candidateStreams.size === 0
        ) {
          this.#setStatus(session, 'waiting')
        }
      } else if (!isTerminal(session.record.status)) {
        this.#finish(
          session,
          'failed',
          'PING_FAILED',
          'P2P Ping stream closed before verification'
        )
      }
    })

    if (session.record.role === 'host') {
      this.#writeFrame(session, connection, 'p2p-ping', candidate.nonce)
    }
  }

  #handleFrame(session, connection, candidate, frame) {
    if (isTerminal(session.record.status)) return
    const { code, role } = session.record

    if (role === 'join' && !session.nonce) {
      if (
        !frame ||
        frame.type !== 'p2p-ping' ||
        typeof frame.nonce !== 'string' ||
        !/^[0-9a-f]{32}$/.test(frame.nonce) ||
        !isValidFrame(code, frame, 'p2p-ping', frame.nonce)
      ) {
        this.#finish(session, 'failed', 'PING_FAILED', 'Ping proof is invalid')
        return
      }
      session.nonce = frame.nonce
      this.#writeFrame(session, connection, 'p2p-pong', session.nonce)
      return
    }

    if (
      role === 'host' &&
      isValidFrame(code, frame, 'p2p-pong', candidate.nonce)
    ) {
      session.record.remotePeerKey = candidate.remotePeerKey
      this.#writeFrame(session, connection, 'p2p-ack', candidate.nonce)
      this.#finish(session, 'success')
      return
    }

    if (
      role === 'join' &&
      isValidFrame(code, frame, 'p2p-ack', session.nonce)
    ) {
      this.#finish(session, 'success')
      return
    }

    if (role === 'host') {
      this.#rejectCandidate(session, connection)
    } else {
      this.#finish(
        session,
        'failed',
        'PING_FAILED',
        'Ping/Pong proof is invalid'
      )
    }
  }

  #writeFrame(session, connection, type, nonce) {
    try {
      connection.write(encodeP2PPingFrame(session.record.code, type, nonce))
    } catch (error) {
      this.#handleConnectionFailure(session, connection, error)
    }
  }

  #handleConnectionFailure(session, connection, error) {
    if (isTerminal(session.record.status)) return
    if (session.record.role === 'host') {
      this.#rejectCandidate(session, connection)
      return
    }
    this.#finish(
      session,
      'failed',
      'PING_FAILED',
      error.message || 'P2P Ping stream failed'
    )
  }

  #rejectCandidate(session, connection) {
    if (!session.candidateStreams.has(connection)) return
    session.candidateStreams.delete(connection)
    connection.destroy()
    if (
      !isTerminal(session.record.status) &&
      session.candidateStreams.size === 0
    ) {
      this.#setStatus(session, 'waiting')
    }
  }

  #handleTimeout(session) {
    if (isTerminal(session.record.status)) return
    if (session.record.role === 'host') {
      this.#finish(
        session,
        'expired',
        'TIMEOUT',
        'Ping code expired before a peer connected'
      )
      return
    }

    if (session.record.discoveredPeers === 0) {
      this.#finish(
        session,
        'failed',
        'PEER_NOT_FOUND',
        'No peer was discovered for this Ping code'
      )
    } else if (!session.stream) {
      this.#finish(
        session,
        'failed',
        'CONNECTION_FAILED',
        'A peer was found but a connection was not established'
      )
    } else {
      this.#finish(
        session,
        'failed',
        'TIMEOUT',
        'Ping/Pong verification timed out'
      )
    }
  }

  #setStatus(session, status) {
    if (isTerminal(session.record.status)) return
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
    session.record.phase = status === 'success' ? 'success' : completedPhase
    session.record.completedAt = new Date(this.#now()).toISOString()
    session.record.elapsedMs = Math.max(0, this.#now() - session.createdAtMs)
    session.record.errorCode = errorCode
    session.record.errorMessage = errorMessage
    if (this.#activeSession === session) this.#activeSession = null
    this.#emit(session)
    session.cleanupTimer = setTimeout(
      () => void this.#cleanup(session),
      status === 'success' ? 500 : 0
    )
  }

  async #cleanup(session) {
    if (session.cleanedUp) return
    session.cleanedUp = true
    clearTimeout(session.timer)
    clearTimeout(session.cleanupTimer)
    const tasks = []
    if (session.discovery?.destroy)
      tasks.push(Promise.resolve(session.discovery.destroy()))
    if (session.stream?.destroy) session.stream.destroy()
    for (const connection of session.candidateStreams.keys())
      connection.destroy()
    session.candidateStreams.clear()
    if (session.swarm?.destroy)
      tasks.push(Promise.resolve(session.swarm.destroy()))
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
