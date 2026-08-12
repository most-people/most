import * as FileSystem from 'expo-file-system/legacy'
import {
  hasCurrentPrivacyConsent,
  serializePrivacyConsent,
} from './privacyConsent'

const privacyConsentPath = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}mostbox-privacy-consent.json`
  : ''

export async function readPrivacyConsent() {
  if (!privacyConsentPath) return false
  try {
    const serialized = await FileSystem.readAsStringAsync(privacyConsentPath, {
      encoding: FileSystem.EncodingType.UTF8,
    })
    return hasCurrentPrivacyConsent(serialized)
  } catch {
    return false
  }
}

export async function persistPrivacyConsent() {
  if (!privacyConsentPath) {
    throw new Error('Privacy consent storage is unavailable')
  }
  await FileSystem.writeAsStringAsync(
    privacyConsentPath,
    serializePrivacyConsent(),
    { encoding: FileSystem.EncodingType.UTF8 }
  )
}
