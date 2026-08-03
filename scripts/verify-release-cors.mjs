import path from 'node:path'
import { pathToFileURL } from 'node:url'

const DEFAULT_MANIFEST_URL = 'https://download.most.box/releases/latest.json'
const DEFAULT_ORIGINS = ['https://most.box', 'https://most-people.com']
const EXPECTED_EXPOSED_HEADERS = [
  'cache-control',
  'content-length',
  'content-type',
  'etag',
  'last-modified',
]

function parseArgs(argv) {
  const args = new Map()
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]
    if (!key.startsWith('--')) throw new Error(`Invalid argument ${key}`)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${key}`)
    }
    args.set(key.slice(2), value)
    index += 1
  }
  return args
}

function splitHeader(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean)
}

export function assertReleaseCorsHeaders(headers, origin, preflight = false) {
  const allowedOrigin = headers.get('access-control-allow-origin')
  if (allowedOrigin !== origin) {
    throw new Error(
      `Expected Access-Control-Allow-Origin ${origin}, received ${allowedOrigin || 'none'}`
    )
  }

  const vary = splitHeader(headers.get('vary'))
  if (!vary.includes('origin')) {
    throw new Error('Expected Vary to include Origin')
  }

  if (preflight) {
    const methods = splitHeader(headers.get('access-control-allow-methods'))
    for (const method of ['get', 'head']) {
      if (!methods.includes(method)) {
        throw new Error(
          `Expected Access-Control-Allow-Methods to include ${method.toUpperCase()}`
        )
      }
    }
    return
  }

  const exposedHeaders = splitHeader(
    headers.get('access-control-expose-headers')
  )
  for (const header of EXPECTED_EXPOSED_HEADERS) {
    if (!exposedHeaders.includes(header)) {
      throw new Error(
        `Expected Access-Control-Expose-Headers to include ${header}`
      )
    }
  }
}

async function request(url, origin, preflight) {
  const response = await fetch(url, {
    method: preflight ? 'OPTIONS' : 'GET',
    headers: preflight
      ? {
          Origin: origin,
          'Access-Control-Request-Method': 'GET',
        }
      : { Origin: origin },
    redirect: 'follow',
  })

  if (!response.ok) {
    throw new Error(
      `${preflight ? 'OPTIONS' : 'GET'} ${url} returned ${response.status}`
    )
  }
  assertReleaseCorsHeaders(response.headers, origin, preflight)
  await response.arrayBuffer()
  return response.status
}

export async function verifyReleaseCors(
  manifestUrl = DEFAULT_MANIFEST_URL,
  origins = DEFAULT_ORIGINS
) {
  const url = new URL(manifestUrl)
  if (url.protocol !== 'https:') {
    throw new Error('Release manifest URL must use HTTPS')
  }

  for (const origin of origins) {
    const normalizedOrigin = new URL(origin).origin
    const getStatus = await request(url, normalizedOrigin, false)
    const optionsStatus = await request(url, normalizedOrigin, true)
    console.log(
      `Verified release CORS for ${normalizedOrigin}: GET ${getStatus}, OPTIONS ${optionsStatus}`
    )
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const origins = String(args.get('origins') || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
  await verifyReleaseCors(
    args.get('url') || process.env.R2_RELEASE_MANIFEST_URL,
    origins.length ? origins : DEFAULT_ORIGINS
  )
}

const entryUrl = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : ''
if (entryUrl === import.meta.url) {
  main().catch(error => {
    console.error(error)
    process.exitCode = 1
  })
}
