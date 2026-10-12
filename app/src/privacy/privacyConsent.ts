export const PRIVACY_POLICY_VERSION = '2026-08-12'

type PrivacyConsentRecord = {
  accepted: true
  acceptedAt: string
  policyVersion: string
}

export function serializePrivacyConsent(acceptedAt = new Date()) {
  const record: PrivacyConsentRecord = {
    accepted: true,
    acceptedAt: acceptedAt.toISOString(),
    policyVersion: PRIVACY_POLICY_VERSION,
  }
  return JSON.stringify(record)
}

export function hasCurrentPrivacyConsent(serialized: string) {
  try {
    const record = JSON.parse(serialized) as Partial<PrivacyConsentRecord>
    return (
      record.accepted === true &&
      record.policyVersion === PRIVACY_POLICY_VERSION &&
      typeof record.acceptedAt === 'string' &&
      !Number.isNaN(Date.parse(record.acceptedAt))
    )
  } catch {
    return false
  }
}
