import { useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  ClipboardPaste,
  Copy,
  LoaderCircle,
  RadioTower,
  RefreshCw,
  Share2,
  X,
  XCircle,
} from 'lucide-react'
import { SegmentedControl } from '~/components/ui'
import { useI18n, type MessageKey } from '~/lib/i18n'
import { api, getApiErrorMessage } from '~server/src/utils/api'

type P2PPingRole = 'host' | 'join'
type P2PPingStatus =
  | 'preparing'
  | 'waiting'
  | 'discovering'
  | 'connecting'
  | 'verifying'
  | 'success'
  | 'failed'
  | 'cancelled'
  | 'expired'

type P2PPing = {
  id: string
  role: P2PPingRole
  code: string
  status: P2PPingStatus
  phase: P2PPingStatus
  createdAt: string
  expiresAt: string
  completedAt: string | null
  elapsedMs: number | null
  discoveredPeers: number
  localPeerKey: string | null
  remotePeerKey: string | null
  errorCode: string | null
  errorMessage: string | null
}

type P2PPingResponse = { success: boolean; ping: P2PPing }

const ACTIVE_STATUSES = new Set<P2PPingStatus>([
  'preparing',
  'waiting',
  'discovering',
  'connecting',
  'verifying',
])

const STATUS_KEYS: Record<P2PPingStatus, MessageKey> = {
  preparing: 'ping.p2p.status.preparing',
  waiting: 'ping.p2p.status.waiting',
  discovering: 'ping.p2p.status.discovering',
  connecting: 'ping.p2p.status.connecting',
  verifying: 'ping.p2p.status.verifying',
  success: 'ping.p2p.status.success',
  failed: 'ping.p2p.status.failed',
  cancelled: 'ping.p2p.status.cancelled',
  expired: 'ping.p2p.status.expired',
}

function shortPeerKey(value: string | null) {
  if (!value) return '-'
  return value.length > 40
    ? `${value.slice(0, 22)}...${value.slice(-12)}`
    : value
}

