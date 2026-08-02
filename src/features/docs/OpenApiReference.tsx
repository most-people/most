import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ApiReferenceReact,
  type AnyApiReferenceConfiguration,
} from '@scalar/api-reference-react'
import '@scalar/api-reference-react/style.css'
import packageJson from '../../../package.json'

import { ConfirmModal } from '~/components/ui'
import { useI18n } from '~/lib/i18n'
import { createOpenApiSpec } from '~server/src/http/openapi.js'
import {
  getApiRequestHeaders,
  getBackendUrlExport,
} from '~server/src/utils/api'
import { createOpenApiFetch } from './openapiRequest.js'

interface ConfirmationRequest {
  method: string
  path: string
  operationId: string
  summary: string
}

interface PendingConfirmation extends ConfirmationRequest {
  resolve: (confirmed: boolean) => void
}

function OpenApiReference() {
  const { locale, t } = useI18n()
  const pendingRef = useRef<PendingConfirmation | null>(null)
  const [pending, setPending] = useState<PendingConfirmation | null>(null)
  const serverUrl = getBackendUrlExport() || 'http://localhost:1976'
  const colorMode =
    document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
  const spec = useMemo(
    () => createOpenApiSpec({ serverUrl, version: packageJson.version }),
    [serverUrl]
  )

  const confirmRequest = useCallback(
    (request: ConfirmationRequest) =>
      new Promise<boolean>(resolve => {
        pendingRef.current?.resolve(false)
        const nextPending = { ...request, resolve }
        pendingRef.current = nextPending
        setPending(nextPending)
      }),
    []
  )

  const customFetch = useMemo(
    () =>
      createOpenApiFetch({
        spec,
        confirmRequest,
        getRequestHeaders: getApiRequestHeaders,
      }),
    [confirmRequest, spec]
  )

  const configuration = useMemo<AnyApiReferenceConfiguration>(
    () => ({
      content: spec,
      customFetch,
      darkMode: colorMode === 'dark',
      defaultHttpClient: { targetKey: 'shell', clientKey: 'curl' },
      forceDarkModeState: colorMode,
      hideDarkModeToggle: true,
      layout: 'modern',
      localization: { locale: locale === 'zh-CN' ? 'zh-CN' : 'en' },
      modelsSectionLabel: 'Schemas',
      operationTitleSource: 'summary',
      persistAuth: false,
      proxyUrl: '',
      showDeveloperTools: 'never',
      showOperationId: true,
      showSidebar: true,
      telemetry: false,
      theme: 'none',
      withDefaultFonts: false,
    }),
    [colorMode, customFetch, locale, spec]
  )

  useEffect(
    () => () => {
      pendingRef.current?.resolve(false)
      pendingRef.current = null
    },
    []
  )

  function settleConfirmation(confirmed: boolean) {
    pendingRef.current?.resolve(confirmed)
    pendingRef.current = null
    setPending(null)
  }

  return (
    <>
      <div className="docs-api-target">
        <span>{t('docs.openapi.target')}</span>
        <code translate="no">{serverUrl}</code>
      </div>
      <div className="docs-scalar" data-testid="openapi-reference">
        <ApiReferenceReact configuration={configuration} />
      </div>
      {pending && (
        <ConfirmModal
          title={t('docs.openapi.confirm.title')}
          message={t('docs.openapi.confirm.message', {
            method: pending.method,
            path: pending.path,
          })}
          confirmText={t('docs.openapi.confirm.action')}
          danger
          onConfirm={() => settleConfirmation(true)}
          onClose={() => settleConfirmation(false)}
        />
      )}
    </>
  )
}

export default OpenApiReference
