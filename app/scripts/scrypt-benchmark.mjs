// Desktop baseline for the v2 chat identity scrypt cost, using the same
// module the app runs on the phone (src/devtools/scryptBenchmark.ts).
// Usage (from app/): node --import tsx scripts/scrypt-benchmark.mjs [repeat]
// The value to put in the spec must come from a low-end Android phone:
// run "scrypt benchmark" in the app's Node > Diagnostics (dev builds).
import os from 'node:os'
import {
  formatScryptBenchmark,
  runScryptBenchmark,
} from '../src/devtools/scryptBenchmark.ts'

const repeat = Number(process.argv[2]) || 2
const cpu = os.cpus()[0]?.model || 'unknown cpu'
const result = await runScryptBenchmark({
  repeat,
  environment: `node ${process.version} ${process.platform}/${process.arch}, ${cpu}`,
  onProgress: (logN, attempt, fraction) => {
    if (fraction === 1)
      process.stderr.write(`N=2^${logN} run ${attempt} done\n`)
  },
})
console.log(formatScryptBenchmark(result))