export function P2PPingPanel() {
  const { t, formatNumber } = useI18n()
  const [role, setRole] = useState<P2PPingRole>('host')
  const [code, setCode] = useState('')
  const [ping, setPing] = useState<P2PPing | null>(null)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [now, setNow] = useState(Date.now())
  const active = Boolean(ping && ACTIVE_STATUSES.has(ping.status))

  useEffect(() => {
    if (!active || !ping) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>

    const poll = async () => {
      try {
        const result = await api
          .get(`api/p2p/ping/${ping.id}`)
          .json<P2PPingResponse>()
        if (!cancelled) {
          setPing(result.ping)
          setError('')
        }
      } catch (pollError) {
        if (!cancelled) {
          setError(
            await getApiErrorMessage(pollError, t('ping.p2p.error.status'))
          )
        }
      }
      if (!cancelled) timer = setTimeout(poll, 800)
    }

    timer = setTimeout(poll, 500)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [active, ping?.id, t])

  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [active])

  const remainingSeconds = ping
    ? Math.max(0, Math.ceil((new Date(ping.expiresAt).getTime() - now) / 1000))
    : 0
  const roleOptions = useMemo(
    () => [
      { value: 'host' as const, label: t('ping.p2p.host') },
      { value: 'join' as const, label: t('ping.p2p.join') },
    ],
    [t]
  )

  const start = async (nextRole: P2PPingRole) => {
    setWorking(true)
    setError('')
    try {
      const result = await api
        .post('api/p2p/ping', {
          json: {
            role: nextRole,
            ...(nextRole === 'join' ? { code } : {}),
          },
        })
        .json<P2PPingResponse>()
      setPing(result.ping)
      setRole(nextRole)
    } catch (startError) {
      setError(await getApiErrorMessage(startError, t('ping.p2p.error.start')))
    } finally {
      setWorking(false)
    }
  }

  const cancel = async () => {
    if (!ping) return false
    setWorking(true)
    try {
      const result = await api
        .delete(`api/p2p/ping/${ping.id}`)
        .json<P2PPingResponse>()
      setPing(result.ping)
      return true
    } catch (cancelError) {
      setError(
        await getApiErrorMessage(cancelError, t('ping.p2p.error.cancel'))
      )
      return false
    } finally {
      setWorking(false)
    }
  }

  const regenerate = async () => {
    if (active && !(await cancel())) return
    await start('host')
  }

  const copyCode = async () => {
    if (!ping) return
    await navigator.clipboard.writeText(ping.code)
  }

  const shareCode = async () => {
    if (!ping) return
    const text = t('ping.p2p.shareMessage', { code: ping.code })
    if (navigator.share) {
      await navigator.share({ text })
      return
    }
    await navigator.clipboard.writeText(text)
  }

  const pasteCode = async () => {
    const value = await navigator.clipboard.readText()
    setCode(value.replace(/\D/g, '').slice(0, 6))
  }

  const dhtComplete = Boolean(
    ping && ping.status !== 'preparing' && ping.status !== 'failed'
  )
  const connectionComplete = Boolean(
    ping && ['verifying', 'success'].includes(ping.status)
  )
  const proofComplete = ping?.status === 'success'

  return (
    <section className="p2p-ping-workspace">
      <div className="ping-header">
        <div className="ping-title-wrap">
          <RadioTower size={28} className="ping-title-icon" />
          <div>
            <h1 className="ping-title">{t('ping.p2p.title')}</h1>
          </div>
        </div>
      </div>

      <SegmentedControl<P2PPingRole>
        ariaLabel={t('ping.p2p.role')}
        className="p2p-ping-role"
        options={roleOptions.map(option => ({ ...option, disabled: active }))}
        value={role}
        onChange={setRole}
      />

      <div className="p2p-ping-primary">
        {role === 'host' ? (
          ping?.role === 'host' ? (
            <>
              <div className="p2p-ping-code" aria-label={t('ping.p2p.code')}>
                {ping.code}
              </div>
              <div className="p2p-ping-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={copyCode}
                >
                  <Copy size={17} />
                  {t('ping.p2p.copy')}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={shareCode}
                >
                  <Share2 size={17} />
                  {t('ping.p2p.share')}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={working}
                  onClick={regenerate}
                >
                  <RefreshCw size={17} />
                  {t('ping.p2p.regenerate')}
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              disabled={working}
              onClick={() => start('host')}
            >
              <RadioTower size={18} />
              {t('ping.p2p.create')}
            </button>
          )
        ) : (
          <div className="p2p-ping-join">
            <label htmlFor="p2p-ping-code-input">{t('ping.p2p.code')}</label>
            <div className="p2p-ping-input-row">
              <input
                id="p2p-ping-code-input"
                className="input p2p-ping-input"
                inputMode="numeric"
                maxLength={6}
                pattern="\d{6}"
                placeholder="000000"
                readOnly={active}
                value={ping?.role === 'join' ? ping.code : code}
                onChange={event =>
                  setCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                }
              />
              <button
                type="button"
                className="btn btn-icon"
                disabled={active}
                onClick={pasteCode}
                aria-label={t('ping.p2p.paste')}
                title={t('ping.p2p.paste')}
              >
                <ClipboardPaste size={18} />
              </button>
            </div>
            {ping?.role !== 'join' ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={working || !/^\d{6}$/.test(code)}
                onClick={() => start('join')}
              >
                <RadioTower size={18} />
                {t('ping.p2p.start')}
              </button>
            ) : null}
          </div>
        )}
      </div>

      {ping?.role === role ? (
        <div className="p2p-ping-result" aria-live="polite">
          <div className={`p2p-ping-status is-${ping.status}`}>
            {ping.status === 'success' ? (
              <CheckCircle2 size={21} />
            ) : ['failed', 'expired'].includes(ping.status) ? (
              <XCircle size={21} />
            ) : (
              <LoaderCircle size={21} className={active ? 'ping-spin' : ''} />
            )}
            <strong>{t(STATUS_KEYS[ping.status])}</strong>
            {active ? <span>{formatNumber(remainingSeconds)}s</span> : null}
          </div>

          <div className="p2p-ping-steps">
            <PingStep
              done={dhtComplete}
              label={t(
                ping.role === 'host'
                  ? 'ping.p2p.step.announce'
                  : 'ping.p2p.step.discovery'
              )}
            />
            <PingStep
              done={connectionComplete}
              label={t('ping.p2p.step.connection')}
            />
            <PingStep done={proofComplete} label={t('ping.p2p.step.proof')} />
          </div>

          <dl className="p2p-ping-details">
            <div>
              <dt>{t('ping.p2p.candidates')}</dt>
              <dd>{formatNumber(ping.discoveredPeers)}</dd>
            </div>
            <div>
              <dt>{t('ping.p2p.elapsed')}</dt>
              <dd>
                {ping.elapsedMs === null
                  ? '-'
                  : `${formatNumber(ping.elapsedMs)} ms`}
              </dd>
            </div>
            <div>
              <dt>{t('ping.p2p.peerKey')}</dt>
              <dd>{shortPeerKey(ping.remotePeerKey)}</dd>
            </div>
            {ping.errorCode ? (
              <div className="is-error">
                <dt>{t('ping.p2p.failure')}</dt>
                <dd>
                  {ping.phase} / {ping.errorCode}: {ping.errorMessage}
                </dd>
              </div>
            ) : null}
          </dl>

          {active ? (
            <button
              type="button"
              className="btn btn-ghost p2p-ping-cancel"
              disabled={working}
              onClick={cancel}
            >
              <X size={17} />
              {t('ping.p2p.cancel')}
            </button>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="p2p-ping-error">{error}</p> : null}
    </section>
  )
}

function PingStep({ done, label }: { done: boolean; label: string }) {
  return (
    <div className={done ? 'is-done' : ''}>
      {done ? <CheckCircle2 size={17} /> : <LoaderCircle size={17} />}
      <span>{label}</span>
    </div>
  )
}
