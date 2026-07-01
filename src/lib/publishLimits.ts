import { formatBytes } from '~/lib/format'
import type { MessageKey } from '~/lib/i18n'

type Translate = (
  key: MessageKey,
  params?: Record<string, string | number>
) => string

export interface NodePolicy {
  maxFileSizeBytes?: number | null
}

interface PublishFileLike {
  name: string
  size: number
}

interface PublishFileSizeDetails {
  fileName?: string
  sizeBytes?: number | null
  maxFileSizeBytes?: number | null
}

interface ApiErrorPayload {
  code?: string
  details?: {
    sizeBytes?: number
    maxFileSizeBytes?: number
  }
}

function normalizeLimit(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

export function getPublishFileTooLargeMessage(
  details: PublishFileSizeDetails,
  t: Translate
) {
  const fileName = details.fileName || ''
  const sizeBytes = normalizeLimit(details.sizeBytes)
  const maxFileSizeBytes = normalizeLimit(details.maxFileSizeBytes)

  return t('app.publish.fileTooLarge', {
    fileName,
    maxSize:
      maxFileSizeBytes === null ? formatBytes(0) : formatBytes(maxFileSizeBytes),
    fileSize: sizeBytes === null ? formatBytes(0) : formatBytes(sizeBytes),
  })
}

export function getPublishFileLimitViolation(
  file: PublishFileLike,
  policy: NodePolicy | null | undefined,
  t: Translate
) {
  const maxFileSizeBytes = normalizeLimit(policy?.maxFileSizeBytes)
  if (maxFileSizeBytes === null || file.size <= maxFileSizeBytes) return ''

  return getPublishFileTooLargeMessage(
    {
      fileName: file.name,
      sizeBytes: file.size,
      maxFileSizeBytes,
    },
    t
  )
}

export function getPublishFileTooLargeMessageFromPayload(
  payload: ApiErrorPayload,
  t: Translate,
  fallbackFileName = ''
) {
  if (payload.code !== 'FILE_SIZE_ERROR') return ''
  if (normalizeLimit(payload.details?.maxFileSizeBytes) === null) return ''

  return getPublishFileTooLargeMessage(
    {
      fileName: fallbackFileName,
      sizeBytes: payload.details?.sizeBytes,
      maxFileSizeBytes: payload.details?.maxFileSizeBytes,
    },
    t
  )
}
