import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { act, renderHook } from '@testing-library/react'

import type { ChannelMention } from '~/lib/channelApi'
import {
  useChatComposer,
  type ComposerMentionTrigger,
} from '~/features/chat/useChatComposer'
import type { MentionCandidate } from '~/features/chat/chatPageModel'

const MENTION: ChannelMention = {
  address: '0x1234567890abcdef1234567890abcdef12345678',
  label: 'Alice',
  start: 3,
  end: 9,
}

const candidate = (label: string): MentionCandidate => ({
  address: '0x1234567890abcdef1234567890abcdef12345678',
  label,
  avatarSrc: '',
  online: true,
})

/**
 * Harness mirroring ChatPage's ownership split: the caller holds the composer
 * state and the mention trigger/candidates derived during render, and the hook
 * only drives transitions.
 */
function setup(
  options: {
    channelInput?: string
    channelMentions?: ChannelMention[]
    mentionTrigger?: ComposerMentionTrigger | null
    mentionCandidates?: MentionCandidate[]
    mentionSelectedIndex?: number
    isMentionMenuOpen?: boolean
    mentionTriggerKey?: string
    dismissedMentionTriggerKey?: string
    sendResult?: boolean | (() => Promise<boolean>)
  } = {}
) {
  const state = {
    composerSelection: { start: 0, end: 0 } as { start: number; end: number },
    dismissedKey: options.dismissedMentionTriggerKey ?? '',
    sending: false,
    sendingRef: { current: false },
    rafCallbacks: [] as FrameRequestCallback[],
    focusCalls: [] as Array<[number, number]>,
    sendCalls: [] as Array<{ content: string; mentions: ChannelMention[] }>,
    input: options.channelInput ?? '',
    mentions: options.channelMentions ?? [],
    selectedIndex: options.mentionSelectedIndex ?? -1,
  }

  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    state.rafCallbacks.push(callback)
    return state.rafCallbacks.length
  })

  const sendChannelMessage = vi.fn(
    async (
      content: string,
      _attachment: undefined,
      mentions: ChannelMention[]
    ) => {
      state.sendCalls.push({ content, mentions })
      const configured = options.sendResult
      if (typeof configured === 'function') return configured()
      return configured ?? true
    }
  )

  const rendered = renderHook(() => {
    const [channelInput, setChannelInput] = useState(state.input)
    const [channelMentions, setChannelMentions] = useState(state.mentions)
    const [composerSelection, setComposerSelection] = useState(
      state.composerSelection
    )
    const [mentionSelectedIndex, setMentionSelectedIndex] = useState(
      state.selectedIndex
    )

    // Mirror React state back so assertions can read the latest values.
    state.input = channelInput
    state.mentions = channelMentions
    state.composerSelection = composerSelection
    state.selectedIndex = mentionSelectedIndex

    return useChatComposer({
      channelInput,
      setChannelInput,
      channelMentions,
      setChannelMentions,
      composerSelection,
      setComposerSelection,
      setDismissedMentionTriggerKey: key => {
        state.dismissedKey = key
      },
      dismissedMentionTriggerKey: state.dismissedKey,
      mentionTriggerKey: options.mentionTriggerKey ?? '',
      mentionSelectedIndex,
      setMentionSelectedIndex,
      isMentionMenuOpen: options.isMentionMenuOpen ?? false,
      mentionTrigger: options.mentionTrigger ?? null,
      mentionCandidates: options.mentionCandidates ?? [],
      composerMentionTargets: [
        {
          address: '0x1234567890abcdef1234567890abcdef12345678',
          label: 'Alice',
        },
      ],
      composerInputRef: {
        current: {
          focus: vi.fn(),
          setSelectionRange: (from: number, to: number) => {
            state.focusCalls.push([from, to])
          },
        },
      } as never,
      isSendingChannelMessageRef: state.sendingRef as never,
      setIsSendingChannelMessage: value => {
        state.sending = value
      },
      sendChannelMessage: sendChannelMessage as never,
    })
  })

  /** Runs queued animation frames so the caret update lands. */
  const flushFrames = () => {
    const queued = state.rafCallbacks.splice(0)
    for (const callback of queued) callback(0)
  }

  return { ...rendered, state, flushFrames, sendChannelMessage }
}

const keyEvent = (key: string) =>
  ({
    key,
    preventDefault: vi.fn(),
    shiftKey: false,
  }) as unknown as React.KeyboardEvent<HTMLTextAreaElement>

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('handleChannelInputChange', () => {
  it('stores the new text and reports the caret', () => {
    const { result, state } = setup()

    act(() => {
      result.current.handleChannelInputChange('hello', 5, 5)
    })

    expect(state.input).toBe('hello')
    expect(state.composerSelection).toEqual({ start: 5, end: 5 })
  })

  it('clears a dismissed mention trigger so the menu can reopen', () => {
    const { result, state } = setup({ dismissedMentionTriggerKey: 'room:3:al' })

    act(() => {
      result.current.handleChannelInputChange('@bob', 4, 4)
    })

    expect(state.dismissedKey).toBe('')
  })

  it('drops a mention whose recorded text no longer matches', () => {
    const { result, state } = setup({
      channelInput: 'hi @Alice',
      channelMentions: [MENTION],
    })

    // Replace the mention text: the stale range must be discarded.
    act(() => {
      result.current.handleChannelInputChange('hi @Bob', 7, 7)
    })

    expect(state.mentions).toEqual([])
  })

  it('defaults the caret to the end of the value', () => {
    const { result, state } = setup()

    act(() => {
      result.current.handleChannelInputChange('abc')
    })

    expect(state.composerSelection).toEqual({ start: 3, end: 3 })
  })
})

