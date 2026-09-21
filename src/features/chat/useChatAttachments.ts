/**
 * Chat attachment actions.
 *
 * Extracted from `ChatPage.tsx` unchanged: preview, availability check, retry,
 * download, publish-and-send, and the open dispatch.
 *
 * State and refs stay owned by the caller. `pendingAttachmentPreviewsRef` is
 * shared with the socket event handler, which resolves a pending preview when
 * the daemon reports the download finished, so both sides must address the same
 * instance.
 */
import { useCallback, useRef } from 'react'

import type { Channel, ChannelAttachment } from '~/lib/channelApi'
import {
  fileApi,
  getPublishFileErrorMessage,
  getPublishFileLimitViolation,
} from '~/lib/fileApi'
import { getFileSubtype, type FileSubtype } from '~/lib/filePreview'
import type { MessageKey } from '~/lib/i18n'
import { getLocalizedDownloadLinkValidationMessage } from '~/lib/i18n/downloadValidation'
import { saveFileToLocal } from '~/lib/saveLocalFile'
import { getApiRequestHeaders } from '~server/src/utils/api'
import { buildMostLink } from '~server/src/core/mostLink.js'
import {
  CHAT_FILE_ROOT,
  getAttachmentKind,
  getChannelId,
  type AttachmentDownloadState,
} from './chatPageModel'

/** Availability probe timeout, in ms. */
const ATTACHMENT_CHECK_TIMEOUT_MS = 10000
const ATTACHMENT_CHECK_REQUEST_TIMEOUT_MS = ATTACHMENT_CHECK_TIMEOUT_MS + 2000

export interface ChatAttachmentPreviewItem {
  cid: string
  fileName: string
  subtype: FileSubtype
}

export type ChatAttachmentDownloadStatusMap = Record<
  string,
  AttachmentDownloadState
>

interface UseChatAttachmentsOptions {
  t: (key: MessageKey, params?: Record<string, string | number>) => string
  addToast: (message: string, type: 'success' | 'error' | 'warning') => void
  requireLogin: () => boolean
  requireBackendReady: () => boolean
  getActiveChannel: () => Channel | null
  sendChannelMessage: (
    content: string,
    attachment: ChannelAttachment
  ) => Promise<unknown>
  setPreviewItem: (item: ChatAttachmentPreviewItem | null) => void
  isPublishingAttachment: boolean
  setIsPublishingAttachment: (value: boolean) => void
  attachmentDownloadStatus: ChatAttachmentDownloadStatusMap
  setAttachmentDownloadStatus: (
    updater: (
      previous: ChatAttachmentDownloadStatusMap
    ) => ChatAttachmentDownloadStatusMap
  ) => void
  setFailedAttachment: (attachment: ChannelAttachment | null) => void
  pendingAttachmentPreviewsRef: React.RefObject<Map<string, ChannelAttachment>>
  activeAttachmentDownloadsRef: React.RefObject<Set<string>>
}

