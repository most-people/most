export function removeHoldingRecord(holdings, cid) {
  const list = Array.isArray(holdings) ? holdings : []
  const nextHoldings = list.filter(holding => holding?.cid !== cid)
  return {
    holdings: nextHoldings,
    removed: nextHoldings.length !== list.length,
  }
}
