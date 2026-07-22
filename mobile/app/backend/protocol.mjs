export const MOST_PROTOCOL = 'most:'
export const HYPERDRIVE_CID_PATH_PREFIX = '/'
const BASE64URL_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

function encodeBase64Url(bytes) {
  let result = ''

  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index]
    const second = bytes[index + 1]
    const third = bytes[index + 2]
    const block = (first << 16) | ((second || 0) << 8) | (third || 0)

    result += BASE64URL_ALPHABET[(block >> 18) & 63]
    result += BASE64URL_ALPHABET[(block >> 12) & 63]
    if (index + 1 < bytes.length) {
      result += BASE64URL_ALPHABET[(block >> 6) & 63]
    }
    if (index + 2 < bytes.length) {
      result += BASE64URL_ALPHABET[block & 63]
    }
  }

  return result
}

export function createRandomChannelId(fillRandomBytes) {
  const bytes = new Uint8Array(16)
  fillRandomBytes(bytes)
  return encodeBase64Url(bytes)
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