export function useChatAttachments(options: UseChatAttachmentsOptions) {
  const {
    t,
    addToast,
    requireLogin,
    requireBackendReady,
    getActiveChannel,
    sendChannelMessage,
    setPreviewItem,
    isPublishingAttachment,
    setIsPublishingAttachment,
    attachmentDownloadStatus,
    setAttachmentDownloadStatus,
    setFailedAttachment,
    pendingAttachmentPreviewsRef,
    activeAttachmentDownloadsRef,
  } = options

  /** Upload file name for error reporting, held in a ref to avoid a re-render. */
  const publishFileNameRef = useRef('')

  const setStatus = useCallback(
    (cid: string, state: AttachmentDownloadState) => {
      setAttachmentDownloadStatus(previous => ({ ...previous, [cid]: state }))
    },
    [setAttachmentDownloadStatus]
  )

  const openAttachmentPreview = useCallback(
    (attachment: ChannelAttachment, fileName = attachment.fileName) => {
      const subtype = getFileSubtype(fileName)
      setPreviewItem({
        cid: attachment.cid,
        fileName,
        subtype: subtype === 'file' ? attachment.kind : subtype,
      })
    },
    [setPreviewItem]
  )

  const handleSavePreviewItem = useCallback(
    async (item: { cid: string; fileName: string }) => {
      if (!requireLogin()) return
      if (!requireBackendReady()) return

      try {
        const result = await saveFileToLocal({
          cid: item.cid,
          fileName: item.fileName,
          getFileDownloadUrl: fileApi.getFileDownloadUrl,
          getRequestHeaders: getApiRequestHeaders,
          loadFailedMessage: t('app.toast.getFileFailed'),
        })
        addToast(
          result.method === 'picker'
            ? t('app.toast.fileSaved')
            : t('app.toast.fileDownloaded'),
          'success'
        )
      } catch (err) {
        const error = err as Error
        if (error.name !== 'AbortError') {
          addToast(
            t('app.saveFailedWithError', { error: error.message }),
            'error'
          )
        }
      }
    },
    [addToast, requireBackendReady, requireLogin, t]
  )

  const checkAttachmentAvailability = useCallback(
    async (attachment: ChannelAttachment) => {
      const validationMessage = getLocalizedDownloadLinkValidationMessage(
        attachment.link,
        t
      )
      if (validationMessage) {
        setStatus(attachment.cid, {
          status: 'error',
          message: validationMessage,
        })
        return false
      }

      try {
        setStatus(attachment.cid, { status: 'checking' })
        const checkResult = await fileApi.checkDownload(attachment.link, {
          timeout: ATTACHMENT_CHECK_TIMEOUT_MS,
          requestTimeout: ATTACHMENT_CHECK_REQUEST_TIMEOUT_MS,
        })
        setStatus(attachment.cid, {
          status: checkResult.alreadyExists ? 'available' : 'ready',
          message: checkResult.alreadyExists
            ? t('chat.attachment.localAvailable')
            : t('chat.attachment.downloadAvailable'),
        })
        return true
      } catch {
        setStatus(attachment.cid, {
          status: 'error',
          message: t('chat.attachment.noSeedsTitle'),
        })
        return false
      }
    },
    [setStatus, t]
  )

  const startAttachmentDownload = useCallback(
    async (attachment: ChannelAttachment) => {
      if (activeAttachmentDownloadsRef.current.has(attachment.cid)) return
      activeAttachmentDownloadsRef.current.add(attachment.cid)
      setStatus(attachment.cid, {
        status: 'downloading',
        message: t('chat.attachment.downloading'),
      })
      try {
        const result = await fileApi.downloadFile(attachment.link)
        if (result.alreadyExists || result.fileName) {
          activeAttachmentDownloadsRef.current.delete(attachment.cid)
          setStatus(attachment.cid, {
            status: 'available',
            message: t('chat.attachment.previewAvailable'),
          })
          openAttachmentPreview(
            { ...attachment, fileName: result.fileName || attachment.fileName },
            result.fileName || attachment.fileName
          )
          return
        }

        if (result.taskId) {
          pendingAttachmentPreviewsRef.current.set(result.taskId, attachment)
          addToast(t('chat.attachment.downloadStarted'), 'success')
        }
      } catch {
        activeAttachmentDownloadsRef.current.delete(attachment.cid)
        setStatus(attachment.cid, {
          status: 'error',
          message: t('chat.attachment.noSeedsTitle'),
        })
      }
    },
    [
      activeAttachmentDownloadsRef,
      addToast,
      openAttachmentPreview,
      pendingAttachmentPreviewsRef,
      setStatus,
      t,
    ]
  )

  const handleRetryAttachmentCheck = useCallback(
    async (attachment: ChannelAttachment) => {
      setFailedAttachment(null)
      const ok = await checkAttachmentAvailability(attachment)
      if (ok) {
        await startAttachmentDownload(attachment)
      }
    },
    [checkAttachmentAvailability, setFailedAttachment, startAttachmentDownload]
  )

  const handleOpenAttachment = useCallback(
    async (attachment: ChannelAttachment) => {
      if (!requireLogin()) return
      if (!requireBackendReady()) return
      const currentState = attachmentDownloadStatus[attachment.cid]
      if (
        currentState?.status === 'checking' ||
        currentState?.status === 'downloading'
      ) {
        return
      }

      if (currentState?.status === 'error') {
        setFailedAttachment(attachment)
        return
      }

      if (
        currentState?.status === 'ready' ||
        currentState?.status === 'available'
      ) {
        await startAttachmentDownload(attachment)
        return
      }

      if (!currentState) {
        const ok = await checkAttachmentAvailability(attachment)
        if (ok) {
          await startAttachmentDownload(attachment)
        }
      }
    },
    [
      attachmentDownloadStatus,
      checkAttachmentAvailability,
      requireBackendReady,
      requireLogin,
      setFailedAttachment,
      startAttachmentDownload,
    ]
  )

  const handleSelectAttachmentFiles = useCallback(
    async (files: FileList | File[] | null) => {
      const activeChannel = getActiveChannel()
      if (!files || files.length === 0 || !activeChannel) return
      if (!requireLogin()) return
      if (!requireBackendReady()) return
      if (isPublishingAttachment) return

      setIsPublishingAttachment(true)
      publishFileNameRef.current = ''
      try {
        const publishPolicy = await fileApi.getNodePolicy().catch(() => null)
        for (const file of Array.from(files)) {
          publishFileNameRef.current = file.name
          const limitMessage = getPublishFileLimitViolation(
            file,
            publishPolicy,
            t
          )
          if (limitMessage) {
            addToast(limitMessage, 'error')
            continue
          }

          const targetFileName = `${CHAT_FILE_ROOT}/${getChannelId(activeChannel)}/${file.name}`
          const result = await fileApi.publishFile(file, targetFileName)
          const fileName = result.fileName || targetFileName
          const link = result.link || buildMostLink(result.cid, fileName)
          const attachment: ChannelAttachment = {
            kind: getAttachmentKind(file, fileName),
            cid: result.cid,
            fileName,
            link,
            mimeType: file.type || undefined,
            size: file.size,
          }
          await sendChannelMessage(link, attachment)
        }
      } catch (err) {
        addToast(
          await getPublishFileErrorMessage(
            err,
            t('chat.error.attachmentSend'),
            t,
            publishFileNameRef.current
          ),
          'error'
        )
      } finally {
        setIsPublishingAttachment(false)
      }
    },
    [
      addToast,
      getActiveChannel,
      isPublishingAttachment,
      requireBackendReady,
      requireLogin,
      sendChannelMessage,
      setIsPublishingAttachment,
      t,
    ]
  )

  return {
    openAttachmentPreview,
    handleSavePreviewItem,
    checkAttachmentAvailability,
    handleRetryAttachmentCheck,
    startAttachmentDownload,
    handleOpenAttachment,
    handleSelectAttachmentFiles,
  }
}
