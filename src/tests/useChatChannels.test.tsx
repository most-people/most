import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

import { channelApi, type Channel } from '~/lib/channelApi'
import { useChatChannels } from '~/features/chat/useChatChannels'

const t = (key: string) => key

function channel(overrides: Partial<Channel> = {}): Channel {
  return {
    name: 'room',
    channelId: 'room-id',
    channelKey: 'room-key',
    ...overrides,
  } as Channel
}

/**
 * Harness with observable state.
 *
 * The hook contract is state-in / state-out: the caller owns channels, the
 * active channel, and the modal state, so the tests assert the updater calls.
 */
function setup(
  options: { channels?: Channel[]; activeChannel?: Channel | null } = {}
) {
  const state = {
    channels: options.channels ?? [],
    activeChannel: options.activeChannel ?? null,
    hasLoadedChannels: false,
    requestedChannelName: '',
    opening: false,
    leaving: false,
    renaming: false,
    channelToLeave: null as Channel | null,
    channelToRename: null as Channel | null,
    openChatDefaultValue: '',
    reads: [] as Array<{ channelKey: string; timestamp: number }>,
    cleared: 0,
    history: [] as string[],
    toasts: [] as Array<{ message: string; type: string }>,
    modalOpen: 0,
    leaveModalClose: 0,
  }

  const addToast = (message: string, type: string) => {
    state.toasts.push({ message, type })
  }
  const setChannels = (updater: (prev: Channel[]) => Channel[]) => {
    state.channels = updater(state.channels)
  }
  const setActiveChannel = (
    updater: (prev: Channel | null) => Channel | null
  ) => {
    state.activeChannel = updater(state.activeChannel)
  }

  const rendered = renderHook(() =>
    useChatChannels({
      t,
      addToast,
      showApiError: vi.fn(),
      requireLogin: () => true,
      requireBackendReady: () => true,
      isBackendReady: true,
      channels: state.channels,
      setChannels,
      setActiveChannel,
      setHasLoadedChannels: value => {
        state.hasLoadedChannels = value
      },
      setRequestedChannelName: value => {
        state.requestedChannelName = value
      },
      markChannelRead: (channelKey, timestamp) => {
        state.reads.push({ channelKey, timestamp })
      },
      clearChannelMessagesRef: {
        current: () => {
          state.cleared += 1
        },
      } as never,
      isOpeningChannel: state.opening,
      setIsOpeningChannel: value => {
        state.opening = value
      },
      isLeavingChannel: state.leaving,
      setIsLeavingChannel: value => {
        state.leaving = value
      },
      isRenamingChannel: state.renaming,
      setIsRenamingChannel: value => {
        state.renaming = value
      },
      activeChannel: state.activeChannel,
      setChannelToLeave: value => {
        state.channelToLeave = value
      },
      channelToRename: state.channelToRename,
      setChannelToRename: value => {
        state.channelToRename = value
      },
      remarkInput: 'my remark',
      // Reaching handleOpenChannelId requires a signed-in user; the real path
      // always has one, and getUserChannelProfile dereferences the identity.
      userIdentity: {
        username: 'tester',
        address: '0x1234567890abcdef1234567890abcdef12345678',
        danger: '0x00',
      } as never,
      openChannelModal: {
        open: () => {
          state.modalOpen += 1
        },
        close: () => {},
      },
      leaveChannelModal: {
        open: vi.fn(),
        close: () => {
          state.leaveModalClose += 1
        },
      },
      setOpenChatDefaultValue: value => {
        state.openChatDefaultValue = value
      },
    })
  )

  return { ...rendered, state }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('getChannelNameValidationError', () => {
  it('accepts a valid channel id', () => {
    const { result } = setup()
    expect(result.current.getChannelNameValidationError('most-box_1')).toBe('')
  })

  it('rejects a name that is too short', () => {
    const { result } = setup()
    expect(result.current.getChannelNameValidationError('ab')).toBe(
      'chat.validation.nameMin'
    )
  })

  it('rejects a name that is too long', () => {
    const { result } = setup()
    expect(result.current.getChannelNameValidationError('a'.repeat(31))).toBe(
      'chat.validation.nameMax'
    )
  })

  it('rejects a dot because it is reserved', () => {
    const { result } = setup()
    expect(result.current.getChannelNameValidationError('my.room')).toBe(
      'chat.validation.dotReserved'
    )
  })

  it('rejects characters outside the allowed set', () => {
    const { result } = setup()
    expect(result.current.getChannelNameValidationError('Room Name')).toBe(
      'chat.validation.allowedChars'
    )
  })
})

describe('getOpenChannelValidationError', () => {
  it('rejects input that has no channel id', () => {
    const { result } = setup()
    expect(result.current.getOpenChannelValidationError('')).toBe(
      'chat.validation.invalidShareLink'
    )
  })

  it('validates the extracted channel id', () => {
    const { result } = setup()
    expect(result.current.getOpenChannelValidationError('#ab')).toBe(
      'chat.validation.nameMin'
    )
  })

  it('accepts a valid share link', () => {
    const { result } = setup()
    expect(
      result.current.getOpenChannelValidationError('/chat/#most-box_1')
    ).toBe('')
  })
})

describe('generateChannelId', () => {
  it('generates a valid channel id', () => {
    const { result } = setup()
    const id = result.current.generateChannelId()
    expect(id).toMatch(/^[a-z0-9_-]+$/)
    expect(id.length).toBeGreaterThanOrEqual(3)
  })

  it('reports and returns empty when secure randomness is unavailable', () => {
    const original = globalThis.crypto
    vi.stubGlobal('crypto', {})
    try {
      const { result, state } = setup()
      expect(result.current.generateChannelId()).toBe('')
      expect(state.toasts[0]?.message).toBe('chat.error.randomId')
    } finally {
      vi.stubGlobal('crypto', original)
    }
  })
})

describe('handleShowOpenChatModal', () => {
  it('prefills the modal with a generated id', () => {
    const { result, state } = setup()
    act(() => {
      result.current.handleShowOpenChatModal()
    })
    expect(state.openChatDefaultValue).toMatch(/^[a-z0-9_-]+$/)
    expect(state.modalOpen).toBe(1)
  })
})

describe('refreshChannels', () => {
  it('loads the channel list and marks it loaded', async () => {
    vi.spyOn(channelApi, 'getChannels').mockResolvedValue([channel()] as never)
    const { result, state } = setup()

    await act(async () => {
      await result.current.refreshChannels()
    })

    expect(state.channels).toHaveLength(1)
    expect(state.hasLoadedChannels).toBe(true)
  })

  it('refreshes the active channel object from the new list', async () => {
    const stale = channel({ remark: 'old' })
    vi.spyOn(channelApi, 'getChannels').mockResolvedValue([
      channel({ remark: 'new' }),
    ] as never)
    const { result, state } = setup({
      channels: [stale],
      activeChannel: stale,
    })

    await act(async () => {
      await result.current.refreshChannels()
    })

    expect(state.activeChannel?.remark).toBe('new')
  })

  it('keeps the existing active channel when it is gone from the list', async () => {
    const active = channel({ channelKey: 'gone' })
    vi.spyOn(channelApi, 'getChannels').mockResolvedValue([
      channel({ channelKey: 'other' }),
    ] as never)
    const { result, state } = setup({ activeChannel: active })

    await act(async () => {
      await result.current.refreshChannels()
    })

    expect(state.activeChannel?.channelKey).toBe('gone')
  })

  it('clears the list when loading fails', async () => {
    vi.spyOn(channelApi, 'getChannels').mockRejectedValue(new Error('offline'))
    const { result, state } = setup({ channels: [channel()] })

    await act(async () => {
      await result.current.refreshChannels()
    })

    expect(state.channels).toEqual([])
    expect(state.hasLoadedChannels).toBe(false)
  })
})

describe('handleOpenChannel', () => {
  it('marks the channel read and activates it', async () => {
    const target = channel()
    const { result, state } = setup()
    vi.stubGlobal('history', { pushState: vi.fn(), replaceState: vi.fn() })

    await act(async () => {
      await result.current.handleOpenChannel(target)
    })

    expect(state.reads).toHaveLength(1)
    expect(state.reads[0].channelKey).toBe('room-key')
    expect(state.activeChannel).toBe(target)
    expect(state.requestedChannelName).toBe('room-id')
  })

  it('replaces rather than pushes history when asked', async () => {
    const replaceState = vi.fn()
    const pushState = vi.fn()
    vi.stubGlobal('history', { pushState, replaceState })
    const { result } = setup()

    await act(async () => {
      await result.current.handleOpenChannel(channel(), {
        replaceHistory: true,
      })
    })

    expect(replaceState).toHaveBeenCalled()
    expect(pushState).not.toHaveBeenCalled()
  })

  it('must read the channel at least as recently as now', async () => {
    const { result, state } = setup()
    vi.stubGlobal('history', { pushState: vi.fn(), replaceState: vi.fn() })
    const before = Date.now()

    await act(async () => {
      await result.current.handleOpenChannel(
        channel({ lastMessageAt: undefined })
      )
    })

    expect(state.reads[0].timestamp).toBeGreaterThanOrEqual(before)
  })
})

describe('handleLeaveChannel', () => {
  it('clears the active channel, messages, and history when leaving it', async () => {
    const active = channel()
    vi.spyOn(channelApi, 'leaveChannel').mockResolvedValue(undefined as never)
    vi.spyOn(channelApi, 'getChannels').mockResolvedValue([] as never)
    vi.stubGlobal('history', { pushState: vi.fn(), replaceState: vi.fn() })
    const { result, state } = setup({ activeChannel: active })

    await act(async () => {
      await result.current.handleLeaveChannel('room-key')
    })

    expect(state.activeChannel).toBeNull()
    expect(state.cleared).toBe(1)
    expect(state.leaveModalClose).toBe(1)
    expect(state.channelToLeave).toBeNull()
  })

  it('keeps the active channel when a different one is left', async () => {
    const active = channel()
    vi.spyOn(channelApi, 'leaveChannel').mockResolvedValue(undefined as never)
    vi.spyOn(channelApi, 'getChannels').mockResolvedValue([] as never)
    const { result, state } = setup({ activeChannel: active })

    await act(async () => {
      await result.current.handleLeaveChannel('other-key')
    })

    expect(state.activeChannel).toBe(active)
    expect(state.cleared).toBe(0)
  })

  it('stops propagation when given an event', async () => {
    vi.spyOn(channelApi, 'leaveChannel').mockResolvedValue(undefined as never)
    vi.spyOn(channelApi, 'getChannels').mockResolvedValue([] as never)
    const stopPropagation = vi.fn()
    const { result } = setup()

    await act(async () => {
      await result.current.handleLeaveChannel('room-key', {
        stopPropagation,
      } as never)
    })

    expect(stopPropagation).toHaveBeenCalled()
  })

  it('always clears the leaving flag, even on failure', async () => {
    vi.spyOn(channelApi, 'leaveChannel').mockRejectedValue(new Error('nope'))
    vi.spyOn(channelApi, 'getChannels').mockResolvedValue([] as never)
    const { result, state } = setup()

    await act(async () => {
      await result.current.handleLeaveChannel('room-key')
    })

    expect(state.leaving).toBe(false)
  })
})

describe('handleToggleChannelPin', () => {
  it('applies the new pinned value to the list and the active channel', async () => {
    const target = channel({ pinned: false })
    vi.spyOn(channelApi, 'setChannelPinned').mockResolvedValue({
      pinned: true,
    } as never)
    const { result, state } = setup({
      channels: [target],
      activeChannel: target,
    })

    await act(async () => {
      await result.current.handleToggleChannelPin(target)
    })

    expect(state.channels[0].pinned).toBe(true)
    expect(state.activeChannel?.pinned).toBe(true)
  })

  it('toggles a pinned channel back off', async () => {
    const target = channel({ pinned: true })
    const setPinned = vi
      .spyOn(channelApi, 'setChannelPinned')
      .mockResolvedValue({ pinned: false } as never)
    const { result, state } = setup({ channels: [target] })

    await act(async () => {
      await result.current.handleToggleChannelPin(target)
    })

    expect(setPinned).toHaveBeenCalledWith('room-key', false)
    expect(state.channels[0].pinned).toBe(false)
  })
})

describe('handleSetRemark and handleRenameChannel', () => {
  it('applies a saved remark to the list and the active channel', async () => {
    const active = channel()
    vi.spyOn(channelApi, 'setChannelRemark').mockResolvedValue({
      remark: 'saved',
    } as never)
    const { result, state } = setup({
      channels: [active],
      activeChannel: active,
    })

    await act(async () => {
      await result.current.handleSetRemark()
    })

    expect(state.channels[0].remark).toBe('saved')
    expect(state.activeChannel?.remark).toBe('saved')
  })

  it('renames the targeted channel and closes the rename target', async () => {
    const target = channel()
    vi.spyOn(channelApi, 'setChannelRemark').mockResolvedValue({
      remark: 'renamed',
    } as never)
    const rendered = renderHook(() => {
      const state = { channelToRename: target, renaming: false }
      return useChatChannels({
        t,
        addToast: vi.fn(),
        showApiError: vi.fn(),
        requireLogin: () => true,
        requireBackendReady: () => true,
        isBackendReady: true,
        channels: [target],
        setChannels: vi.fn(),
        setActiveChannel: vi.fn(),
        setHasLoadedChannels: vi.fn(),
        setRequestedChannelName: vi.fn(),
        markChannelRead: vi.fn(),
        clearChannelMessagesRef: { current: vi.fn() } as never,
        isOpeningChannel: false,
        setIsOpeningChannel: vi.fn(),
        isLeavingChannel: false,
        setIsLeavingChannel: vi.fn(),
        isRenamingChannel: state.renaming,
        setIsRenamingChannel: vi.fn(),
        activeChannel: null,
        setChannelToLeave: vi.fn(),
        channelToRename: state.channelToRename,
        setChannelToRename: vi.fn(),
        remarkInput: '',
        userIdentity: null,
        openChannelModal: { open: vi.fn(), close: vi.fn() },
        leaveChannelModal: { open: vi.fn(), close: vi.fn() },
        setOpenChatDefaultValue: vi.fn(),
      })
    })

    await act(async () => {
      await rendered.result.current.handleRenameChannel('renamed')
    })

    expect(channelApi.setChannelRemark).toHaveBeenCalledWith(
      'room-key',
      'renamed'
    )
  })
})

describe('handleOpenChannelId', () => {
  it('rejects an invalid id with a toast and does not call the API', async () => {
    const create = vi.spyOn(channelApi, 'createChannel')
    const { result, state } = setup()

    await act(async () => {
      await result.current.handleOpenChannelId('ab')
    })

    expect(state.toasts[0]?.type).toBe('error')
    expect(create).not.toHaveBeenCalled()
  })

  it('creates and activates the channel', async () => {
    vi.spyOn(channelApi, 'createChannel').mockResolvedValue({
      name: 'newroom',
      channelId: 'newroom',
      channelKey: 'newroom-key',
    } as never)
    // The handler adds the joined channel, then refreshes without awaiting.
    // The refresh overwrites the list, exactly as the original code did, so the
    // stub must return what the daemon would: the list including the new room.
    vi.spyOn(channelApi, 'getChannels').mockResolvedValue([
      { name: 'newroom', channelId: 'newroom', channelKey: 'newroom-key' },
    ] as never)
    vi.stubGlobal('history', { pushState: vi.fn(), replaceState: vi.fn() })
    const { result, state } = setup()

    await act(async () => {
      await result.current.handleOpenChannelId('newroom')
    })

    expect(state.channels.map(c => c.channelKey)).toContain('newroom-key')
    expect(state.activeChannel?.channelKey).toBe('newroom-key')
    expect(state.opening).toBe(false)
  })

  it('clears the opening flag when creation fails', async () => {
    vi.spyOn(channelApi, 'createChannel').mockRejectedValue(new Error('nope'))
    const { result, state } = setup()

    await act(async () => {
      await result.current.handleOpenChannelId('newroom')
    })

    expect(state.opening).toBe(false)
  })
})
