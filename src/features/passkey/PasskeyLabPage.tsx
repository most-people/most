import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CircleAlert,
  ExternalLink,
  Fingerprint,
  KeyRound,
  LoaderCircle,
  ShieldCheck,
} from 'lucide-react'
import { hexlify } from 'ethers'

import {
  createPasskeyIdentity,
  createPasskeyIdentityFromDanger,
  getPasskeyCredentialFingerprint,
  verifyPasskeyIdentity,
} from '~server/src/utils/passkeyIdentity.js'
import {
  buildPasskeyLabBridgeUrl,
  consumePasskeyBridgeCallback,
  createPasskeyBridgeCallback,
  createPasskeyBridgeRequest,
  parsePasskeyLabBridgeRequest,
} from '~server/src/utils/passkeyBridge.js'
import { useI18n, type MessageKey } from '~/lib/i18n'
import {
  PASSKEY_ERROR_CODES,
  runPasskeyCeremony,
  type PasskeyCeremonyMode,
} from '~/lib/passkeyWebAuthn'

const OPENER_READY = 'mostbox-passkey-lab-ready-v1'
const OPENER_REQUEST = 'mostbox-passkey-lab-request-v1'
const OPENER_RESPONSE = 'mostbox-passkey-lab-response-v1'
const ALLOWED_OPENER_ORIGINS = new Set([
  'http://localhost:1976',
  'http://127.0.0.1:1976',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
])

type LabResult = {
  address: string
  fingerprint: string
}

type OpenerBridgeRequest = {
  version: string
  mode: PasskeyCeremonyMode
  state: string
  recipientPublicKey: string
  opener: Window
  openerOrigin: string
}

type LabStatus =
  'ready' | 'working' | 'waiting' | 'returning' | 'verified' | 'failed'

function isMessage(value: unknown, type: string) {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === type
  )
}

function getErrorMessageKey(error: unknown): MessageKey {
  const code = error instanceof Error ? error.message : ''
  if (code === PASSKEY_ERROR_CODES.unavailable) {
    return 'passkey.error.unavailable'
  }
  if (code === PASSKEY_ERROR_CODES.wrongOrigin) {
    return 'passkey.error.wrongOrigin'
  }
  if (code === PASSKEY_ERROR_CODES.cancelled) {
    return 'passkey.error.cancelled'
  }
  if (code === PASSKEY_ERROR_CODES.noCredential) {
    return 'passkey.error.noCredential'
  }
  if (code === PASSKEY_ERROR_CODES.prfUnsupported) {
    return 'passkey.error.prfUnsupported'
  }
  if (code.startsWith('PASSKEY_BRIDGE_')) {
    return 'passkey.error.bridge'
  }
  return 'passkey.error.unknown'
}

