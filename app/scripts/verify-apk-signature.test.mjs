import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  GITHUB_RELEASE_CERTIFICATE_SHA256,
  verifyApkSigningIdentity,
} from './verify-apk-signature.mjs'

const wrongCertificateSha256 = '0'.repeat(64)

describe('verifyApkSigningIdentity', () => {
  it('accepts Windows apksigner output', () => {
    const output = `
Verifies
Verified using v1 scheme (JAR signing): false
Verified using v2 scheme (APK Signature Scheme v2): true
Number of signers: 1
Signer #1 certificate SHA-256 digest: ${GITHUB_RELEASE_CERTIFICATE_SHA256.toUpperCase()}
`

    assert.equal(
      verifyApkSigningIdentity(output),
      GITHUB_RELEASE_CERTIFICATE_SHA256
    )
  })

  it('accepts Linux apksigner output and deduplicates scheme digests', () => {
    const output = `
Verifies
Number of signers: 1
V1 Signer: certificate SHA-256 digest: ${GITHUB_RELEASE_CERTIFICATE_SHA256}
V2 Signer: certificate SHA-256 digest: ${GITHUB_RELEASE_CERTIFICATE_SHA256}
`

    assert.equal(
      verifyApkSigningIdentity(output),
      GITHUB_RELEASE_CERTIFICATE_SHA256
    )
  })

  it('rejects output without a signer count', () => {
    assert.throws(
      () =>
        verifyApkSigningIdentity(
          `V2 Signer: certificate SHA-256 digest: ${GITHUB_RELEASE_CERTIFICATE_SHA256}`
        ),
      /Unable to verify the Android release signing identity/
    )
  })

  it('rejects multiple distinct certificate digests', () => {
    const output = `
Number of signers: 1
V1 Signer: certificate SHA-256 digest: ${GITHUB_RELEASE_CERTIFICATE_SHA256}
V2 Signer: certificate SHA-256 digest: ${wrongCertificateSha256}
`

    assert.throws(
      () => verifyApkSigningIdentity(output),
      /Unable to verify the Android release signing identity/
    )
  })

  it('rejects an unexpected certificate digest', () => {
    const output = `
Number of signers: 1
V2 Signer: certificate SHA-256 digest: ${wrongCertificateSha256}
`

    assert.throws(
      () => verifyApkSigningIdentity(output),
      new RegExp(
        `Unexpected Android release certificate SHA-256: ${wrongCertificateSha256}`
      )
    )
  })
})
