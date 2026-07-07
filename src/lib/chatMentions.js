import { normalizeVisibleChatLabel } from '../../server/src/utils/chatLabels.js'

const WALLET_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/

function normalizeMentionAddress(address) {
  const normalized = String(address || '').trim().toLowerCase()
  return WALLET_ADDRESS_REGEX.test(normalized) ? normalized : ''
}

function normalizeMentionLabel(label) {
  return normalizeVisibleChatLabel(label)
}

function isWhitespace(value) {
  return /\s/.test(value)
}

function isMentionEndBoundary(value) {
  return (
    !value ||
    isWhitespace(value) ||
    /[.,!?;:，。！？、；：、)\]}」』]/u.test(value)
  )
}

function normalizeMentionLabelKey(label) {
  return normalizeMentionLabel(label).toLowerCase()
}

function isMentionRangeOverlapping(mentions, start, end) {
  return mentions.some(mention => start < mention.end && end > mention.start)
}

function getUniqueMentionTargets(targets) {
  const byLabel = new Map()

  for (const target of targets || []) {
    const address = normalizeMentionAddress(target?.address)
    const label = normalizeMentionLabel(target?.label)
    const key = normalizeMentionLabelKey(label)
    if (!address || !label || !key) continue

    const existing = byLabel.get(key)
    if (existing && existing.address !== address) {
      byLabel.set(key, { ...existing, ambiguous: true })
      continue
    }

    byLabel.set(key, {
      address,
      label,
      ambiguous: existing?.ambiguous === true,
    })
  }

  return [...byLabel.values()]
    .filter(target => !target.ambiguous)
    .sort((left, right) => right.label.length - left.label.length)
}

function getEditRange(previousContent, nextContent) {
  let start = 0
  while (
    start < previousContent.length &&
    start < nextContent.length &&
    previousContent[start] === nextContent[start]
  ) {
    start += 1
  }

  let previousEnd = previousContent.length
  let nextEnd = nextContent.length
  while (
    previousEnd > start &&
    nextEnd > start &&
    previousContent[previousEnd - 1] === nextContent[nextEnd - 1]
  ) {
    previousEnd -= 1
    nextEnd -= 1
  }

  return { start, previousEnd, nextEnd }
}

function normalizeMention(mention) {
  const address = normalizeMentionAddress(mention?.address)
  const label = normalizeMentionLabel(mention?.label)
  const start = Number(mention?.start)
  const end = Number(mention?.end)
  if (!address || !label) return null
  if (!Number.isInteger(start) || !Number.isInteger(end)) return null
  if (start < 0 || end <= start) return null
  return { address, label, start, end }
}

function isMentionRangeValid(content, mention) {
  return (
    mention.end <= content.length &&
    content.slice(mention.start, mention.end) === `@${mention.label}`
  )
}

function dedupeAndSortMentions(content, mentions) {
  const result = []
  const sorted = mentions
    .map(normalizeMention)
    .filter(Boolean)
    .sort((left, right) => left.start - right.start || left.end - right.end)

  for (const mention of sorted) {
    if (!isMentionRangeValid(content, mention)) continue
    const previous = result[result.length - 1]
    if (previous && mention.start < previous.end) continue
    result.push(mention)
  }

  return result
}

export function getMentionTrigger(content, selectionStart, selectionEnd = selectionStart) {
  if (selectionStart !== selectionEnd) return null
  const caret = Number(selectionStart)
  if (!Number.isInteger(caret) || caret < 0 || caret > content.length) {
    return null
  }

  let start = caret
  while (start > 0 && !isWhitespace(content[start - 1])) {
    start -= 1
  }

  if (content[start] !== '@') return null
  return {
    start,
    end: caret,
    query: content.slice(start + 1, caret),
  }
}

