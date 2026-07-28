import {
  forwardRef,
  type ChangeEvent,
  type ComponentProps,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import {
  MilkdownEditor,
  type MilkdownEditorRef,
} from '~/components/MilkdownEditor'
import FilePreviewOverlay, {
  type FilePreviewItem,
} from '~/components/FilePreviewOverlay'
import { fileApi, getPublishFileErrorMessage } from '~/lib/fileApi'
import { getFileSubtype } from '~/lib/filePreview'
import { useI18n } from '~/lib/i18n'
import {
  buildMostMarkdownAttachment,
  createMostMarkdownImageUrlCache,
  parseMostMarkdownReference,
  type MostMarkdownImageUrlCache,
} from '~/lib/mostMarkdown'
import { getPublishFileLimitViolation } from '~/lib/publishLimits'
import { saveFileToLocal } from '~/lib/saveLocalFile'
import { useAppStore } from '~/stores/useAppStore'
import { useUserStore } from '~/stores/userStore'
import { DOWNLOAD_TIMEOUT } from '~server/src/config.js'
import { buildMostLink } from '~server/src/core/mostLink.js'
import {
  getApiErrorMessage,
  getApiRequestHeaders,
  getBackendUrlExport,
} from '~server/src/utils/api.js'

type MostMarkdownEditorProps = Omit<
  ComponentProps<typeof MilkdownEditor>,
  'onImageUpload' | 'onMostLinkOpen' | 'ref' | 'resolveImageUrl'
> & {
  onAttachmentPublishingChange?: (isPublishing: boolean) => void
}

export interface MostMarkdownEditorRef extends MilkdownEditorRef {
  openAttachmentPicker: () => void
}

type PublishedAttachment = {
  fileName: string
  link: string
}

const NOTE_FILE_ROOT = 'note-file'
const activeCidDownloads = new Map<string, Promise<void>>()
const DOWNLOAD_EVENT_GRACE_MS = 10000

function getDownloadError(outcome: {
  status: string
  payload: { error?: string }
}) {
  if (outcome.status === 'cancelled') return 'Download cancelled'
  return outcome.payload.error || 'Download failed'
}

async function waitForDownloadTask(taskId: string, link: string) {
  await new Promise<void>((resolve, reject) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let unsubscribe = () => {}

    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      unsubscribe()
      if (error) reject(error)
      else resolve()
    }

    const inspect = (state: ReturnType<typeof useAppStore.getState>) => {
      const outcome = state.downloadTaskOutcomes.find(
        item => item.taskId === taskId
      )
      if (!outcome) return
      if (outcome.status === 'completed' && outcome.kind === 'file') {
        finish()
        return
      }
      finish(new Error(getDownloadError(outcome)))
    }

    unsubscribe = useAppStore.subscribe(inspect)
    inspect(useAppStore.getState())
    if (settled) return

    void useAppStore
      .getState()
      .loadDownloadTasks()
      .then(tasks => {
        if (settled || tasks.some(task => task.taskId === taskId)) return
        return fileApi
          .checkDownload(link, { timeout: 1000, requestTimeout: 6000 })
          .then(result => {
            if (result.localAvailable && result.kind !== 'collection') {
              finish()
              return
            }
            finish(new Error('Download failed'))
          })
      })
      .catch(() => {})

    timer = setTimeout(() => {
      void fileApi
        .checkDownload(link, { timeout: 1000, requestTimeout: 6000 })
        .then(result => {
          if (result.localAvailable && result.kind !== 'collection') {
            finish()
            return
          }
          finish(new Error('Download timed out'))
        })
        .catch(() => finish(new Error('Download timed out')))
    }, DOWNLOAD_TIMEOUT + DOWNLOAD_EVENT_GRACE_MS)
  })
}

