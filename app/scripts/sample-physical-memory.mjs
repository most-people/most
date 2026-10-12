import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import path from 'node:path'

const run = promisify(execFile)
const args = process.argv.slice(2)
const options = new Map()
for (let index = 0; index < args.length; index += 2) {
  if (
    !['--serial', '--seconds', '--output'].includes(args[index]) ||
    !args[index + 1]
  ) {
    throw new Error(
      'Usage: node scripts/sample-physical-memory.mjs --serial DEVICE --seconds 600 --output report.json'
    )
  }
  options.set(args[index], args[index + 1])
}
const serial = options.get('--serial')
const seconds = Number(options.get('--seconds') || 600)
if (!serial || !Number.isInteger(seconds) || seconds < 1 || seconds > 3600) {
  throw new Error(
    'A physical device serial and duration of 1–3600 seconds are required'
  )
}
const output = path.resolve(
  options.get('--output') || `physical-memory-${Date.now()}.json`
)
async function adb(...commands) {
  return (
    await run('adb', ['-s', serial, ...commands], {
      timeout: 15000,
      maxBuffer: 1024 * 1024,
    })
  ).stdout.trim()
}
if (
  (await adb('get-state')) !== 'device' ||
  (await adb('shell', 'getprop', 'ro.kernel.qemu')) === '1'
) {
  throw new Error(
    'An authorized physical device is required; emulators are not accepted'
  )
}
const report = {
  serial,
  model: await adb('shell', 'getprop', 'ro.product.model'),
  startedAt: new Date().toISOString(),
  intervalMs: 2000,
  samples: [],
}
const deadline = Date.now() + seconds * 1000
await fs.mkdir(path.dirname(output), { recursive: true })
do {
  const sample = { at: new Date().toISOString() }
  try {
    sample.pid = await adb('shell', 'pidof', 'most.box')
    sample.meminfo = await adb('shell', 'dumpsys', 'meminfo', 'most.box')
  } catch (error) {
    sample.error = error.message
  }
  report.samples.push(sample)
  // Persist each sample so stopping the collector does not lose earlier evidence.
  await fs.writeFile(`${output}.tmp`, JSON.stringify(report, null, 2))
  await fs.rename(`${output}.tmp`, output)
  const remaining = deadline - Date.now()
  if (remaining <= 0) break
  await new Promise(resolve => setTimeout(resolve, Math.min(2000, remaining)))
} while (Date.now() < deadline)
console.log(`Saved ${report.samples.length} samples to ${output}`)
