export const MOST_PROTOCOL = 'most:'
export const HYPERDRIVE_CID_PATH_PREFIX = '/'

export function createEvent(type, payload = {}) {
  return {
    type,
    payload,
    time: new Date().toISOString(),
  }
}

export function encodeEvent(event) {
  return Buffer.from(`${JSON.stringify(event)}\n`)
}

export function getHyperdriveCidPath(cid) {
  return `${HYPERDRIVE_CID_PATH_PREFIX}${cid}`
}