async function downloadCidReference(link: string) {
  const reference = parseMostMarkdownReference(link)
  if (!reference) throw new Error('Invalid most:// link')

  const state = useAppStore.getState()
  const existingTask = state.downloadTasks.find(
    task => task.cid === reference.cid
  )
  if (existingTask) {
    if (existingTask.kind === 'collection') {
      throw new Error('Collection references are not supported')
    }
    await waitForDownloadTask(existingTask.taskId, reference.link)
    return
  }

  const result = await fileApi.downloadFileInBackground(reference.link)
  if (result.kind === 'collection') {
    throw new Error('Collection references are not supported')
  }
  if (result.alreadyExists || result.fileName) return
  if (!result.taskId) throw new Error('Download did not start')

  const now = Date.now()
  useAppStore.getState().upsertDownloadTask({
    taskId: result.taskId,
    cid: reference.cid,
    fileName: reference.fileName,
    kind: 'file',
    status: 'starting',
    progress: 0,
    loadedBytes: 0,
    totalBytes: 0,
    completedFiles: 0,
    totalFiles: 0,
    startedAt: now,
    updatedAt: now,
  })
  await waitForDownloadTask(result.taskId, reference.link)
}

async function ensureCidReferenceLocal(link: string, identityAddress: string) {
  const reference = parseMostMarkdownReference(link)
  if (!reference) throw new Error('Invalid most:// link')

  const key = `${getBackendUrlExport()}\u0000${identityAddress}\u0000${reference.cid}`
  const activeDownload = activeCidDownloads.get(key)
  if (activeDownload) {
    await activeDownload
    return reference
  }

  const download = downloadCidReference(reference.link)
  activeCidDownloads.set(key, download)
  try {
    await download
    return reference
  } finally {
    if (activeCidDownloads.get(key) === download) {
      activeCidDownloads.delete(key)
    }
  }
}

export const MostMarkdownEditor = forwardRef<
  MostMarkdownEditorRef,
  MostMarkdownEditorProps
