export const COMMANDS = Object.freeze({
  NODE_START: 'node.start',
  NODE_STOP: 'node.stop',
  FILE_PUBLISH: 'file.publish',
  FILE_DOWNLOAD: 'file.download',
  FILE_LIST_HOLDINGS: 'file.listHoldings',
  FILE_EXPORT: 'file.export',
  LOG_LIST: 'log.list',
})

export const EVENTS = Object.freeze({
  NODE_READY: 'node.ready',
  NETWORK_STATUS: 'network.status',
  SEED_STATUS: 'seed.status',
  PUBLISH_PROGRESS: 'publish.progress',
  PUBLISH_SUCCESS: 'publish.success',
  DOWNLOAD_PROGRESS: 'download.progress',
  DOWNLOAD_SUCCESS: 'download.success',
  ERROR: 'error',
  SNAPSHOT: 'snapshot',
})
