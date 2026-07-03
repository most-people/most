import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, test } from 'node:test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..', '..', '..')

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

describe('Docker packaging', () => {
  test('builds an amd64 runtime image that starts the daemon without npm at runtime', () => {
    const dockerfile = readRepoFile('Dockerfile')

    assert.match(dockerfile, /^FROM node:22-bookworm AS build/m)
    assert.match(dockerfile, /^FROM node:22-bookworm AS runtime/m)
    assert.match(dockerfile, /RUN npm ci\b/)
    assert.match(dockerfile, /RUN npm run build\b/)
    assert.match(dockerfile, /RUN npm ci --omit=dev\b/)
    assert.match(dockerfile, /ENV HOME=\/data/)
    assert.match(dockerfile, /EXPOSE 1976/)
    assert.match(
      dockerfile,
      /CMD \["node", "server\/cli\.js", "--host", "0\.0\.0\.0"\]/
    )
  })

  test('ships a Feiniu OS compose example with host networking and persistent data', () => {
    const compose = readRepoFile('docker-compose.example.yml')

    assert.match(compose, /image: ghcr\.io\/most-people\/most-box:0\.3\.7/)
    assert.match(compose, /container_name: mostbox/)
    assert.match(compose, /network_mode: host/)
    assert.match(compose, /restart: unless-stopped/)
    assert.match(compose, /HOME: \/data/)
    assert.match(compose, /\/vol1\/docker\/mostbox\/home:\/data/)
  })

  test('publishes only linux/amd64 images to GHCR on release tags', () => {
    const workflow = readRepoFile('.github/workflows/docker.yml')

    assert.match(workflow, /packages: write/)
    assert.match(workflow, /ghcr\.io\/most-people\/most-box/)
    assert.match(workflow, /platforms: linux\/amd64/)
    assert.match(workflow, /type=raw,value=latest/)
    assert.match(workflow, /type=semver,pattern=\{\{version\}\}/)
  })

  test('keeps static prerender stable in constrained Docker builders', () => {
    const viteConfig = readRepoFile('vite.config.ts')

    assert.match(viteConfig, /prerender:\s*\{[\s\S]*concurrency:\s*1/)
    assert.match(viteConfig, /preview:\s*\{[\s\S]*host:\s*'127\.0\.0\.1'/)
    assert.doesNotMatch(viteConfig, /retryCount/)
  })
})