export function updateMentionDraft(previousDraft, nextContent) {
  const previousContent = String(previousDraft?.content || '')
  const content = String(nextContent || '')
  const { start, previousEnd, nextEnd } = getEditRange(previousContent, content)
  const delta = nextEnd - previousEnd
  const mentions = []

  for (const mention of previousDraft?.mentions || []) {
    const normalized = normalizeMention(mention)
    if (!normalized) continue

    if (normalized.end <= start) {
      mentions.push(normalized)
      continue
    }

    if (normalized.start >= previousEnd) {
      mentions.push({
        ...normalized,
        start: normalized.start + delta,
        end: normalized.end + delta,
      })
    }
  }

  return {
    content,
    mentions: dedupeAndSortMentions(content, mentions),
  }
}

export function insertMentionIntoDraft(previousDraft, target, start, end) {
  const content = String(previousDraft?.content || '')
  const address = normalizeMentionAddress(target?.address)
  const label = normalizeMentionLabel(target?.label)
  if (!address || !label) {
    return { draft: { content, mentions: previousDraft?.mentions || [] }, caret: end }
  }

  const insertStart = Math.max(0, Math.min(Number(start) || 0, content.length))
  const insertEnd = Math.max(insertStart, Math.min(Number(end) || insertStart, content.length))
  const mentionText = `@${label}`
  const replacement = `${mentionText} `
  const nextContent =
    content.slice(0, insertStart) + replacement + content.slice(insertEnd)
  const delta = replacement.length - (insertEnd - insertStart)
  const mentions = []

  for (const mention of previousDraft?.mentions || []) {
    const normalized = normalizeMention(mention)
    if (!normalized) continue

    if (normalized.end <= insertStart) {
      mentions.push(normalized)
      continue
    }

    if (normalized.start >= insertEnd) {
      mentions.push({
        ...normalized,
        start: normalized.start + delta,
        end: normalized.end + delta,
      })
    }
  }

  mentions.push({
    address,
    label,
    start: insertStart,
    end: insertStart + mentionText.length,
  })

  return {
    draft: {
      content: nextContent,
      mentions: dedupeAndSortMentions(nextContent, mentions),
    },
    caret: insertStart + replacement.length,
  }
}

export function finalizeMentionDraftForSend(draft) {
  const originalContent = String(draft?.content || '')
  const content = originalContent.trim()
  if (!content) return { content: '', mentions: [] }

  const leadingTrimmedLength = originalContent.length - originalContent.trimStart().length
  const mentions = (draft?.mentions || [])
    .map(mention => {
      const normalized = normalizeMention(mention)
      if (!normalized) return null
      return {
        ...normalized,
        start: normalized.start - leadingTrimmedLength,
        end: normalized.end - leadingTrimmedLength,
      }
    })
    .filter(Boolean)

  return {
    content,
    mentions: dedupeAndSortMentions(content, mentions),
  }
}

export function completeMentionDraftFromTargets(draft, targets = []) {
  const content = String(draft?.content || '')
  if (!content) return { content: '', mentions: [] }

  const mentions = dedupeAndSortMentions(content, draft?.mentions || [])
  const uniqueTargets = getUniqueMentionTargets(targets)
  if (uniqueTargets.length === 0) {
    return { content, mentions }
  }

  for (let index = 0; index < content.length; index += 1) {
    if (content[index] !== '@') continue
    if (index > 0 && !isWhitespace(content[index - 1])) continue

    for (const target of uniqueTargets) {
      const end = index + 1 + target.label.length
      const typedLabel = content.slice(index + 1, end)
      if (typedLabel.length !== target.label.length) continue
      if (
        normalizeMentionLabelKey(typedLabel) !==
        normalizeMentionLabelKey(target.label)
      ) {
        continue
      }
      if (!isMentionEndBoundary(content[end])) continue
      if (isMentionRangeOverlapping(mentions, index, end)) continue

      mentions.push({
        address: target.address,
        label: normalizeMentionLabel(typedLabel),
        start: index,
        end,
      })
      index = end - 1
      break
    }
  }

  return {
    content,
    mentions: dedupeAndSortMentions(content, mentions),
  }
}

export function messageMentionsAddress(message, address) {
  const normalizedAddress = normalizeMentionAddress(address)
  if (!normalizedAddress || !Array.isArray(message?.mentions)) return false
  return message.mentions.some(
    mention => normalizeMentionAddress(mention?.address) === normalizedAddress
  )
}
