export const MOST_PROTOCOL = 'most:'
export const HYPERDRIVE_CID_PATH_PREFIX = '/'
const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567'

function encodeBase32(bytes) {
  let result = ''
  const bitLength = bytes.length * 8

  for (let bitOffset = 0; bitOffset < bitLength; bitOffset += 5) {
    let value = 0
    for (let bit = 0; bit < 5; bit += 1) {
      const sourceBit = bitOffset + bit
      value <<= 1
      if (sourceBit < bitLength) {
        value |= (bytes[Math.floor(sourceBit / 8)] >> (7 - (sourceBit % 8))) & 1
      }
    }
    result += BASE32_ALPHABET[value]
  }

  return result
}

export function createRandomChannelId(fillRandomBytes) {
  const bytes = new Uint8Array(16)
  fillRandomBytes(bytes)
  return encodeBase32(bytes)
}

export function createEvent(type, payload = {}, requestId = '') {
  const event = {
    type,
    payload,
    time: new Date().toISOString(),
  }
  if (requestId) event.requestId = requestId
  return event
}

export function encodeEvent(event) {
  return Buffer.from(`${JSON.stringify(event)}\n`)
}

export function createJsonLineParser(onMessage, onError = () => {}) {
  let readBuffer = ''

  return data => {
    readBuffer += Buffer.from(data).toString('utf8')

    let newlineIndex = readBuffer.indexOf('\n')
    while (newlineIndex !== -1) {
      const line = readBuffer.slice(0, newlineIndex).trim()
      readBuffer = readBuffer.slice(newlineIndex + 1)

      if (line) {
        try {
          onMessage(JSON.parse(line))
        } catch (error) {
          onError(error, line)
        }
      }

      newlineIndex = readBuffer.indexOf('\n')
    }
  }
}

export function getHyperdriveCidPath(cid) {
  return `${HYPERDRIVE_CID_PATH_PREFIX}${cid}`
}
