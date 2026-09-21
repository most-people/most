/**
 * Chat composer actions.
 *
 * Extracted from `ChatPage.tsx`: draft editing, caret reporting, the mention
 * menu keyboard flow, candidate insertion, and send.
 *
 * Composer state and the derived mention trigger/candidates stay owned by the
 * caller: the trigger depends on the active channel's members, which are derived
 * during render, so the hook receives the current values instead of recomputing
 * them.
 */
import { useCallback } from 'react'

import {
  completeMentionDraftFromTargets,
  finalizeMentionDraftForSend,
  insertMentionIntoDraft,
  updateMentionDraft,
} from '~/lib/chatMentions.js'
import type { ChannelMention } from '~/lib/channelApi'
import type {
  MentionCandidate,
  MentionDraft,
  MentionTarget,
} from './chatPageModel'

/** Caret range reported by the composer. */
export interface ComposerSelection {
  start: number
  end: number
}

/** The active `@` token, as computed by the caller during render. */
export interface ComposerMentionTrigger {
  start: number
  end: number
  query: string
}

interface UseChatComposerOptions {
  /** Composer text. */
  channelInput: string
  setChannelInput: (value: string) => void
  /** Mentions recorded for the current draft. */
  channelMentions: ChannelMention[]
  setChannelMentions: (mentions: ChannelMention[]) => void
  composerSelection: ComposerSelection
  setComposerSelection: (selection: ComposerSelection) => void
  setDismissedMentionTriggerKey: (key: string) => void
  dismissedMentionTriggerKey: string
  mentionTriggerKey: string
  mentionSelectedIndex: number
  setMentionSelectedIndex: (
    updater: number | ((previous: number) => number)
  ) => void
  isMentionMenuOpen: boolean
  mentionTrigger: ComposerMentionTrigger | null
  mentionCandidates: MentionCandidate[]
  /** Mention targets for the active channel, used to complete typed mentions. */
  composerMentionTargets: MentionTarget[]
  composerInputRef: React.RefObject<HTMLTextAreaElement | null>
  isSendingChannelMessageRef: React.RefObject<boolean>
  setIsSendingChannelMessage: (value: boolean) => void
  sendChannelMessage: (
    content: string,
    attachment: undefined,
    mentions: ChannelMention[]
  ) => Promise<unknown>
}

export function useChatComposer(options: UseChatComposerOptions) {
  const {
    channelInput,
    setChannelInput,
    channelMentions,
    setChannelMentions,
    setComposerSelection,
    setDismissedMentionTriggerKey,
    mentionTriggerKey,
    mentionSelectedIndex,
    setMentionSelectedIndex,
    isMentionMenuOpen,
    mentionTrigger,
    mentionCandidates,
    composerMentionTargets,
    composerInputRef,
    isSendingChannelMessageRef,
    setIsSendingChannelMessage,
    sendChannelMessage,
  } = options

  const focusComposerAt = useCallback(
    (caret: number) => {
      window.requestAnimationFrame(() => {
        composerInputRef.current?.focus()
        composerInputRef.current?.setSelectionRange(caret, caret)
        setComposerSelection({ start: caret, end: caret })
      })
    },
    [composerInputRef, setComposerSelection]
  )

  const handleChannelInputChange = useCallback(
    (
      value: string,
      selectionStart = value.length,
      selectionEnd = selectionStart
    ) => {
      const draft = updateMentionDraft(
        { content: channelInput, mentions: channelMentions },
        value
      ) as MentionDraft
      setChannelInput(draft.content)
      setChannelMentions(draft.mentions)
      setComposerSelection({ start: selectionStart, end: selectionEnd })
      setDismissedMentionTriggerKey('')
    },
    [
      channelInput,
      channelMentions,
      setChannelInput,
      setChannelMentions,
      setComposerSelection,
      setDismissedMentionTriggerKey,
    ]
  )

  const handleComposerSelectionChange = useCallback(
    (selectionStart: number, selectionEnd: number) => {
      setComposerSelection({ start: selectionStart, end: selectionEnd })
    },
    [setComposerSelection]
  )

  const selectMentionCandidate = useCallback(
    (index = mentionSelectedIndex) => {
      if (!mentionTrigger || mentionCandidates.length === 0) return false
      if (index < 0) return false
      const candidate =
        mentionCandidates[
          Math.max(0, Math.min(index, mentionCandidates.length - 1))
        ]
      if (!candidate) return false

      const result = insertMentionIntoDraft(
        { content: channelInput, mentions: channelMentions },
        candidate,
        mentionTrigger.start,
        mentionTrigger.end
      ) as { draft: MentionDraft; caret: number }
      setChannelInput(result.draft.content)
      setChannelMentions(result.draft.mentions)
      setDismissedMentionTriggerKey('')
      setMentionSelectedIndex(-1)
      focusComposerAt(result.caret)
      return true
    },
    [
      channelInput,
      channelMentions,
      focusComposerAt,
      mentionCandidates,
      mentionSelectedIndex,
      mentionTrigger,
      setChannelInput,
      setChannelMentions,
      setDismissedMentionTriggerKey,
      setMentionSelectedIndex,
    ]
  )

  const handleComposerKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!isMentionMenuOpen) return false

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setMentionSelectedIndex(index =>
          index < 0 ? 0 : (index + 1) % mentionCandidates.length
        )
        return true
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setMentionSelectedIndex(index =>
          index < 0
            ? mentionCandidates.length - 1
            : (index - 1 + mentionCandidates.length) % mentionCandidates.length
        )
        return true
      }

      if (event.key === 'Enter' || event.key === 'Tab') {
        if (mentionSelectedIndex < 0) return false
        event.preventDefault()
        return selectMentionCandidate()
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        setDismissedMentionTriggerKey(mentionTriggerKey)
        return true
      }

      return false
    },
    [
      isMentionMenuOpen,
      mentionCandidates.length,
      mentionSelectedIndex,
      mentionTriggerKey,
      selectMentionCandidate,
      setDismissedMentionTriggerKey,
      setMentionSelectedIndex,
    ]
  )

  const handleSendChannelMessage = useCallback(async () => {
    if (isSendingChannelMessageRef.current) return
    const finalized = finalizeMentionDraftForSend({
      content: channelInput,
      mentions: channelMentions,
    }) as MentionDraft
    const completed = completeMentionDraftFromTargets(
      finalized,
      composerMentionTargets
    ) as MentionDraft
    if (!completed.content) return
    isSendingChannelMessageRef.current = true
    setIsSendingChannelMessage(true)
    try {
      const sent = await sendChannelMessage(
        completed.content,
        undefined,
        completed.mentions
      )
      if (!sent) return
      setChannelInput('')
      setChannelMentions([])
      setComposerSelection({ start: 0, end: 0 })
      setDismissedMentionTriggerKey('')
      setMentionSelectedIndex(0)
    } finally {
      isSendingChannelMessageRef.current = false
      setIsSendingChannelMessage(false)
    }
  }, [
    channelInput,
    channelMentions,
    composerMentionTargets,
    isSendingChannelMessageRef,
    sendChannelMessage,
    setChannelInput,
    setChannelMentions,
    setComposerSelection,
    setDismissedMentionTriggerKey,
    setIsSendingChannelMessage,
    setMentionSelectedIndex,
  ])

  return {
    focusComposerAt,
    handleChannelInputChange,
    handleComposerSelectionChange,
    selectMentionCandidate,
    handleComposerKeyDown,
    handleSendChannelMessage,
  }
}
