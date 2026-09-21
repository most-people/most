/**
 * Pure chat display and mention-rendering helpers.
 *
 * Extracted from `ChatPage.tsx`. They were written as component-scope functions
 * that closed over component state (`showAddressSuffix`, `userIdentity`,
 * `allMentionTargets`), which made them untestable. They take those values as
 * explicit parameters now, so the same logic is covered by
 * `src/tests/chatDisplay.test.ts`.
 */
import type { ChannelMention, ChannelMessage } from '~/lib/channelApi'
import { shortAddress } from '~/lib/format'
import {
  completeMentionDraftFromTargets,
  messageMentionsAddress,
} from '~/lib/chatMentions.js'
import { hasAddressSuffix, type MentionTarget } from './chatPageModel'

/** Address suffix appended to a display name, e.g. `#A1B2`. */
const ADDRESS_SUFFIX_PATTERN = /#[a-fA-F0-9]{4}$/

/**
 * Renders a member name for display.
 *
 * Falls back to the short address, then to `Unknown`. When `showAddressSuffix`
 * is false the stored `#ABCD` suffix is stripped so the name reads cleanly.
 */
export function formatDisplayName(
  name: string | undefined,
  address: string | undefined,
  showAddressSuffix: boolean
) {
  const displayName = String(name || '').trim()
  if (!displayName) return shortAddress(address) || 'Unknown'
  if (!showAddressSuffix) return displayName.replace(ADDRESS_SUFFIX_PATTERN, '')
  if (hasAddressSuffix(displayName)) return displayName
  return address
    ? `${displayName}#${address.slice(-4).toUpperCase()}`
    : displayName
}

/**
 * Returns the mentions that can actually be highlighted in a message body.
 *
 * Takes the message's own mention list, drops the entries whose offsets are out
 * of range, unsorted, overlapping, or whose slice no longer equals
 * `@<label>` (the text was edited since the mention was recorded), then falls
 * back to scanning the content against the channel's mention targets when the
 * message carries no usable mention list.
 */
export function getRenderableMentions(
  message: Pick<ChannelMessage, 'content' | 'mentions'>,
  mentionTargets: MentionTarget[]
): ChannelMention[] {
  const content = String(message.content || '')
  const result: ChannelMention[] = []

  if (Array.isArray(message.mentions) && message.mentions.length > 0) {
    for (const mention of [...message.mentions].sort(
      (left, right) => left.start - right.start || left.end - right.end
    )) {
      if (mention.start < 0 || mention.end <= mention.start) continue
      if (mention.start < (result[result.length - 1]?.end || 0)) continue
      if (mention.end > content.length) continue
      if (content.slice(mention.start, mention.end) !== `@${mention.label}`) {
        continue
      }
      result.push(mention)
    }
    return result
  }

  return completeMentionDraftFromTargets(
    { content, mentions: [] },
    mentionTargets
  ).mentions
}

/** Whether a message mentions the given address. */
export function isMessageMentioningCurrentUser(
  message: ChannelMessage,
  address: string | undefined
) {
  return messageMentionsAddress(message, address)
}
