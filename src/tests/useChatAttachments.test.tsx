import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

import { fileApi } from '~/lib/fileApi'
import type { ChannelAttachment } from '~/lib/channelApi'
import {
  useChatAttachments,
  type ChatAttachmentDownloadStatusMap,
  type ChatAttachmentPreviewItem,
} from '~/features/chat/useChatAttachments'
import type { AttachmentDownloadState } from '~/features/chat/chatPageModel'

const LINK =
  'most://bafkreibm6jg3ux5qumhcn2b3flc3tyu6dmlb4xa7u5bf44yetv5zh7fzka?filename=a.bin'

const attachment = (
  overrides: Partial<ChannelAttachment> = {}
): ChannelAttachment => ({
  kind: 'file',
  cid: 'cid-1',
  fileName: 'a.bin',
  link: LINK,
  size: 10,
  ...overrides,
})

const t = (key: string) => key

/** Mutable harness so tests can observe state updates and option changes. */
function setup(options: { status?: ChatAttachmentDownloadStatusMap } = {}) {
  let status: ChatAttachmentDownloadStatusMap = options.status ?? {}
  const setStatus = (
    updater: (
      previous: ChatAttachmentDownloadStatusMap
    ) => ChatAttachmentDownloadStatusMap
  ) => {
    status = updater(status)
  }
  const previews = { current: new Map<string, ChannelAttachment>() }
  const active = { current: new Set<string>() }
  const setPreviewItem =
    vi.fn<(item: ChatAttachmentPreviewItem | null) => void>()
  const setFailedAttachment = vi.fn()
  const addToast = vi.fn()
  const sendChannelMessage = vi.fn(async () => {})
  const setPublishing = vi.fn()

  const harness = {
    getStatus: () => status,
    setPreviewItem,
    setFailedAttachment,
    addToast,
    sendChannelMessage,
    setPublishing,
    previews,
    active,
  }

  const rendered = renderHook(() =>
    useChatAttachments({
      t,
      addToast,
      requireLogin: () => true,
      requireBackendReady: () => true,
      getActiveChannel: () => ({ name: 'room', channelId: 'room-id' }) as never,
      sendChannelMessage,
      setPreviewItem,
      isPublishingAttachment: false,
      setIsPublishingAttachment: setPublishing,
      attachmentDownloadStatus: status,
      setAttachmentDownloadStatus: setStatus,
      setFailedAttachment,
      pendingAttachmentPreviewsRef: previews as never,
      activeAttachmentDownloadsRef: active as never,
    })
  )

  return { ...harness, ...rendered }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('checkAttachmentAvailability', () => {
  it('reports a local file as already available', async () => {
    vi.spyOn(fileApi, 'checkDownload').mockResolvedValue({
      alreadyExists: true,
    } as never)
    const { result, getStatus } = setup()

    let ok = false
    await act(async () => {
      ok = await result.current.checkAttachmentAvailability(attachment())
    })

    expect(ok).toBe(true)
    expect(getStatus()['cid-1']).toEqual({
      status: 'available',
      message: 'chat.attachment.localAvailable',
    })
  })

  it('reports a remote file as ready to download', async () => {
    vi.spyOn(fileApi, 'checkDownload').mockResolvedValue({
      alreadyExists: false,
    } as never)
    const { result, getStatus } = setup()

    await act(async () => {
      await result.current.checkAttachmentAvailability(attachment())
    })

    expect(getStatus()['cid-1']?.status).toBe('ready')
  })

  it('reports an error when the probe fails', async () => {
    vi.spyOn(fileApi, 'checkDownload').mockRejectedValue(new Error('offline'))
    const { result, getStatus } = setup()

    let ok = true
    await act(async () => {
      ok = await result.current.checkAttachmentAvailability(attachment())
    })

    expect(ok).toBe(false)
    expect(getStatus()['cid-1']).toEqual({
      status: 'error',
      message: 'chat.attachment.noSeedsTitle',
    })
  })

  it('rejects an invalid link without probing', async () => {
    const probe = vi.spyOn(fileApi, 'checkDownload')
    const { result, getStatus } = setup()

    let ok = true
    await act(async () => {
      ok = await result.current.checkAttachmentAvailability(
        attachment({ link: 'not-a-most-link' })
      )
    })

    expect(ok).toBe(false)
    expect(probe).not.toHaveBeenCalled()
    expect(getStatus()['cid-1']?.status).toBe('error')
  })
})

describe('startAttachmentDownload', () => {
  it('opens a preview immediately when the file already exists locally', async () => {
    vi.spyOn(fileApi, 'downloadFile').mockResolvedValue({
      alreadyExists: true,
      fileName: 'local.bin',
    } as never)
    const { result, setPreviewItem, getStatus } = setup()

    await act(async () => {
      await result.current.startAttachmentDownload(attachment())
    })

    expect(setPreviewItem).toHaveBeenCalledWith(
      expect.objectContaining({ cid: 'cid-1', fileName: 'local.bin' })
    )
    expect(getStatus()['cid-1']?.status).toBe('available')
  })

  it('registers a pending preview when the daemon returns a task id', async () => {
    vi.spyOn(fileApi, 'downloadFile').mockResolvedValue({
      taskId: 'task-9',
    } as never)
    const { result, previews, addToast } = setup()

    await act(async () => {
      await result.current.startAttachmentDownload(attachment())
    })

    expect(previews.current.get('task-9')?.cid).toBe('cid-1')
    expect(addToast).toHaveBeenCalledWith(
      'chat.attachment.downloadStarted',
      'success'
    )
  })

  it('reports an error and releases the guard when the download fails', async () => {
    vi.spyOn(fileApi, 'downloadFile').mockRejectedValue(new Error('no seeds'))
    const { result, active, getStatus } = setup()

    await act(async () => {
      await result.current.startAttachmentDownload(attachment())
    })

    expect(getStatus()['cid-1']?.status).toBe('error')
    expect(active.current.has('cid-1')).toBe(false)
  })

  it('ignores a second download of the same cid while one is in flight', async () => {
    let release: (() => void) | undefined
    const download = vi.spyOn(fileApi, 'downloadFile').mockImplementation(
      () =>
        new Promise(resolve => {
          release = () => resolve({ taskId: 't' } as never)
        }) as never
    )
    const { result } = setup()

    let first: Promise<void> | undefined
    act(() => {
      first = result.current.startAttachmentDownload(attachment())
    })
    await act(async () => {
      await result.current.startAttachmentDownload(attachment())
    })

    // The guard makes the concurrent call a no-op.
    expect(download).toHaveBeenCalledTimes(1)

    await act(async () => {
      release?.()
      await first
    })
  })
})

describe('handleOpenAttachment', () => {
  it('does nothing while a check or download is running', async () => {
    const download = vi.spyOn(fileApi, 'downloadFile')
    const { result } = setup({
      status: { 'cid-1': { status: 'downloading' } },
    })

    await act(async () => {
      await result.current.handleOpenAttachment(attachment())
    })

    expect(download).not.toHaveBeenCalled()
  })

  it('surfaces a failed attachment for retry instead of downloading', async () => {
    const download = vi.spyOn(fileApi, 'downloadFile')
    const { result, setFailedAttachment } = setup({
      status: { 'cid-1': { status: 'error', message: 'boom' } },
    })

    await act(async () => {
      await result.current.handleOpenAttachment(attachment())
    })

    expect(setFailedAttachment).toHaveBeenCalledWith(
      expect.objectContaining({ cid: 'cid-1' })
    )
    expect(download).not.toHaveBeenCalled()
  })

  it('downloads a ready attachment directly', async () => {
    const download = vi
      .spyOn(fileApi, 'downloadFile')
      .mockResolvedValue({ taskId: 't' } as never)
    const { result } = setup({ status: { 'cid-1': { status: 'ready' } } })

    await act(async () => {
      await result.current.handleOpenAttachment(attachment())
    })

    expect(download).toHaveBeenCalledWith(LINK)
  })

  it('checks an unknown attachment before downloading it', async () => {
    const check = vi
      .spyOn(fileApi, 'checkDownload')
      .mockResolvedValue({ alreadyExists: false } as never)
    const download = vi
      .spyOn(fileApi, 'downloadFile')
      .mockResolvedValue({ taskId: 't' } as never)
    const { result } = setup()

    await act(async () => {
      await result.current.handleOpenAttachment(attachment())
    })

    expect(check).toHaveBeenCalled()
    expect(download).toHaveBeenCalled()
  })

  it('does not download when the availability check fails', async () => {
    vi.spyOn(fileApi, 'checkDownload').mockRejectedValue(new Error('offline'))
    const download = vi.spyOn(fileApi, 'downloadFile')
    const { result } = setup()

    await act(async () => {
      await result.current.handleOpenAttachment(attachment())
    })

    expect(download).not.toHaveBeenCalled()
  })
})

describe('handleRetryAttachmentCheck', () => {
  it('clears the failed attachment and retries the check then download', async () => {
    vi.spyOn(fileApi, 'checkDownload').mockResolvedValue({
      alreadyExists: false,
    } as never)
    const download = vi
      .spyOn(fileApi, 'downloadFile')
      .mockResolvedValue({ taskId: 't' } as never)
    const { result, setFailedAttachment } = setup()

    await act(async () => {
      await result.current.handleRetryAttachmentCheck(attachment())
    })

    expect(setFailedAttachment).toHaveBeenCalledWith(null)
    expect(download).toHaveBeenCalledWith(LINK)
  })
})

describe('handleSelectAttachmentFiles', () => {
  it('ignores an empty selection', async () => {
    const publish = vi.spyOn(fileApi, 'publishFile')
    const { result, sendChannelMessage } = setup()

    await act(async () => {
      await result.current.handleSelectAttachmentFiles([])
    })

    expect(publish).not.toHaveBeenCalled()
    expect(sendChannelMessage).not.toHaveBeenCalled()
  })

  it('ignores a null selection', async () => {
    const publish = vi.spyOn(fileApi, 'publishFile')
    const { result } = setup()

    await act(async () => {
      await result.current.handleSelectAttachmentFiles(null)
    })

    expect(publish).not.toHaveBeenCalled()
  })

  it('publishes a file into the channel folder and sends the link', async () => {
    vi.spyOn(fileApi, 'getNodePolicy').mockResolvedValue(null as never)
    vi.spyOn(fileApi, 'publishFile').mockResolvedValue({
      cid: 'cid-9',
      fileName: 'chat-file/room-id/photo.png',
    } as never)
    const { result, sendChannelMessage, setPublishing } = setup()
    const file = new File(['x'], 'photo.png', { type: 'image/png' })

    await act(async () => {
      await result.current.handleSelectAttachmentFiles([file])
    })

    expect(sendChannelMessage).toHaveBeenCalledWith(
      expect.stringContaining('most://cid-9'),
      expect.objectContaining({ cid: 'cid-9' })
    )
    expect(setPublishing).toHaveBeenCalledWith(true)
    expect(setPublishing).toHaveBeenLastCalledWith(false)
  })

  it('reports a publish failure and always clears the publishing flag', async () => {
    vi.spyOn(fileApi, 'getNodePolicy').mockResolvedValue(null as never)
    vi.spyOn(fileApi, 'publishFile').mockRejectedValue(new Error('disk full'))
    const { result, addToast, setPublishing } = setup()
    const file = new File(['x'], 'photo.png', { type: 'image/png' })

    await act(async () => {
      await result.current.handleSelectAttachmentFiles([file])
    })

    expect(addToast).toHaveBeenCalled()
    expect(setPublishing).toHaveBeenLastCalledWith(false)
  })
})

describe('handleSavePreviewItem', () => {
  it('does not fall over when the guards reject', async () => {
    const { result } = renderHook(() =>
      useChatAttachments({
        t,
        addToast: vi.fn(),
        requireLogin: () => false,
        requireBackendReady: () => true,
        getActiveChannel: () => null,
        sendChannelMessage: vi.fn(async () => {}),
        setPreviewItem: vi.fn(),
        isPublishingAttachment: false,
        setIsPublishingAttachment: vi.fn(),
        attachmentDownloadStatus: {},
        setAttachmentDownloadStatus: vi.fn(),
        setFailedAttachment: vi.fn(),
        pendingAttachmentPreviewsRef: { current: new Map() } as never,
        activeAttachmentDownloadsRef: { current: new Set() } as never,
      })
    )

    await act(async () => {
      await result.current.handleSavePreviewItem({
        cid: 'c',
        fileName: 'f.bin',
      })
    })
    expect(true).toBe(true)
  })
})

describe('attachment status type', () => {
  it('keeps the state shape in sync with the shared model', () => {
    const state: AttachmentDownloadState = { status: 'ready' }
    expect(state.status).toBe('ready')
  })
})
