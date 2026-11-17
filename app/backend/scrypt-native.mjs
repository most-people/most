// Native scrypt for the v2 chat identity (docs/protocol/v2/signatures.md §7.2).
// The Hermes JS engine is too slow for scrypt, so the mobile app derives in
// the Bare backend with libsodium. libsodium's high-level API takes opslimit
// and memlimit instead of (N, r, p); with opslimit = 32·N and memlimit =
// 2048·N it selects exactly r = 8, p = 1 and N, which was checked byte for
// byte against Node's standard crypto.scrypt for N = 2^13 .. 2^18.
import sodium from 'sodium-native'

export const SCRYPT_SALT_BYTES = 32

export function scryptLimits(logN) {
  if (!Number.isInteger(logN) || logN < 13 || logN > 24) {
    throw new RangeError('scrypt logN must be an integer from 13 to 24')
  }
  const N = 2 ** logN
  return { opslimit: 32 * N, memlimit: 2048 * N }
}

/** scrypt(password, salt, N = 2^logN, r = 8, p = 1, 32 bytes), off the JS thread. */
export async function nativeScrypt(password, salt, logN) {
  if (salt.byteLength !== SCRYPT_SALT_BYTES) {
    throw new RangeError('scrypt salt must be 32 bytes')
  }
  const { opslimit, memlimit } = scryptLimits(logN)
  const out = new Uint8Array(32)
  await sodium.crypto_pwhash_scryptsalsa208sha256_async(
    out,
    password,
    salt,
    opslimit,
    memlimit
  )
  return out
}

/** Dev benchmark: same shape as src/devtools/scryptBenchmark.ts runs. */
export async function benchmarkNativeScrypt({
  logNs = [14, 15, 16, 17, 18],
  repeat = 2,
  stopAfterMs = 15000,
  now = () => Date.now(),
} = {}) {
  const password = new TextEncoder().encode('correct horse battery staple')
  const salt = new Uint8Array(SCRYPT_SALT_BYTES).fill(7)
  const runs = []
  for (const logN of logNs) {
    const run = {
      logN,
      memoryMiB: (128 * 8 * 2 ** logN) / (1024 * 1024),
      timesMs: [],
      medianMs: null,
    }
    runs.push(run)
    try {
      for (let attempt = 0; attempt < repeat; attempt++) {
        const started = now()
        await nativeScrypt(password, salt, logN)
        run.timesMs.push(now() - started)
      }
      const sorted = [...run.timesMs].sort((a, b) => a - b)
      const middle = Math.floor(sorted.length / 2)
      run.medianMs =
        sorted.length % 2
          ? sorted[middle]
          : Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    } catch (error) {
      run.error = error?.message || String(error)
      break
    }
    if (run.medianMs > stopAfterMs) break
  }
  return runs
}
