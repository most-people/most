import React, { useEffect, useState } from 'react'
import { FileText, Loader, Music, X } from 'lucide-react'
import type { FileSubtype } from '~/lib/filePreview'
import { useI18n } from '~/lib/i18n'
import { getApiRequestHeaders } from '~server/src/utils/api'

export interface FilePreviewItem {
  cid: string
  fileName: string
  subtype: FileSubtype
}

interface FilePreviewOverlayProps {
  item: FilePreviewItem
  isBackendReady: boolean
  getFileDownloadUrl: (cid: string) => string
  onClose: () => void
}

function isMediaSubtype(subtype: FileSubtype) {
  return subtype === 'image' || subtype === 'video' || subtype === 'audio'
}

export default function FilePreviewOverlay({
  item,
  isBackendReady,
  getFileDownloadUrl,
  onClose,
}: FilePreviewOverlayProps) {
  const { t } = useI18n()
  const [previewText, setPreviewText] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewBlobUrl, setPreviewBlobUrl] = useState('')
  const [previewError, setPreviewError] = useState('')

  useEffect(() => {
    if (item.subtype !== 'text') return

    let cancelled = false
    setPreviewText('')
    setPreviewError('')

    if (!isBackendReady) {
      setPreviewText(t('preview.loadFailed'))
      return
    }

    setPreviewLoading(true)
    ;(async () => {
      try {
        const res = await fetch(getFileDownloadUrl(item.cid), {
          headers: {
            ...(await getApiRequestHeaders(
              'GET',
              `/api/files/${item.cid}/download`
            )),
            Range: 'bytes=0-9999',
          },
        })
        if (!res.ok) throw new Error(t('preview.loadFailed'))
        const text = await res.text()
        if (!cancelled) setPreviewText(text || t('preview.emptyFile'))
      } catch {
        if (!cancelled) setPreviewText(t('preview.loadFailed'))
      } finally {
        if (!cancelled) setPreviewLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [getFileDownloadUrl, isBackendReady, item.cid, item.subtype])

  useEffect(() => {
    if (!isMediaSubtype(item.subtype)) {
      setPreviewBlobUrl('')
      return
    }

    setPreviewBlobUrl('')
    setPreviewError('')

    if (!isBackendReady) {
      setPreviewError(t('preview.loadFailed'))
      return
    }

    let revokedUrl = ''
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(getFileDownloadUrl(item.cid), {
          headers: await getApiRequestHeaders(
            'GET',
            `/api/files/${item.cid}/download`
          ),
        })
        if (!res.ok) throw new Error(t('preview.loadFailed'))
        const url = URL.createObjectURL(await res.blob())
        revokedUrl = url
        if (!cancelled) setPreviewBlobUrl(url)
      } catch {
        if (!cancelled) setPreviewError(t('preview.loadFailed'))
      }
    })()

    return () => {
      cancelled = true
      if (revokedUrl) URL.revokeObjectURL(revokedUrl)
    }
  }, [getFileDownloadUrl, isBackendReady, item.cid, item.subtype])

  return (
    <div className="preview-overlay" onClick={onClose}>
      <button
        type="button"
        className="preview-close"
        onClick={onClose}
      aria-label={t('preview.close')}
      >
        <X size={20} />
      </button>
      <div onClick={e => e.stopPropagation()}>
        {item.subtype === 'image' && (
          <div className="preview-media-wrapper">
            {previewBlobUrl ? (
              <img src={previewBlobUrl} alt={item.fileName} translate="no" />
            ) : previewError ? (
              <div className="preview-unsupported">
                <FileText size={48} className="preview-file-icon" />
                <p translate="no">{item.fileName}</p>
                <p className="preview-unsupported-hint">{previewError}</p>
              </div>
            ) : (
              <div className="preview-loading">
                <div className="preview-loading-spinner" />
              </div>
            )}
          </div>
        )}
        {item.subtype === 'video' && (
          <div className="preview-media-wrapper">
            {previewBlobUrl ? (
              <video src={previewBlobUrl} controls />
            ) : previewError ? (
              <div className="preview-unsupported">
                <FileText size={48} className="preview-file-icon" />
                <p translate="no">{item.fileName}</p>
                <p className="preview-unsupported-hint">{previewError}</p>
              </div>
            ) : (
              <div className="preview-loading">
                <div className="preview-loading-spinner" />
              </div>
            )}
          </div>
        )}
        {item.subtype === 'audio' && (
          <div className="preview-audio">
            <div className="preview-audio-icon">
              <Music size={36} color="var(--accent)" />
            </div>
            <p className="preview-audio-filename" translate="no">
              {item.fileName}
            </p>
            {previewBlobUrl ? (
              <audio
                className="preview-audio-player"
                src={previewBlobUrl}
                controls
              />
            ) : (
              <div className="preview-text-loading">
                {previewError ? (
                  <p>{previewError}</p>
                ) : (
                  <>
                    <Loader size={24} className="preview-text-spinner" />
                    <p>{t('preview.audioLoading')}</p>
                  </>
                )}
              </div>
            )}
          </div>
        )}
        {item.subtype === 'file' && (
          <div className="preview-unsupported">
            <FileText size={48} className="preview-file-icon" />
            <p translate="no">{item.fileName}</p>
            <p className="preview-unsupported-hint">
              {t('preview.unsupported')}
            </p>
          </div>
        )}
        {item.subtype === 'text' && (
          <div className="preview-text-container">
            <div className="preview-text-header">
              <span translate="no">{item.fileName}</span>
            </div>
            {previewLoading ? (
              <div className="preview-text-loading">
                <Loader size={24} className="preview-text-spinner" />
                <p>{t('preview.textLoading')}</p>
                <p className="preview-text-loading-hint">
                  {t('preview.firstSyncHint')}
                </p>
              </div>
            ) : (
              <pre className="preview-text" translate="no">
                {previewText || t('preview.emptyFile')}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
