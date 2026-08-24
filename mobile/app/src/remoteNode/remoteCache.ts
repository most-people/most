export function cacheMatchesCid(expectedCid: string, actualCid: string) {
  return Boolean(expectedCid) && expectedCid === actualCid
}
