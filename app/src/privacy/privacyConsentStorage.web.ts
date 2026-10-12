import {
  hasCurrentPrivacyConsent,
  serializePrivacyConsent,
} from './privacyConsent'

const PRIVACY_CONSENT_KEY = 'mostbox.web.privacy-consent.v1'

export async function readPrivacyConsent() {
  if (typeof localStorage === 'undefined') return false
  try {
    return hasCurrentPrivacyConsent(
      localStorage.getItem(PRIVACY_CONSENT_KEY) || ''
    )
  } catch {
    return false
  }
}

export async function persistPrivacyConsent() {
  if (typeof localStorage === 'undefined') {
    throw new Error('Privacy consent storage is unavailable')
  }
  localStorage.setItem(PRIVACY_CONSENT_KEY, serializePrivacyConsent())
}
