export type BurstDebounced = (() => void) & { cancel: () => void }

/** Refresh timing for `user:metadata:updated` bursts (e.g. account sync). */
export const METADATA_REFRESH_WAIT_MS = 500
export const METADATA_REFRESH_MAX_WAIT_MS = 3000

/**
 * Collapses a burst of calls into one trailing `run()`. During a long burst it
 * still runs at least every `maxWaitMs`, so the UI does not stay stale while,
 * for example, account sync applies hundreds of records in a row.
 */
export function createBurstDebounce(
  run: () => void,
  waitMs: number,
  maxWaitMs: number
): BurstDebounced {
  let timer: ReturnType<typeof setTimeout> | undefined
  let firstAt = 0

  const flush = () => {
    timer = undefined
    firstAt = 0
    run()
  }

  const trigger = (() => {
    const now = Date.now()
    if (!firstAt) firstAt = now
    if (timer) clearTimeout(timer)
    timer = setTimeout(flush, Math.min(waitMs, firstAt + maxWaitMs - now))
  }) as BurstDebounced

  trigger.cancel = () => {
    if (timer) clearTimeout(timer)
    timer = undefined
    firstAt = 0
  }

  return trigger
}
