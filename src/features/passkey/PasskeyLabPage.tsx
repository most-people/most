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
  PASSKEY_LAB_URL,
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

type LabResult = {
  address: string
  fingerprint: string
}

type LabStatus =
  'ready' | 'working' | 'waiting' | 'returning' | 'verified' | 'failed'

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
  const [status, setStatus] = useState<LabStatus>('ready')
  const [result, setResult] = useState<LabResult | null>(null)
  const [errorKey, setErrorKey] = useState<MessageKey | null>(null)
  const pendingRef = useRef<ReturnType<
    typeof createPasskeyBridgeRequest
  > | null>(null)

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
  }, [])

  useEffect(() => {
    if (canonicalOrigin) return

    const unsubscribe = window.electronAPI?.onPasskeyLabCallback?.(
      callbackUrl => {
        void consumeCallback(callbackUrl).catch(error => {
          setErrorKey(getErrorMessageKey(error))
          setStatus('failed')
        })
      }
    )
    return () => unsubscribe?.()
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

      if (nativeBridge) {
        const callbackUrl = createPasskeyBridgeCallback({
          state: nativeBridge.state,
          recipientPublicKey: nativeBridge.recipientPublicKey,
          danger: identity.danger,
          credentialId,
        })
        setStatus('returning')
        window.location.replace(callbackUrl)
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
    if (!window.electronAPI?.isElectron) {
      window.location.assign(PASSKEY_LAB_URL)
      return
    }

    const pending = createPasskeyBridgeRequest()
    pendingRef.current = pending
    setResult(null)
    setErrorKey(null)
    setStatus('waiting')

    try {
      const opened = await window.electronAPI.openPasskeyLab?.(
        buildPasskeyLabBridgeUrl(pending, mode)
      )
      if (!opened) {
        setErrorKey('passkey.error.bridge')
        setStatus('failed')
      }
    } catch {
      setErrorKey('passkey.error.bridge')
      setStatus('failed')
    }
  }

  const forcedMode = nativeBridge?.mode as PasskeyCeremonyMode | undefined
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
              disabled={working}
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

        {nativeBridge ? (
          <p className="passkey-lab-bridge-note">
            {t('passkey.bridge.native')}
          </p>
        ) : null}
      </section>
    </main>
  )
}