export default function PasskeyLabPage() {
  const { t } = useI18n()
  const canonicalOrigin =
    typeof window !== 'undefined' &&
    window.location.origin === 'https://most.box'
  const nativeBridge = useMemo(
    () =>
      canonicalOrigin
        ? parsePasskeyLabBridgeRequest(window.location.href)
        : null,
    [canonicalOrigin]
  )
  const openerMode =
    canonicalOrigin && typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('bridge') === 'opener'
      : false
  const requestedOpenerMode =
    canonicalOrigin && typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('mode')
      : ''
  const [openerBridge, setOpenerBridge] = useState<OpenerBridgeRequest | null>(
    null
  )
  const [status, setStatus] = useState<LabStatus>(
    canonicalOrigin && openerMode ? 'waiting' : 'ready'
  )
  const [result, setResult] = useState<LabResult | null>(null)
  const [errorKey, setErrorKey] = useState<MessageKey | null>(null)
  const pendingRef = useRef<ReturnType<
    typeof createPasskeyBridgeRequest
  > | null>(null)
  const popupRef = useRef<Window | null>(null)
  const pendingModeRef = useRef<PasskeyCeremonyMode | null>(null)

  const consumeCallback = useCallback(async (callbackUrl: string) => {
    const pending = pendingRef.current
    if (!pending) throw new Error('PASSKEY_BRIDGE_INVALID_CALLBACK')
    const payload = consumePasskeyBridgeCallback(callbackUrl, pending)
    const identity = createPasskeyIdentityFromDanger(payload.danger)
    const proof = await verifyPasskeyIdentity(identity)
    if (!proof.verified) throw new Error('PASSKEY_BRIDGE_INVALID_PAYLOAD')

    setResult({
      address: identity.address,
      fingerprint: getPasskeyCredentialFingerprint(payload.credentialId),
    })
    setErrorKey(null)
    setStatus('verified')
    popupRef.current?.close()
    popupRef.current = null
  }, [])

  useEffect(() => {
    if (!openerMode || !window.opener) return

    const requestedMode =
      requestedOpenerMode === 'authenticate' ? 'authenticate' : 'create'
    const handleMessage = (event: MessageEvent) => {
      if (
        !ALLOWED_OPENER_ORIGINS.has(event.origin) ||
        event.source !== window.opener ||
        !isMessage(event.data, OPENER_REQUEST)
      ) {
        return
      }
      const data = event.data as {
        type: string
        v?: unknown
        mode?: unknown
        state?: unknown
        recipientPublicKey?: unknown
      }
      const url = new URL('https://most.box/passkey-lab/')
      url.searchParams.set('bridge', 'native')
      url.searchParams.set('mode', String(data.mode || ''))
      url.searchParams.set('v', String(data.v || ''))
      url.searchParams.set('state', String(data.state || ''))
      url.searchParams.set(
        'recipientPublicKey',
        String(data.recipientPublicKey || '')
      )
      const request = parsePasskeyLabBridgeRequest(url.toString())
      if (!request || request.mode !== requestedMode) return

      setOpenerBridge({
        ...request,
        mode: request.mode as PasskeyCeremonyMode,
        opener: window.opener,
        openerOrigin: event.origin,
      })
      setStatus('ready')
    }

    window.addEventListener('message', handleMessage)
    window.opener.postMessage({ type: OPENER_READY }, '*')
    return () => window.removeEventListener('message', handleMessage)
  }, [openerMode, requestedOpenerMode])

  useEffect(() => {
    if (canonicalOrigin) return

    const handleMessage = (event: MessageEvent) => {
      if (
        event.origin !== 'https://most.box' ||
        event.source !== popupRef.current
      ) {
        return
      }
      if (isMessage(event.data, OPENER_READY)) {
        const pending = pendingRef.current
        const popup = popupRef.current
        if (!pending || !popup) return
        const mode = pendingModeRef.current
        if (!mode) return
        popup.postMessage(
          {
            type: OPENER_REQUEST,
            v: pending.version,
            mode,
            state: pending.state,
            recipientPublicKey: pending.recipientPublicKey,
          },
          'https://most.box'
        )
        return
      }
      if (isMessage(event.data, OPENER_RESPONSE)) {
        const data = event.data as { callbackUrl?: unknown }
        if (typeof data.callbackUrl !== 'string') return
        void consumeCallback(data.callbackUrl).catch(error => {
          setErrorKey(getErrorMessageKey(error))
          setStatus('failed')
        })
      }
    }
    window.addEventListener('message', handleMessage)
    const unsubscribe = window.electronAPI?.onPasskeyLabCallback?.(
      callbackUrl => {
        void consumeCallback(callbackUrl).catch(error => {
          setErrorKey(getErrorMessageKey(error))
          setStatus('failed')
        })
      }
    )
    return () => {
      window.removeEventListener('message', handleMessage)
      unsubscribe?.()
    }
  }, [canonicalOrigin, consumeCallback])

  const runCanonicalCeremony = async (mode: PasskeyCeremonyMode) => {
    setStatus('working')
    setErrorKey(null)
    setResult(null)
    try {
      const credential = await runPasskeyCeremony(mode)
      const credentialId = hexlify(credential.credentialId)
      const identity = createPasskeyIdentity(credential.prfOutput)
      const proof = await verifyPasskeyIdentity(identity)
      if (!proof.verified) throw new Error('PASSKEY_SIGNATURE_INVALID')

      const bridge = nativeBridge || openerBridge
      if (bridge) {
        const callbackUrl = createPasskeyBridgeCallback({
          state: bridge.state,
          recipientPublicKey: bridge.recipientPublicKey,
          danger: identity.danger,
          credentialId,
        })
        setStatus('returning')
        if (openerBridge && bridge === openerBridge) {
          openerBridge.opener.postMessage(
            { type: OPENER_RESPONSE, callbackUrl },
            openerBridge.openerOrigin
          )
          window.close()
        } else {
          window.location.replace(callbackUrl)
        }
        return
      }

      setResult({
        address: identity.address,
        fingerprint: getPasskeyCredentialFingerprint(credentialId),
      })
      setStatus('verified')
    } catch (error) {
      setErrorKey(getErrorMessageKey(error))
      setStatus('failed')
    }
  }

  const startExternalCeremony = async (mode: PasskeyCeremonyMode) => {
    const pending = createPasskeyBridgeRequest()
    popupRef.current?.close()
    pendingRef.current = pending
    pendingModeRef.current = mode
    setResult(null)
    setErrorKey(null)
    setStatus('waiting')

    try {
      if (window.electronAPI?.isElectron) {
        const opened = await window.electronAPI.openPasskeyLab?.(
          buildPasskeyLabBridgeUrl(pending, mode)
        )
        if (!opened) {
          setErrorKey('passkey.error.bridge')
          setStatus('failed')
        }
        return
      }

      const url = new URL('https://most.box/passkey-lab/')
      url.searchParams.set('bridge', 'opener')
      url.searchParams.set('mode', mode)
      const popupName = `mostbox-passkey-${mode}`
      popupRef.current = window.open(url, popupName)
      if (!popupRef.current) {
        setErrorKey('passkey.error.bridge')
        setStatus('failed')
      }
    } catch {
      setErrorKey('passkey.error.bridge')
      setStatus('failed')
    }
  }

  const activeBridge = nativeBridge || openerBridge
  const forcedMode = activeBridge?.mode as PasskeyCeremonyMode | undefined
  const working = status === 'working' || status === 'returning'
  const statusKey: MessageKey =
    status === 'verified'
      ? 'passkey.compat.verified'
      : status === 'working'
        ? 'passkey.compat.working'
        : status === 'waiting'
          ? 'passkey.bridge.waiting'
          : status === 'returning'
            ? 'passkey.compat.returning'
            : status === 'failed'
              ? 'passkey.compat.failed'
              : 'passkey.compat.ready'
  const run = canonicalOrigin ? runCanonicalCeremony : startExternalCeremony

  return (
    <main className="passkey-lab-page">
      <section className="passkey-lab-workspace">
        <header className="passkey-lab-header">
          <span className="passkey-lab-icon" aria-hidden="true">
            <KeyRound size={24} />
          </span>
          <div>
            <h1>{t('passkey.title')}</h1>
            <p>{t(statusKey)}</p>
          </div>
        </header>

        <dl className="passkey-lab-status">
          <div>
            <dt>{t('passkey.field.compatibility')}</dt>
            <dd className={status === 'failed' ? 'is-error' : ''}>
              {status === 'working' || status === 'returning' ? (
                <LoaderCircle className="passkey-lab-spinner" size={16} />
              ) : status === 'failed' ? (
                <CircleAlert size={16} />
              ) : (
                <ShieldCheck size={16} />
              )}
              {errorKey ? t(errorKey) : t(statusKey)}
            </dd>
          </div>
          {result ? (
            <>
              <div>
                <dt>{t('passkey.field.address')}</dt>
                <dd className="passkey-lab-mono">{result.address}</dd>
              </div>
              <div>
                <dt>{t('passkey.field.fingerprint')}</dt>
                <dd className="passkey-lab-mono">
                  <Fingerprint size={16} />
                  {result.fingerprint}
                </dd>
              </div>
            </>
          ) : null}
        </dl>

        <div className="passkey-lab-actions">
          {forcedMode ? (
            <button
              className="btn btn-primary"
              disabled={working || (openerMode && !openerBridge)}
              onClick={() => void run(forcedMode)}
              type="button"
            >
              <KeyRound size={17} />
              {t(
                forcedMode === 'create'
                  ? 'passkey.action.create'
                  : 'passkey.action.authenticate'
              )}
            </button>
          ) : (
            <>
              <button
                className="btn btn-primary"
                disabled={working}
                onClick={() => void run('create')}
                type="button"
              >
                {canonicalOrigin ? (
                  <KeyRound size={17} />
                ) : (
                  <ExternalLink size={17} />
                )}
                {t('passkey.action.create')}
              </button>
              <button
                className="btn btn-secondary"
                disabled={working}
                onClick={() => void run('authenticate')}
                type="button"
              >
                <Fingerprint size={17} />
                {t('passkey.action.authenticate')}
              </button>
            </>
          )}
        </div>

        {activeBridge ? (
          <p className="passkey-lab-bridge-note">
            {t(
              openerBridge ? 'passkey.bridge.opener' : 'passkey.bridge.native'
            )}
          </p>
        ) : null}
      </section>
    </main>
  )
}
