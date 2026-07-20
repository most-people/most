function resolvePath(value, pathApi) {
  if (!value || !pathApi?.resolve) return ''
  try {
    return pathApi.resolve(String(value))
  } catch {
    return ''
  }
}

function comparePath(value, pathApi) {
  const resolved = resolvePath(value, pathApi)
  return pathApi?.sep === '\\' ? resolved.toLowerCase() : resolved
}

export function isPathInsideDirectory(candidate, parent, pathApi) {
  const resolvedCandidate = resolvePath(candidate, pathApi)
  const resolvedParent = resolvePath(parent, pathApi)
  if (!resolvedCandidate || !resolvedParent) return false

  const candidateForCompare = comparePath(resolvedCandidate, pathApi)
  const parentForCompare = comparePath(resolvedParent, pathApi)
  if (candidateForCompare === parentForCompare) return false

  return candidateForCompare.startsWith(`${parentForCompare}${pathApi.sep}`)
}

export function getInternalHoldingCleanupPaths(record = {}, pathApi) {
  const cleanupPath = resolvePath(record.localPath, pathApi)
  if (
    !cleanupPath ||
    !isPathInsideDirectory(cleanupPath, record.downloadPath, pathApi)
  ) {
    return []
  }
  return [cleanupPath]
}

export function removeHoldingRecord(holdings, cid) {
  const list = Array.isArray(holdings) ? holdings : []
  const nextHoldings = list.filter(holding => holding?.cid !== cid)
  return {
    holdings: nextHoldings,
    removed: nextHoldings.length !== list.length,
  }
}
