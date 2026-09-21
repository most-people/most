import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

import {
  CHAT_NOTIFICATION_SOUND_MIN_INTERVAL_MS,
  useChatNotifications,
} from '~/features/chat/useChatNotifications'

/**
 * Minimal AudioContext double.
 *
 * Records what the hook did so the tests can assert the unlock gate, the
 * throttle, and cleanup without a real audio device.
 */
function createAudioContextStub() {
  const oscillators: Array<{
    start: number
    stop: number
    connected: boolean
  }> = []
  const context = {
    state: 'running' as AudioContextState,
    currentTime: 0,
    destination: {},
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    createGain: vi.fn(() => ({
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    })),
    createOscillator: vi.fn(() => {
      const record = { start: 0, stop: 0, connected: false }
      oscillators.push(record)
      return {
        type: 'sine',
        frequency: { setValueAtTime: vi.fn() },
        connect: vi.fn(() => {
          record.connected = true
        }),
        start: vi.fn((time: number) => {
          record.start = time
        }),
        stop: vi.fn((time: number) => {
          record.stop = time
        }),
      }
    }),
  }
  return { context, oscillators }
}

let stub: ReturnType<typeof createAudioContextStub>

beforeEach(() => {
  stub = createAudioContextStub()
  vi.stubGlobal('AudioContext', function AudioContextMock() {
    return stub.context
  } as unknown as typeof AudioContext)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useChatNotifications', () => {
  it('does not play before the audio context is unlocked', () => {
    const { result } = renderHook(() => useChatNotifications())

    act(() => {
      result.current.playNotificationSound()
    })

    expect(stub.context.createOscillator).not.toHaveBeenCalled()
    expect(stub.context.createGain).not.toHaveBeenCalled()
  })

  it('unlocks on the first pointer gesture and then plays', () => {
    const { result } = renderHook(() => useChatNotifications())

    act(() => {
      window.dispatchEvent(new Event('pointerdown'))
    })
    act(() => {
      result.current.playNotificationSound()
    })

    // Two tones per notification.
    expect(stub.context.createOscillator).toHaveBeenCalledTimes(2)
    expect(stub.oscillators.every(o => o.connected)).toBe(true)
  })

  it('unlocks on a keyboard gesture too', () => {
    const { result } = renderHook(() => useChatNotifications())

    act(() => {
      window.dispatchEvent(new Event('keydown'))
    })
    act(() => {
      result.current.playNotificationSound()
    })

    expect(stub.context.createOscillator).toHaveBeenCalledTimes(2)
  })

  it('throttles repeated sounds within the minimum interval', () => {
    const { result } = renderHook(() => useChatNotifications())

    act(() => {
      window.dispatchEvent(new Event('pointerdown'))
    })
    act(() => {
      result.current.playNotificationSound()
      result.current.playNotificationSound()
      result.current.playNotificationSound()
    })

    // Only the first call passes the throttle.
    expect(stub.context.createOscillator).toHaveBeenCalledTimes(2)
  })

  it('throttles just under the interval and plays just over it', async () => {
    const { result } = renderHook(() => useChatNotifications())

    act(() => {
      window.dispatchEvent(new Event('pointerdown'))
    })
    act(() => {
      result.current.playNotificationSound()
    })
    expect(stub.context.createOscillator).toHaveBeenCalledTimes(2)

    // Real elapsed time is used on purpose: faking Date.now after the hook has
    // captured it does not affect the hook's own clock read.
    await new Promise(resolve => setTimeout(resolve, 200))
    act(() => {
      result.current.playNotificationSound()
    })
    // Still inside the throttle window.
    expect(stub.context.createOscillator).toHaveBeenCalledTimes(2)

    await new Promise(resolve =>
      setTimeout(resolve, CHAT_NOTIFICATION_SOUND_MIN_INTERVAL_MS)
    )
    act(() => {
      result.current.playNotificationSound()
    })
    // Past the window: plays again.
    expect(stub.context.createOscillator).toHaveBeenCalledTimes(4)
  })

  it('resumes a suspended context instead of playing', () => {
    stub.context.state = 'suspended'
    const { result } = renderHook(() => useChatNotifications())

    act(() => {
      window.dispatchEvent(new Event('pointerdown'))
    })
    act(() => {
      result.current.playNotificationSound()
    })

    expect(stub.context.resume).toHaveBeenCalled()
    expect(stub.context.createOscillator).not.toHaveBeenCalled()
  })

  it('removes its window listeners on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useChatNotifications())

    unmount()

    const removed = removeSpy.mock.calls.map(call => call[0])
    expect(removed).toContain('pointerdown')
    expect(removed).toContain('keydown')
  })

  it('closes the audio context on unmount', () => {
    const { result, unmount } = renderHook(() => useChatNotifications())

    act(() => {
      window.dispatchEvent(new Event('pointerdown'))
    })
    act(() => {
      result.current.playNotificationSound()
    })
    unmount()

    expect(stub.context.close).toHaveBeenCalled()
  })

  it('does nothing when the browser has no AudioContext', () => {
    vi.unstubAllGlobals()
    vi.stubGlobal('AudioContext', undefined)
    const { result } = renderHook(() => useChatNotifications())

    expect(() =>
      act(() => {
        window.dispatchEvent(new Event('pointerdown'))
        result.current.playNotificationSound()
      })
    ).not.toThrow()
  })
})