describe('handleComposerSelectionChange', () => {
  it('reports the selection', () => {
    const { result, state } = setup()

    act(() => {
      result.current.handleComposerSelectionChange(2, 4)
    })

    expect(state.composerSelection).toEqual({ start: 2, end: 4 })
  })
})

describe('selectMentionCandidate', () => {
  const trigger: ComposerMentionTrigger = { start: 3, end: 6, query: 'ali' }

  it('replaces the trigger text and moves the caret past the mention', () => {
    const { result, state, flushFrames } = setup({
      channelInput: 'hi @ali',
      mentionTrigger: trigger,
      mentionCandidates: [candidate('Alice')],
      mentionSelectedIndex: 0,
    })

    let inserted = false
    act(() => {
      inserted = result.current.selectMentionCandidate()
    })
    act(() => {
      flushFrames()
    })

    expect(inserted).toBe(true)
    // The trigger covers only "al" (3..6), so the trailing "i" survives.
    expect(state.input).toBe('hi @Alice i')
    expect(state.mentions).toHaveLength(1)
    expect(state.selectedIndex).toBe(-1)
    // The caret must land directly after the inserted mention, not at the end.
    expect(state.focusCalls[0]).toEqual([10, 10])
  })

  it('does nothing without an active trigger', () => {
    const { result } = setup({
      channelInput: 'hi',
      mentionTrigger: null,
      mentionCandidates: [candidate('Alice')],
    })

    let inserted = true
    act(() => {
      inserted = result.current.selectMentionCandidate()
    })

    expect(inserted).toBe(false)
  })

  it('does nothing without candidates', () => {
    const { result } = setup({
      channelInput: 'hi @ali',
      mentionTrigger: trigger,
      mentionCandidates: [],
    })

    let inserted = false

    act(() => {
      inserted = result.current.selectMentionCandidate()
    })

    expect(inserted).toBe(false)
  })

  it('refuses a negative index', () => {
    const { result } = setup({
      channelInput: 'hi @ali',
      mentionTrigger: trigger,
      mentionCandidates: [candidate('Alice')],
      mentionSelectedIndex: -1,
    })

    let inserted = false

    act(() => {
      inserted = result.current.selectMentionCandidate()
    })

    expect(inserted).toBe(false)
  })

  it('clamps an out-of-range index to the last candidate', () => {
    const { result, state, flushFrames } = setup({
      channelInput: 'hi @ali',
      mentionTrigger: trigger,
      mentionCandidates: [candidate('Alice'), candidate('Bob')],
    })

    act(() => {
      act(() => {
        result.current.selectMentionCandidate(99)
      })
    })
    act(() => {
      flushFrames()
    })

    expect(state.mentions[0].label).toBe('Bob')
  })
})

