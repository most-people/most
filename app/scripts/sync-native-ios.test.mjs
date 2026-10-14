import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  applyIosNetworkPolicy,
  applyIosMediaPermissions,
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

  it('adds media permission descriptions to an existing project without changing nested dictionaries', () => {
    const descriptions = {
      NSCameraUsageDescription: 'Camera & photos <selected>',
      NSPhotoLibraryUsageDescription: 'Select a photo',
    }
    const result = applyIosMediaPermissions(staleInfoPlist, descriptions)
    assert.match(
      result,
      /<\/dict>\s*<key>NSCameraUsageDescription<\/key>\s*<string>Camera &amp; photos &lt;selected&gt;<\/string>/
    )
    assert.match(
      result,
      /<key>NSPhotoLibraryUsageDescription<\/key>\s*<string>Select a photo<\/string>\s*<\/dict>\s*<\/plist>/
    )
    assert.equal(applyIosMediaPermissions(result, descriptions), result)
    const updated = applyIosMediaPermissions(result, {
      NSCameraUsageDescription: 'Take a photo',
    })
    assert.match(
      updated,
      /<key>NSCameraUsageDescription<\/key>\s*<string>Take a photo<\/string>/
    )
    assert.equal((updated.match(/NSCameraUsageDescription/g) || []).length, 1)
    assert.throws(() => applyIosMediaPermissions('<plist/>', descriptions))
  })
})
