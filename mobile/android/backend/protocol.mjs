export const MOST_PROTOCOL = 'most:'
export const HYPERDRIVE_CID_PATH_PREFIX = '/'

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
