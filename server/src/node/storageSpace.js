import fs from 'node:fs'
import path from 'node:path'

const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER)

function toSafeByteCount(value, label) {
  const bytes = Math.ceil(Number(value ?? 0))
  if (!Number.isSafeInteger(bytes) || bytes < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`)
  }
  return bytes
}

function addSafeByteCounts(...values) {
  const total = values.reduce((sum, value) => sum + value, 0)
  if (!Number.isSafeInteger(total)) {
    throw new TypeError('Combined storage reservation exceeds safe integer')
  }
  return total
}

function toSafeNumber(value) {
  const number = typeof value === 'bigint' ? value : BigInt(value)
  return Number(number > MAX_SAFE_BIGINT ? MAX_SAFE_BIGINT : number)
}

function findExistingPath(targetPath) {
  let current = path.resolve(targetPath)
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current)
    if (parent === current) {
      throw new Error(`No existing parent for storage path: ${targetPath}`)
    }
    current = parent
  }
  return current
}

export function getFilesystemSpace(targetPath) {
  const probePath = findExistingPath(targetPath)
  const fileStats = fs.statSync(probePath, { bigint: true })
  const filesystemStats = fs.statfsSync(probePath, { bigint: true })

  return {
    deviceId: fileStats.dev.toString(),
    probePath,
    totalBytes: toSafeNumber(filesystemStats.blocks * filesystemStats.bsize),
    availableBytes: toSafeNumber(
      filesystemStats.bavail * filesystemStats.bsize
    ),
  }
}

export function evaluateStorageReservations(
  reservations,
  probe = getFilesystemSpace
) {
  const volumes = new Map()

  for (const reservation of reservations || []) {
    const bytes = toSafeByteCount(
      reservation?.bytes,
      'Storage reservation bytes'
    )
    if (bytes === 0) continue

    const targetPath = String(reservation?.path || '').trim()
    if (!targetPath) throw new TypeError('Storage reservation path is required')
    const space = probe(targetPath)
    const current = volumes.get(space.deviceId) || {
      deviceId: space.deviceId,
      totalBytes: space.totalBytes,
      availableBytes: space.availableBytes,
      requiredBytes: 0,
      paths: [],
      labels: [],
    }
    current.requiredBytes = addSafeByteCounts(current.requiredBytes, bytes)
    current.availableBytes = Math.min(
      current.availableBytes,
      space.availableBytes
    )
    current.paths.push(targetPath)
    if (reservation.label) current.labels.push(String(reservation.label))
    volumes.set(space.deviceId, current)
  }

  const results = [...volumes.values()].map(volume => ({
    ...volume,
    accepted: volume.requiredBytes <= volume.availableBytes,
  }))
  return {
    accepted: results.every(volume => volume.accepted),
    volumes: results,
  }
}

export class StorageReservationLedger {
  #probe
  #reservations = new Map()
  #logicalBytes = 0
  #volumeBytes = new Map()

  constructor(options = {}) {
    this.#probe = options.probe || getFilesystemSpace
  }

  reserve(options = {}) {
    const usedBytes = toSafeByteCount(options.usedBytes, 'Used storage bytes')
    const capacityBytes = toSafeByteCount(
      options.capacityBytes,
      'Storage capacity bytes'
    )
    const logicalBytes = toSafeByteCount(
      options.logicalBytes,
      'Logical reservation bytes'
    )
    const logicalRequiredBytes = addSafeByteCounts(
      usedBytes,
      this.#logicalBytes,
      logicalBytes
    )
    const logical = {
      usedBytes,
      pendingBytes: this.#logicalBytes,
      requestedBytes: logicalBytes,
      requiredBytes: logicalRequiredBytes,
      capacityBytes,
      accepted: logicalRequiredBytes <= capacityBytes,
    }

    if (!logical.accepted) {
      return { accepted: false, logical, volumes: [] }
    }

    const evaluated = evaluateStorageReservations(
      options.reservations,
      this.#probe
    )
    const volumes = evaluated.volumes.map(volume => {
      const pendingBytes = this.#volumeBytes.get(volume.deviceId) || 0
      const requestedLabels = volume.labels
      const requiredBytes = addSafeByteCounts(
        pendingBytes,
        volume.requiredBytes
      )
      return {
        ...volume,
        requestedBytes: volume.requiredBytes,
        requestedLabels,
        pendingBytes,
        requiredBytes,
        labels: [
          ...new Set([
            ...this.#getPendingLabels(volume.deviceId),
            ...volume.labels,
          ]),
        ],
        accepted: requiredBytes <= volume.availableBytes,
      }
    })

    if (volumes.some(volume => !volume.accepted)) {
      return { accepted: false, logical, volumes }
    }

    const id = Symbol('storage-reservation')
    const record = {
      logicalBytes,
      volumes: volumes.map(volume => ({
        deviceId: volume.deviceId,
        bytes: volume.requestedBytes,
        labels: volume.requestedLabels,
      })),
    }
    this.#reservations.set(id, record)
    this.#logicalBytes = addSafeByteCounts(this.#logicalBytes, logicalBytes)
    for (const volume of record.volumes) {
      this.#volumeBytes.set(
        volume.deviceId,
        addSafeByteCounts(
          this.#volumeBytes.get(volume.deviceId) || 0,
          volume.bytes
        )
      )
    }

    let released = false
    return {
      accepted: true,
      logical,
      volumes,
      release: () => {
        if (released) return false
        released = true
        this.#release(id)
        return true
      },
    }
  }

  clear() {
    this.#reservations.clear()
    this.#logicalBytes = 0
    this.#volumeBytes.clear()
  }

  #getPendingLabels(deviceId) {
    const labels = []
    for (const reservation of this.#reservations.values()) {
      const volume = reservation.volumes.find(
        item => item.deviceId === deviceId
      )
      if (volume) labels.push(...volume.labels)
    }
    return labels
  }

  #release(id) {
    const reservation = this.#reservations.get(id)
    if (!reservation) return

    this.#reservations.delete(id)
    this.#logicalBytes -= reservation.logicalBytes
    for (const volume of reservation.volumes) {
      const remaining =
        (this.#volumeBytes.get(volume.deviceId) || 0) - volume.bytes
      if (remaining > 0) {
        this.#volumeBytes.set(volume.deviceId, remaining)
      } else {
        this.#volumeBytes.delete(volume.deviceId)
      }
    }
  }
}
