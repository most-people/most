import fs from 'node:fs'
import path from 'node:path'

const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER)

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
    const bytes = Math.ceil(Number(reservation?.bytes || 0))
    if (!Number.isSafeInteger(bytes) || bytes < 0) {
      throw new TypeError('Storage reservation bytes must be a safe integer')
    }
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
    const requiredBytes = current.requiredBytes + bytes
    if (!Number.isSafeInteger(requiredBytes)) {
      throw new TypeError('Combined storage reservation exceeds safe integer')
    }
    current.requiredBytes = requiredBytes
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
