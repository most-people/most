import { parseMostLink, type IncomingMostLink } from './protocol'
import { getStoreDownloadPolicyErrorKey } from './storeFilePolicy'

export type ReceiveInspection =
  | { kind: 'ready'; intent: IncomingMostLink }
  | { kind: 'blocked'; errorKey: string }

export function inspectReceiveLink(link: string): ReceiveInspection {
  const normalizedLink = link.trim()
  const parsed = parseMostLink(normalizedLink)
  const errorKey = getStoreDownloadPolicyErrorKey(parsed.fileName)
  if (errorKey) return { kind: 'blocked', errorKey }
  return { kind: 'ready', intent: { link: normalizedLink, ...parsed } }
}