>(function MostMarkdownEditor(
  { content, readOnly, onChange, onAttachmentPublishingChange, ...editorProps },
  forwardedRef
) {
  const { t } = useI18n()
  const editorRef = useRef<MilkdownEditorRef>(null)
  const attachmentInputRef = useRef<HTMLInputElement>(null)
  const imageUrlCacheRef = useRef<MostMarkdownImageUrlCache | null>(null)
  const reportedImageErrorsRef = useRef(new Set<string>())
  const [isPublishing, setIsPublishing] = useState(false)
  const [previewItem, setPreviewItem] = useState<FilePreviewItem | null>(null)

  const hasBackend = useAppStore(state => state.hasBackend)
  const addToast = useAppStore(state => state.addToast)
  const openConnectModal = useAppStore(state => state.openConnectModal)
  const identity = useUserStore(state => state.identity)
  const openLoginModal = useUserStore(state => state.openLoginModal)

  useImperativeHandle(
    forwardedRef,
    () => ({
      setMarkdown: markdown => editorRef.current?.setMarkdown(markdown),
      getMarkdown: () => editorRef.current?.getMarkdown() || '',
      insertMarkdown: markdown => editorRef.current?.insertMarkdown(markdown),
      openAttachmentPicker: () => {
        if (!isPublishing) attachmentInputRef.current?.click()
      },
    }),
    [isPublishing]
  )

  useEffect(() => {
    if (!imageUrlCacheRef.current) {
      imageUrlCacheRef.current = createMostMarkdownImageUrlCache()
    }
    const imageUrlCache = imageUrlCacheRef.current
    return () => {
      imageUrlCache.dispose()
      if (imageUrlCacheRef.current === imageUrlCache) {
        imageUrlCacheRef.current = null
      }
    }
  }, [])

  const requireFileNode = useCallback(() => {
    if (!identity) {
      openLoginModal()
      return false
    }
    if (hasBackend !== true) {
      openConnectModal()
      return false
    }
    return true
  }, [hasBackend, identity, openConnectModal, openLoginModal])

  const publishAttachment = useCallback(
    async (file: File): Promise<PublishedAttachment> => {
      if (!requireFileNode()) throw new Error(t('note.attachment.unavailable'))

      try {
        const policy = await fileApi.getNodePolicy().catch(() => null)
        const limitMessage = getPublishFileLimitViolation(file, policy, t)
        if (limitMessage) throw new Error(limitMessage)

        const targetFileName = `${NOTE_FILE_ROOT}/${file.name}`
        const result = await fileApi.publishFile(file, targetFileName)
        const publishedFileName = result.fileName || targetFileName
        const link = result.link || buildMostLink(result.cid, publishedFileName)
        addToast(t('note.attachment.published'), 'success')
        return { fileName: file.name, link }
      } catch (error) {
        const message = await getPublishFileErrorMessage(
          error,
          t('note.attachment.publishFailed'),
          t,
          file.name
        )
        addToast(message, 'error')
        throw error
      }
    },
    [addToast, requireFileNode, t]
  )

  const handleImageUpload = useCallback(
    async (file: File) => (await publishAttachment(file)).link,
    [publishAttachment]
  )

  const resolveImageUrl = useCallback(
    async (url: string) => {
      const reference = parseMostMarkdownReference(url)
      if (!reference) return url
      if (!requireFileNode() || !identity) {
        throw new Error(t('note.attachment.unavailable'))
      }

      try {
        if (!imageUrlCacheRef.current) {
          imageUrlCacheRef.current = createMostMarkdownImageUrlCache()
        }
        return await imageUrlCacheRef.current.getOrCreate(
          reference.cid,
          async () => {
            await ensureCidReferenceLocal(reference.link, identity.address)
            const requestPath = `/api/files/${reference.cid}/download`
            const response = await fetch(
              fileApi.getFileDownloadUrl(reference.cid),
              {
                headers: await getApiRequestHeaders('GET', requestPath),
              }
            )
            if (!response.ok) {
              throw new Error(t('note.attachment.downloadFailed'))
            }
            return response.blob()
          }
        )
      } catch (error) {
        if (!reportedImageErrorsRef.current.has(reference.cid)) {
          reportedImageErrorsRef.current.add(reference.cid)
          addToast(
            await getApiErrorMessage(
              error,
              t('note.attachment.downloadFailed')
            ),
            'error'
          )
        }
        throw error
      }
    },
    [addToast, identity, requireFileNode, t]
  )

  const handleMostLinkOpen = useCallback(
    async (link: string) => {
      const reference = parseMostMarkdownReference(link)
      if (!reference || !requireFileNode() || !identity) return

      try {
        await ensureCidReferenceLocal(reference.link, identity.address)
        setPreviewItem({
          cid: reference.cid,
          fileName: reference.fileName.split('/').pop() || reference.fileName,
          subtype: getFileSubtype(reference.fileName),
        })
      } catch (error) {
        addToast(
          await getApiErrorMessage(error, t('note.attachment.downloadFailed')),
          'error'
        )
      }
    },
    [addToast, identity, requireFileNode, t]
  )

  const handleAttachmentChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (!file || isPublishing) return

      setIsPublishing(true)
      onAttachmentPublishingChange?.(true)
      try {
        const attachment = await publishAttachment(file)
        editorRef.current?.insertMarkdown(
          buildMostMarkdownAttachment({
            link: attachment.link,
            fileName: attachment.fileName,
            image: file.type.startsWith('image/'),
          })
        )
      } catch {
        // publishAttachment already reports the actionable error.
      } finally {
        setIsPublishing(false)
        onAttachmentPublishingChange?.(false)
      }
    },
    [isPublishing, onAttachmentPublishingChange, publishAttachment]
  )

  const handleSavePreviewItem = useCallback(
    async (item: FilePreviewItem) => {
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
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return
        addToast(
          await getApiErrorMessage(error, t('app.toast.getFileFailed')),
          'error'
        )
      }
    },
    [addToast, t]
  )

  return (
    <div className="most-markdown-editor">
      {!readOnly && onChange && (
        <input
          ref={attachmentInputRef}
          type="file"
          hidden
          onChange={event => void handleAttachmentChange(event)}
        />
      )}

      <MilkdownEditor
        {...editorProps}
        ref={editorRef}
        content={content}
        readOnly={readOnly}
        onChange={onChange}
        onImageUpload={handleImageUpload}
        resolveImageUrl={resolveImageUrl}
        onMostLinkOpen={handleMostLinkOpen}
      />

      {previewItem && (
        <FilePreviewOverlay
          item={previewItem}
          isBackendReady={hasBackend === true}
          getFileDownloadUrl={fileApi.getFileDownloadUrl}
          onSaveAs={handleSavePreviewItem}
          onClose={() => setPreviewItem(null)}
        />
      )}
    </div>
  )
})