describe('handleComposerKeyDown', () => {
  const trigger: ComposerMentionTrigger = { start: 0, end: 4, query: 'al' }
  const candidates = [candidate('Alice'), candidate('Bob')]

  it('ignores every key while the mention menu is closed', () => {
    const { result, state } = setup({ isMentionMenuOpen: false })

    let handled = false

    act(() => {
      handled = result.current.handleComposerKeyDown(keyEvent('ArrowDown'))
    })

    expect(handled).toBe(false)
    expect(state.selectedIndex).toBe(-1)
  })

  it('moves down from no selection to the first candidate', () => {
    const { result, state } = setup({
      isMentionMenuOpen: true,
      mentionCandidates: candidates,
      mentionSelectedIndex: -1,
      mentionTrigger: trigger,
    })

    let handled = false

    act(() => {
      handled = result.current.handleComposerKeyDown(keyEvent('ArrowDown'))
    })

    expect(handled).toBe(true)
    expect(state.selectedIndex).toBe(0)
  })

  it('wraps around when moving down past the last candidate', () => {
    const { result, state } = setup({
      isMentionMenuOpen: true,
      mentionCandidates: candidates,
      mentionSelectedIndex: 1,
      mentionTrigger: trigger,
    })

    act(() => {
      result.current.handleComposerKeyDown(keyEvent('ArrowDown'))
    })

    expect(state.selectedIndex).toBe(0)
  })

  it('moves up from no selection to the last candidate', () => {
    const { result, state } = setup({
      isMentionMenuOpen: true,
      mentionCandidates: candidates,
      mentionSelectedIndex: -1,
      mentionTrigger: trigger,
    })

    act(() => {
      act(() => {
        result.current.handleComposerKeyDown(keyEvent('ArrowUp'))
      })
    })

    expect(state.selectedIndex).toBe(1)
  })

  it('wraps around when moving up past the first candidate', () => {
    const { result, state } = setup({
      isMentionMenuOpen: true,
      mentionCandidates: candidates,
      mentionSelectedIndex: 0,
      mentionTrigger: trigger,
    })

    act(() => {
      act(() => {
        result.current.handleComposerKeyDown(keyEvent('ArrowUp'))
      })
    })

    expect(state.selectedIndex).toBe(1)
  })

  it('inserts on Enter when a candidate is selected', () => {
    const { result, state } = setup({
      channelInput: '@al',
      isMentionMenuOpen: true,
      mentionCandidates: candidates,
      mentionSelectedIndex: 0,
      mentionTrigger: trigger,
    })

    const event = keyEvent('Enter')
    let handled = false
    act(() => {
      handled = result.current.handleComposerKeyDown(event)
    })

    expect(handled).toBe(true)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(state.mentions).toHaveLength(1)
  })

  it('inserts on Tab when a candidate is selected', () => {
    const { result, state } = setup({
      channelInput: '@al',
      isMentionMenuOpen: true,
      mentionCandidates: candidates,
      mentionSelectedIndex: 0,
      mentionTrigger: trigger,
    })

    let handled = false

    act(() => {
      handled = result.current.handleComposerKeyDown(keyEvent('Tab'))
    })

    expect(handled).toBe(true)
    expect(state.mentions).toHaveLength(1)
  })

  it('lets Enter through when nothing is selected', () => {
    const { result } = setup({
      isMentionMenuOpen: true,
      mentionCandidates: candidates,
      mentionSelectedIndex: -1,
      mentionTrigger: trigger,
    })

    // Returning false lets the composer treat Enter as send.
    let handled = false
    act(() => {
      handled = result.current.handleComposerKeyDown(keyEvent('Enter'))
    })
    expect(handled).toBe(false)
  })

  it('dismisses the menu on Escape by keying the current trigger', () => {
    const { result, state } = setup({
      isMentionMenuOpen: true,
      mentionCandidates: candidates,
      mentionTrigger: trigger,
      mentionTriggerKey: 'room:0:al',
    })

    let handled = false

    act(() => {
      handled = result.current.handleComposerKeyDown(keyEvent('Escape'))
    })

    expect(handled).toBe(true)
    expect(state.dismissedKey).toBe('room:0:al')
  })

  it('ignores unrelated keys while the menu is open', () => {
    const { result } = setup({
      isMentionMenuOpen: true,
      mentionCandidates: candidates,
      mentionTrigger: trigger,
    })

    let handled = false

    act(() => {
      handled = result.current.handleComposerKeyDown(keyEvent('a'))
    })

    expect(handled).toBe(false)
  })
})

describe('handleSendChannelMessage', () => {
  it('sends the draft and clears the composer', async () => {
    const { result, state } = setup({ channelInput: 'hello' })

    await act(async () => {
      await result.current.handleSendChannelMessage()
    })

    expect(state.sendCalls[0].content).toBe('hello')
    expect(state.input).toBe('')
    expect(state.mentions).toEqual([])
    expect(state.composerSelection).toEqual({ start: 0, end: 0 })
    expect(state.sending).toBe(false)
  })

  it('does nothing for an empty draft', async () => {
    const { result, state } = setup({ channelInput: '   ' })

    await act(async () => {
      await result.current.handleSendChannelMessage()
    })

    expect(state.sendCalls).toHaveLength(0)
  })

  it('completes a typed mention before sending', async () => {
    const { result, state } = setup({ channelInput: 'hi @Alice' })

    await act(async () => {
      await result.current.handleSendChannelMessage()
    })

    expect(state.sendCalls[0].mentions).toHaveLength(1)
    expect(state.sendCalls[0].mentions[0].label).toBe('Alice')
  })

  it('guards against a second send while one is in flight', async () => {
    let release: (() => void) | undefined
    const { result, state } = setup({
      channelInput: 'hello',
      sendResult: () =>
        new Promise<boolean>(resolve => {
          release = () => resolve(true)
        }),
    })

    let first: Promise<void> | undefined
    act(() => {
      first = result.current.handleSendChannelMessage()
    })
    await act(async () => {
      await result.current.handleSendChannelMessage()
    })

    expect(state.sendCalls).toHaveLength(1)

    await act(async () => {
      release?.()
      await first
    })
  })

  it('keeps the draft when the send fails', async () => {
    const { result, state } = setup({
      channelInput: 'hello',
      sendResult: false,
    })

    await act(async () => {
      await result.current.handleSendChannelMessage()
    })

    expect(state.input).toBe('hello')
    expect(state.sending).toBe(false)
    expect(state.sendingRef.current).toBe(false)
  })

  it('releases the guard after a successful send', async () => {
    const { result, state } = setup({ channelInput: 'hello' })

    await act(async () => {
      await result.current.handleSendChannelMessage()
    })

    // A second send must be allowed once the first finished.
    await act(async () => {
      await result.current.handleSendChannelMessage()
    })

    expect(state.sendCalls.length).toBe(1) // draft was cleared, so nothing to send
    expect(state.sendingRef.current).toBe(false)
  })
})
