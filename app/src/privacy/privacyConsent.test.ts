import assert from 'node:assert/strict'
import test from 'node:test'
import {
  hasCurrentPrivacyConsent,
  PRIVACY_POLICY_VERSION,
  serializePrivacyConsent,
} from './privacyConsent'

test('serializes a current explicit privacy consent record', () => {
  const acceptedAt = new Date('2026-08-12T00:00:00.000Z')
  const serialized = serializePrivacyConsent(acceptedAt)

  assert.deepEqual(JSON.parse(serialized), {
    accepted: true,
    acceptedAt: acceptedAt.toISOString(),
    policyVersion: PRIVACY_POLICY_VERSION,
  })
  assert.equal(hasCurrentPrivacyConsent(serialized), true)
})

test('requires explicit consent for the current policy version', () => {
  assert.equal(hasCurrentPrivacyConsent('not json'), false)
  assert.equal(
    hasCurrentPrivacyConsent(
      JSON.stringify({
        accepted: false,
        acceptedAt: '2026-08-12T00:00:00.000Z',
        policyVersion: PRIVACY_POLICY_VERSION,
      })
    ),
    false
  )
  assert.equal(
    hasCurrentPrivacyConsent(
      JSON.stringify({
        accepted: true,
        acceptedAt: '2026-08-12T00:00:00.000Z',
        policyVersion: '2026-07-30',
      })
    ),
    false
  )
  assert.equal(
    hasCurrentPrivacyConsent(
      JSON.stringify({
        accepted: true,
        acceptedAt: 'invalid',
        policyVersion: PRIVACY_POLICY_VERSION,
      })
    ),
    false
  )
})
