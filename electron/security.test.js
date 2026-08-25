import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  isAllowedExternalHost,
  isPasskeyLabExternalUrl,
  isSafeExternalUrl,
  isTrustedAppUrl,
} from './security.js'

describe('desktop URL security', () => {
  it('trusts only the local MostBox app origin', () => {
    assert.equal(isTrustedAppUrl('http://localhost:1976/file/'), true)
    assert.equal(isTrustedAppUrl('http://127.0.0.1:1976/admin/'), true)
    assert.equal(isTrustedAppUrl('http://[::1]:1976/chat/'), true)
    assert.equal(isTrustedAppUrl('http://localhost:3000/file/'), false)
    assert.equal(isTrustedAppUrl('https://localhost:1976/file/'), false)
    assert.equal(isTrustedAppUrl('http://localhost.evil.test:1976/'), false)
  })

  it('allows only credential-free HTTPS external URLs', () => {
    assert.equal(isSafeExternalUrl('https://most.box/download/'), true)
    assert.equal(isSafeExternalUrl('http://most.box/download/'), false)
    assert.equal(isSafeExternalUrl('custom-scheme://payload'), false)
    assert.equal(isSafeExternalUrl('https://user:pass@most.box/'), false)
  })

  it('matches external hosts exactly', () => {
    const allowedHosts = new Set(['download.most.box', 'github.com'])
    assert.equal(
      isAllowedExternalHost(
        'https://download.most.box/releases/x',
        allowedHosts
      ),
      true
    )
    assert.equal(
      isAllowedExternalHost(
        'https://github.com/most-people/most',
        allowedHosts
      ),
      true
    )
    assert.equal(
      isAllowedExternalHost(
        'https://github.com.evil.test/payload',
        allowedHosts
      ),
      false
    )
  })

  it('allows only the canonical passkey lab page', () => {
    assert.equal(
      isPasskeyLabExternalUrl(
        'https://most.box/passkey-lab/?bridge=native&state=test'
      ),
      true
    )
    assert.equal(
      isPasskeyLabExternalUrl('https://most.box/passkey-lab.evil/'),
      false
    )
    assert.equal(
      isPasskeyLabExternalUrl('https://evil.test/passkey-lab/'),
      false
    )
  })
})
