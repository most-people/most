const NODE_LOG_FILTERS = {
  join: ['join', 'joined', 'topic'],
  pull: ['pull', 'p2p'],
  verify: ['verify', 'verified', 'integrity', 'download:success'],
  serve: ['seed', 'seeding', 'holding', 'publish:success', 'topic:joined'],
  error: ['error', 'failed', 'fail'],
}

function getNodeLogSearchText(log = {}) {
  let dataText = ''
  try {
    dataText = JSON.stringify(log.data || {})
  } catch {}

  return [log.level, log.event, log.message, dataText]
    .map(value => String(value || '').toLowerCase())
    .join(' ')
}

function matchesNodeLogFilter(log, filter) {
  const normalized = String(filter || 'all')
    .trim()
    .toLowerCase()
  if (!normalized || normalized === 'all') return true

  const text = getNodeLogSearchText(log)
  if (normalized === 'error') {
    return (
      log.level === 'error' ||
      NODE_LOG_FILTERS.error.some(term => text.includes(term))
    )
  }

  const terms = NODE_LOG_FILTERS[normalized] || [normalized]
  return terms.some(term => text.includes(term))
}

export function listFilteredNodeLogs(nodeLogger, options = {}) {
  const limit = Math.max(1, Math.min(Number(options.limit) || 100, 1000))
  const filter = String(options.filter || 'all')
    .trim()
    .toLowerCase()
  const query = String(options.query || '')
    .trim()
    .toLowerCase()
  const logs = nodeLogger
    .list(1000)
    .filter(log => matchesNodeLogFilter(log, filter))
    .filter(log => !query || getNodeLogSearchText(log).includes(query))
    .slice(0, limit)

  return { filter, query, logs }
}
