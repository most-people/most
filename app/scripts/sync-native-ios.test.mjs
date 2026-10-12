import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  applyIosNetworkPolicy,
  applyIosVersionInfo,
} from './sync-native-ios.mjs'

const staleInfoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>CFBundleShortVersionString</key>
  <string>0.4.9</string>
  <key>CFBundleVersion</key>
  <string>409</string>
  <key>NSAppTransportSecurity</key>
  <dict>
    <key>NSAllowsArbitraryLoads</key>
    <false/>
  </dict>
</dict>
</plist>
`

describe('iOS native project synchronization', () => {
  it('synchronizes the native version and build number', () => {
    const result = applyIosVersionInfo(staleInfoPlist, '0.5.0', '500')

    assert.match(
      result,
      /<key>CFBundleShortVersionString<\/key>\s*<string>0\.5\.0<\/string>/
    )
    assert.match(result, /<key>CFBundleVersion<\/key>\s*<string>500<\/string>/)
    assert.equal(applyIosVersionInfo(result, '0.5.0', '500'), result)
  })

  it('rejects invalid release values and missing plist keys', () => {
    assert.throws(() => applyIosVersionInfo(staleInfoPlist, '0.5', '500'))
    assert.throws(() => applyIosVersionInfo(staleInfoPlist, '0.5.0', '0'))
    assert.throws(() => applyIosVersionInfo('<plist/>', '0.5.0', '500'))
  })

  it('synchronizes the cleartext network policy from app config', () => {
    const enabled = applyIosNetworkPolicy(staleInfoPlist, true)
    assert.match(enabled, /<key>NSAllowsArbitraryLoads<\/key>\s*<true\/>/)
    assert.equal(applyIosNetworkPolicy(enabled, true), enabled)
    assert.throws(() => applyIosNetworkPolicy('<plist/>', true))
  })
})
