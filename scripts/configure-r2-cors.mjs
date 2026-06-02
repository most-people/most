import crypto from 'node:crypto'
import https from 'node:https'

const DEFAULT_BUCKET = 'most-box-releases'
const DEFAULT_ALLOWED_ORIGINS = ['https://most.box', 'https://most-people.com']

function parseArgs(argv) {
  const args = new Map()
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]
    if (!key.startsWith('--')) {
      throw new Error(`Invalid argument ${key}`)
    }
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${key}`)
    }
    args.set(key.slice(2), value)
    index += 1
  }
  return args
}

function requireValue(value, name) {
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

function hmac(key, value, encoding) {
  return crypto.createHmac('sha256', key).update(value).digest(encoding)
}

function sha256(value, encoding = 'hex') {
  return crypto.createHash('sha256').update(value).digest(encoding)
}

function getSigningKey(secretAccessKey, dateStamp) {
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp)
  const regionKey = hmac(dateKey, 'auto')
  const serviceKey = hmac(regionKey, 's3')
  return hmac(serviceKey, 'aws4_request')
}

function toAmzDate(date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '')
}

function xmlEscape(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function createCorsXml(allowedOrigins) {
  const origins = allowedOrigins
    .map(origin => `    <AllowedOrigin>${xmlEscape(origin)}</AllowedOrigin>`)
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<CORSConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <CORSRule>
${origins}
    <AllowedMethod>GET</AllowedMethod>
    <AllowedMethod>HEAD</AllowedMethod>
    <AllowedHeader>*</AllowedHeader>
    <ExposeHeader>Cache-Control</ExposeHeader>
    <ExposeHeader>Content-Length</ExposeHeader>
    <ExposeHeader>Content-Type</ExposeHeader>
    <ExposeHeader>ETag</ExposeHeader>
    <ExposeHeader>Last-Modified</ExposeHeader>
    <MaxAgeSeconds>3600</MaxAgeSeconds>
  </CORSRule>
</CORSConfiguration>`
}

function request(options, body = '') {
  return new Promise((resolve, reject) => {
    const req = https.request(options, response => {
      const chunks = []
      response.on('data', chunk => chunks.push(chunk))
      response.on('end', () => {
        resolve({
          statusCode: response.statusCode,
          headers: response.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        })
      })
    })

    req.on('error', reject)
    req.end(body)
  })
}

async function signedR2Request({
  method,
  accountId,
  bucket,
  query,
  accessKeyId,
  secretAccessKey,
  body = '',
}) {
  const host = `${accountId}.r2.cloudflarestorage.com`
  const pathname = `/${bucket}`
  const now = new Date()
  const amzDate = toAmzDate(now)
  const dateStamp = amzDate.slice(0, 8)
  const payloadHash = sha256(body)
  const canonicalHeaders = [
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
  ].join('\n')
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'
  const canonicalRequest = [
    method,
    pathname,
    query,
    canonicalHeaders,
    '',
    signedHeaders,
    payloadHash,
  ].join('\n')
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join('\n')
  const signature = hmac(
    getSigningKey(secretAccessKey, dateStamp),
    stringToSign,
    'hex'
  )

  return request(
    {
      method,
      host,
      path: `${pathname}?${query}`,
      headers: {
        Authorization: [
          `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}`,
          `SignedHeaders=${signedHeaders}`,
          `Signature=${signature}`,
        ].join(', '),
        'Content-Length': Buffer.byteLength(body),
        'Content-Type': 'application/xml',
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
      },
    },
    body
  )
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const accountId = requireValue(
    args.get('account-id') || process.env.R2_ACCOUNT_ID,
    'R2_ACCOUNT_ID or --account-id'
  )
  const accessKeyId = requireValue(
    args.get('access-key-id') || process.env.R2_ACCESS_KEY_ID,
    'R2_ACCESS_KEY_ID or --access-key-id'
  )
  const secretAccessKey = requireValue(
    args.get('secret-access-key') || process.env.R2_SECRET_ACCESS_KEY,
    'R2_SECRET_ACCESS_KEY or --secret-access-key'
  )
  const bucket = args.get('bucket') || process.env.R2_BUCKET || DEFAULT_BUCKET
  const allowedOrigins = (
    args.get('origins') ||
    process.env.R2_CORS_ORIGINS ||
    ''
  )
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)

  const corsXml = createCorsXml(
    allowedOrigins.length ? allowedOrigins : DEFAULT_ALLOWED_ORIGINS
  )

  const putResponse = await signedR2Request({
    method: 'PUT',
    accountId,
    bucket,
    query: 'cors=',
    accessKeyId,
    secretAccessKey,
    body: corsXml,
  })
  if (putResponse.statusCode < 200 || putResponse.statusCode >= 300) {
    throw new Error(
      `R2 CORS update failed: ${putResponse.statusCode}\n${putResponse.body}`
    )
  }

  const getResponse = await signedR2Request({
    method: 'GET',
    accountId,
    bucket,
    query: 'cors=',
    accessKeyId,
    secretAccessKey,
  })
  if (getResponse.statusCode < 200 || getResponse.statusCode >= 300) {
    throw new Error(
      `R2 CORS verification failed: ${getResponse.statusCode}\n${getResponse.body}`
    )
  }

  console.log(`Configured CORS for R2 bucket ${bucket}`)
  console.log(getResponse.body)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
