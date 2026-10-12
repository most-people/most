export const GITHUB_RELEASE_CERTIFICATE_SHA256 =
  '476989ca590dc9b87f80d0ed19effb649376d6aa5180bb45f3ac79e5f2306233'

export function verifyApkSigningIdentity(verificationOutput) {
  const output = String(verificationOutput)
  const signerCount = output.match(/Number of signers:\s*(\d+)/i)
  const certificateDigests = new Set(
    [...output.matchAll(/certificate SHA-256 digest:\s*([0-9a-f]{64})/gi)].map(
      match => match[1].toLowerCase()
    )
  )

  if (signerCount?.[1] !== '1' || certificateDigests.size !== 1) {
    throw new Error('Unable to verify the Android release signing identity')
  }

  const [certificateDigest] = certificateDigests
  if (certificateDigest !== GITHUB_RELEASE_CERTIFICATE_SHA256) {
    throw new Error(
      `Unexpected Android release certificate SHA-256: ${certificateDigest}`
    )
  }

  return certificateDigest
}
