// Browser baseline for the v2 chat identity scrypt cost: the web client
// derives with ethers' pure JS scrypt, so it must be measured in phone
// browsers too (docs/protocol/v2/signatures.md §7.2). Bundles the same
// module the app uses (src/devtools/scryptBenchmark.ts) into one page,
// serves it on the LAN and prints each browser's report.
// Usage (from app/): node scripts/scrypt-benchmark-web.mjs [port]
// Then open http://<this machine's LAN IP>:<port>/ on the phone.
// If a firewall blocks the LAN port, connect the phone over USB, run
// `adb reverse tcp:<port> tcp:<port>` and open http://localhost:<port>/ instead;
// add ?auto=1 to start without tapping Run.
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const projectDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
)
const port = Number(process.argv[2]) || 2030

const bundle = await build({
  stdin: {
    contents: `
      import { formatScryptBenchmark, runScryptBenchmark } from './src/devtools/scryptBenchmark.ts'
      const output = document.getElementById('output')
      const button = document.getElementById('run')
      async function run() {
        button.disabled = true
        output.textContent = 'Measuring… the page may not respond until it finishes.'
        await new Promise(resolve => setTimeout(resolve, 50))
        const result = await runScryptBenchmark({ environment: navigator.userAgent })
        const report = formatScryptBenchmark(result)
        output.textContent = report
        button.disabled = false
        await fetch('/result', { method: 'POST', body: report })
      }
      button.addEventListener('click', () => void run())
      if (new URLSearchParams(location.search).has('auto')) void run()
    `,
    resolveDir: projectDir,
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  minify: true,
  target: 'es2020',
  write: false,
})
const script = bundle.outputFiles[0].text

const page = `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>scrypt benchmark</title>
<style>body{font:16px system-ui;margin:16px}pre{white-space:pre-wrap;font-size:14px}</style>
</head><body>
<h1>MostBox scrypt benchmark (browser)</h1>
<p>Same code as the web client (ethers, pure JS). Keep this tab in front.</p>
<button id="run">Run</button>
<pre id="output"></pre>
<script type="module">${script}</script>
</body></html>`

const server = http.createServer((request, response) => {
  if (request.method === 'POST' && request.url === '/result') {
    let body = ''
    request.on('data', chunk => (body += chunk))
    request.on('end', () => {
      console.log(
        `\n--- result from ${request.socket.remoteAddress}\n${body}\n`
      )
      response.end('ok')
    })
    return
  }
  response.setHeader('content-type', 'text/html; charset=utf-8')
  response.end(page)
})

server.listen(port, '0.0.0.0', () => {
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses || []) {
      if (address.family === 'IPv4' && !address.internal) {
        console.log(`open http://${address.address}:${port}/ on the phone`)
      }
    }
  }
})
