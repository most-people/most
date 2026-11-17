// Measures the scrypt cost parameter for the v2 chat identity
// (docs/protocol/v2/signatures.md §7.2): chatSeed = scrypt(password,
// label("identity") ‖ username, N, r = 8, p = 1, 32). N must be fixed in the
// spec from a measurement on a low-end Android phone, so this runs the same
// ethers implementation the app uses, on the phone (NodeScreen, dev builds)
// and in Node (app/scripts/scrypt-benchmark.mjs) for a desktop baseline.
import { scrypt, toUtf8Bytes } from 'ethers'

export const SCRYPT_R = 8
export const SCRYPT_P = 1
export const SCRYPT_DK_LEN = 32
/** Target from the design: one derivation at login takes at most this long. */
export const SCRYPT_TARGET_MS = 3000
export const DEFAULT_LOG_N = [14, 15, 16, 17]
/** Stop trying larger N once a run is this slow. */
const ESCALATION_LIMIT_MS = 15000

export type ScryptRun = {
  logN: number
  memoryMiB: number
  timesMs: number[]
  medianMs: number | null
  error?: string
}

export type ScryptBenchmarkResult = {
  environment: string
  runs: ScryptRun[]
  recommendedLogN: number | null
}

type Options = {
  logNs?: number[]
  repeat?: number
  environment?: string
  now?: () => number
  onProgress?: (logN: number, attempt: number, fraction: number) => void
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2)
}

export function scryptMemoryMiB(logN: number, r = SCRYPT_R) {
  return (128 * r * 2 ** logN) / (1024 * 1024)
}

/** Largest N whose median stays within the target, or null if none does. */
export function recommendLogN(runs: ScryptRun[], targetMs = SCRYPT_TARGET_MS) {
  let best: number | null = null
  for (const run of runs) {
    if (run.error || run.medianMs === null) continue
    if (run.medianMs <= targetMs && (best === null || run.logN > best)) {
      best = run.logN
    }
  }
  return best
}

export async function runScryptBenchmark(
  options: Options = {}
): Promise<ScryptBenchmarkResult> {
  const now = options.now || (() => Date.now())
  const repeat = Math.max(1, options.repeat ?? 2)
  // Same shape as the real input; the cost does not depend on the content.
  const password = toUtf8Bytes('correct horse battery staple')
  const salt = new Uint8Array([
    ...toUtf8Bytes('most/v2/identity'),
    0,
    ...toUtf8Bytes('alice'),
  ])

  const runs: ScryptRun[] = []
  for (const logN of options.logNs || DEFAULT_LOG_N) {
    const run: ScryptRun = {
      logN,
      memoryMiB: scryptMemoryMiB(logN),
      timesMs: [],
      medianMs: null,
    }
    runs.push(run)
    try {
      for (let attempt = 1; attempt <= repeat; attempt++) {
        const started = now()
        await scrypt(
          password,
          salt,
          2 ** logN,
          SCRYPT_R,
          SCRYPT_P,
          SCRYPT_DK_LEN,
          fraction => {
            options.onProgress?.(logN, attempt, fraction)
          }
        )
        run.timesMs.push(now() - started)
      }
      run.medianMs = median(run.timesMs)
    } catch (error) {
      run.error = error instanceof Error ? error.message : String(error)
      break
    }
    if ((run.medianMs ?? 0) > ESCALATION_LIMIT_MS) break
  }

  return {
    environment: options.environment || 'unknown',
    runs,
    recommendedLogN: recommendLogN(runs),
  }
}

/** Plain-text report to copy into the design discussion. */
export function formatScryptBenchmark(result: ScryptBenchmarkResult) {
  const lines = [
    'MostBox scrypt benchmark (r=8, p=1, dkLen=32)',
    `environment: ${result.environment}`,
  ]
  for (const run of result.runs) {
    const label = `N=2^${run.logN} (${run.memoryMiB} MiB)`
    lines.push(
      run.error
        ? `${label}: error ${run.error}`
        : `${label}: median ${run.medianMs} ms, runs ${run.timesMs.join(' / ')} ms`
    )
  }
  lines.push(
    result.recommendedLogN === null
      ? `recommended: none within ${SCRYPT_TARGET_MS} ms`
      : `recommended: N=2^${result.recommendedLogN} (largest with median <= ${SCRYPT_TARGET_MS} ms)`
  )
  return lines.join('\n')
}
