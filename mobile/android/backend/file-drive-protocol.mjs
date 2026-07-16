import b4a from 'b4a'
import Protomux from 'protomux'

export const FILE_DRIVE_PROTOCOL = 'mostbox/file/1'
export const MAX_FILE_DRIVE_MESSAGE_BYTES = 1024
export const MAX_FILE_REQUESTS_PER_CONNECTION = 32

const DRIVE_KEY_PATTERN = /^[a-f0-9]{64}$/

function normalizeCid(value) {
  const cid = String(value || '').trim()
  return cid.length > 0 && cid.length <= 128 ? cid : ''
}

export function getConnectionTopicSet(info) {
  if (!Array.isArray(info?.topics) || info.topics.length === 0) return null
  return new Set(info.topics.map(topic => b4a.toString(topic, 'hex')))
}

function normalizeOffer(value) {
  const cid = normalizeCid(value?.cid)
  const driveKey = String(value?.driveKey || '')
    .trim()
    .toLowerCase()
  const driveVersion = Number(value?.driveVersion)
  if (!cid || !DRIVE_KEY_PATTERN.test(driveKey)) return null
  if (!Number.isSafeInteger(driveVersion) || driveVersion <= 0) return null
  return { type: 'offer', cid, driveKey, driveVersion }
}

export function openFileDriveProtocol(stream, options = {}) {
  const existingMux = stream?.noiseStream?.userData
  const mux = Protomux.isProtomux(existingMux)
    ? existingMux
    : Protomux.from(stream)
  const requestedByLocal = new Set()
  const requestedByRemote = new Set()
  const sentOffers = new Set()
  const receivedOffers = new Set()
  let wireMessage = null
  let closed = false

  const channel = mux.createChannel({
    protocol: FILE_DRIVE_PROTOCOL,
    onclose() {
      closed = true
    },
  })
  if (!channel) return null

  const send = value => {
    if (closed || !wireMessage || !value) return false
    const buffer = b4a.from(JSON.stringify(value))
    if (buffer.byteLength > MAX_FILE_DRIVE_MESSAGE_BYTES) return false
    return wireMessage.send(buffer, channel)
  }

  const sendOffer = offer => {
    if (!offer || !requestedByRemote.has(offer.cid)) return false
    const id = `${offer.cid}:${offer.driveKey}:${offer.driveVersion}`
    if (sentOffers.has(id)) return true
    if (!send(offer)) return false
    sentOffers.add(id)
    return true
  }

  wireMessage = channel.addMessage({
    onmessage(buffer) {
      if (!buffer || buffer.byteLength > MAX_FILE_DRIVE_MESSAGE_BYTES) return
      let value
      try {
        value = JSON.parse(b4a.toString(buffer))
      } catch {
        return
      }
      if (value?.type === 'request') {
        const cid = normalizeCid(value.cid)
        if (!cid) return
        if (requestedByRemote.has(cid)) return
        if (requestedByRemote.size >= MAX_FILE_REQUESTS_PER_CONNECTION) return
        requestedByRemote.add(cid)
        Promise.resolve(options.onRequest?.(cid))
          .then(offer => {
            sendOffer(normalizeOffer(offer))
          })
          .catch(() => {})
        return
      }
      if (value?.type === 'offer') {
        const offer = normalizeOffer(value)
        if (!offer || !requestedByLocal.has(offer.cid)) return
        const id = `${offer.cid}:${offer.driveKey}:${offer.driveVersion}`
        if (receivedOffers.has(id)) return
        receivedOffers.add(id)
        Promise.resolve(options.onOffer?.(offer)).catch(() => {})
      }
    },
  })

  channel.open()
  return {
    channel,
    request(cidInput) {
      const cid = normalizeCid(cidInput)
      if (!cid) return false
      if (requestedByLocal.has(cid)) return true
      if (requestedByLocal.size >= MAX_FILE_REQUESTS_PER_CONNECTION) {
        return false
      }
      if (!send({ type: 'request', cid })) return false
      requestedByLocal.add(cid)
      return true
    },
    offer(value) {
      return sendOffer(normalizeOffer(value))
    },
    requestedByRemote,
  }
}
