// F5 on a real Android device (adb) over real networks. Each run:
//   1. a publisher (desktop engine) publishes a fresh 256KiB file;
//   2. the phone opens the most:// link and the script taps "确认下载";
//   3. once the publisher has served the whole file, it exits;
//   4. a fresh desktop engine downloads the link, so the phone is the only
//      possible seed. Its download recomputes the CID, so success means the
//      phone stored the right bytes and seeds them.
// --where local runs both engines on this machine (same Wi-Fi as the phone);
// --where ssh://root@host runs them on that host through scripts/relay-worker.js
// (the repo must be at --remote-dir there, run by --remote-node). Events use
// the relay-churn schema. --relay <public key hex> routes the engines through
// that blind relay when holepunching fails; without it no relay is used.
//
//   node scripts/real-device-relay.js --where local --runs 30 --condition real-wifi --out log.jsonl
//   node scripts/relay-churn.js --summarize log.jsonl
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { spawnWorkerCommand } from './relay-churn.js'

const FILE_SIZE = 256 * 1024
const PHONE_TIMEOUT = 60000
const DOWNLOAD_TIMEOUT = 60000
const CONFIRM_TEXT = '确认下载'
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

function args() {
  const out = {}
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i += 2) out[argv[i].slice(2)] = argv[i + 1]
  return out
}

const adb = (...a) => execFileSync('adb', a, { maxBuffer: 16 * 1024 * 1024 })

async function tapText(text, timeout = 20000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    adb('shell', 'uiautomator', 'dump', '/sdcard/most-ui.xml')
    const xml = adb('exec-out', 'cat', '/sdcard/most-ui.xml').toString('utf8')
    const match = xml.match(
      new RegExp(
        `text="${text}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`
      )
    )
    if (match) {
      const [x1, y1, x2, y2] = match.slice(1).map(Number)
      adb(
        'shell',
        'input',
        'tap',
        String((x1 + x2) >> 1),
        String((y1 + y2) >> 1)
      )
      return
    }
    await sleep(500)
  }
  throw new Error(`"${text}" did not appear on the phone`)
}

let remoteNode = 'node'

function startWorker(where, remoteDir) {
  if (where === 'local') {
    const worker = fileURLToPath(new URL('./relay-worker.js', import.meta.url))
    return spawnWorkerCommand(process.execPath, [worker])
  }
  const host = where.replace(/^ssh:\/\//, '')
  return spawnWorkerCommand('ssh', [
    '-o',
    'BatchMode=yes',
    host,
    `${remoteNode} ${remoteDir}/scripts/relay-worker.js`,
  ])
}

async function node(where, remoteDir, dataPath, onStatus) {
  const worker = startWorker(where, remoteDir)
  if (onStatus) worker.statusListeners.push(onStatus)
  await worker.call('start', {
    dataPath,
    downloadTimeout: DOWNLOAD_TIMEOUT,
    relayThrough: args().relay || '',
  })
  return {
    call: worker.call,
    stop: async () => {
      await worker.call('stop').catch(() => {})
      if (worker.child.exitCode === null) worker.child.kill()
    },
  }
}

async function runOnce({ run, where, remoteDir, dataRoot, log, outPath }) {
  const k = 1
  const content = crypto.randomBytes(FILE_SIZE)
  const nodes = []
  try {
    const publisher = await node(
      where,
      remoteDir,
      `${dataRoot}/run-${run}-publisher`
    )
    nodes.push(publisher)
    const { cid, link } = await publisher.call('publish', {
      contentBase64: content.toString('base64'),
      name: `real-${run}.bin`,
    })
    log({ run, k, type: 'published', cid })

    adb(
      'shell',
      'am',
      'start',
      '-a',
      'android.intent.action.VIEW',
      '-d',
      `'${link}'`,
      'most.box'
    )
    await tapText(CONFIRM_TEXT)
    log({ run, k, type: 'phone-tap' })

    const deadline = Date.now() + PHONE_TIMEOUT
    for (;;) {
      const holding = await publisher.call('holding', { cid })
      if ((holding?.totalServedBytes || 0) >= FILE_SIZE) break
      if (Date.now() > deadline) {
        // Evidence for the failure: did the phone connect at all, and what
        // does its screen show?
        const screenshot = `${outPath}.run-${run}.png`
        fs.writeFileSync(screenshot, adb('exec-out', 'screencap', '-p'))
        log({
          run,
          k,
          type: 'phone-timeout',
          publisherPeers: holding?.peerCount ?? null,
          servedBytes: holding?.totalServedBytes ?? 0,
          network: await publisher.call('network'),
          screenshot: path.basename(screenshot),
        })
        throw new Error('phone did not fetch the file from the publisher')
      }
      await sleep(250)
    }
    log({ run, k, type: 'seed-up', seed: 0 })
    // Let the phone verify, store and join the topic before the publisher
    // leaves; the fresh node then has 60s to find it.
    await sleep(3000)
    await publisher.stop()
    nodes.splice(nodes.indexOf(publisher), 1)
    log({ run, k, type: 'publisher-stopped' })

    const downloader = await node(
      where,
      remoteDir,
      `${dataRoot}/run-${run}-downloader`,
      status => log({ run, k, type: 'status', status })
    )
    nodes.push(downloader)
    log({ run, k, type: 'download-start' })
    try {
      await downloader.call('download', { link, timeout: DOWNLOAD_TIMEOUT })
      const sha = await downloader.call('sha256', { cid })
      log({
        run,
        k,
        type: 'done',
        ok: sha === crypto.createHash('sha256').update(content).digest('hex'),
      })
    } catch (err) {
      log({ run, k, type: 'done', ok: false, error: err.message })
    }
  } catch (err) {
    log({ run, k, type: 'setup-error', error: err.message.split('\n')[0] })
  } finally {
    await Promise.allSettled(nodes.map(n => n.stop()))
  }
}

async function main() {
  const options = args()
  const where = options.where || 'local'
  const remoteDir = options['remote-dir'] || '/root/most-f5b'
  remoteNode = options['remote-node'] || 'node'
  const runs = Number(options.runs || 30)
  const outPath = options.out || 'real-device.jsonl'
  const dataRoot =
    where === 'local'
      ? fs.mkdtempSync(path.join(os.tmpdir(), 'most-real-'))
      : `/tmp/most-real-${Date.now()}`
  const out = fs.openSync(outPath, 'a')
  const t0 = Date.now()
  const log = event =>
    fs.writeSync(out, `${JSON.stringify({ t: Date.now() - t0, ...event })}\n`)

  adb('shell', 'svc', 'power', 'stayon', 'true')
  log({
    type: 'meta',
    condition:
      options.condition || `real-${where === 'local' ? 'wifi' : 'cross'}`,
    where,
    device: adb('shell', 'getprop', 'ro.product.model').toString().trim(),
    android: adb('shell', 'getprop', 'ro.build.version.release')
      .toString()
      .trim(),
    app: adb('shell', 'dumpsys', 'package', 'most.box')
      .toString()
      .match(/versionName=(\S+)/)?.[1],
    commit: options.commit || '',
  })
  try {
    for (let run = 0; run < runs; run += 1) {
      await runOnce({ run, where, remoteDir, dataRoot, log, outPath })
    }
  } finally {
    fs.closeSync(out)
    if (where === 'local') fs.rmSync(dataRoot, { recursive: true, force: true })
  }
}

await main()
