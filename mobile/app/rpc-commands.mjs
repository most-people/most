export const COMMANDS = Object.freeze({
  NODE_START: 'node.start',
  NODE_STOP: 'node.stop',
  P2P_PING_START: 'p2p.ping.start',
  P2P_PING_CANCEL: 'p2p.ping.cancel',
  FILE_PUBLISH: 'file.publish',
  FILE_DOWNLOAD: 'file.download',
  FILE_CANCEL_DOWNLOAD: 'file.cancelDownload',
  FILE_EXPORT: 'file.export',
  FILE_DELETE_HOLDING: 'file.deleteHolding',
})

export const EVENTS = Object.freeze({
  NODE_READY: 'node.ready',
  P2P_PING_STATUS: 'p2p.ping.status',
  PUBLISH_SUCCESS: 'publish.success',
  DOWNLOAD_SUCCESS: 'download.success',
  DOWNLOAD_CANCELLED: 'download.cancelled',
  FILE_EXPORT_SUCCESS: 'file.export.success',
  FILE_DELETE_HOLDING_SUCCESS: 'file.deleteHolding.success',
  ERROR: 'error',
  SNAPSHOT: 'snapshot',
})
