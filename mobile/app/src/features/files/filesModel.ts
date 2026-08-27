import type { MobileHolding } from '../../mobileCore/types'

export type FileFilter = 'all' | 'active' | 'attention'

export function filterHoldings(
  holdings: MobileHolding[],
  query: string,
  filter: FileFilter
) {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  return holdings.filter(holding => {
    const matchesQuery =
      !normalizedQuery ||
      holding.fileName.toLocaleLowerCase().includes(normalizedQuery) ||
      holding.cid.toLocaleLowerCase().includes(normalizedQuery)
    if (!matchesQuery) return false
    if (filter === 'active') return holding.status === 'active'
    if (filter === 'attention') {
      return holding.status === 'error' || !holding.topicJoined
    }
    return true
  })
}
