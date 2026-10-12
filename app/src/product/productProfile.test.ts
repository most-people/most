import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  getProductProfile,
  PRODUCT_PROFILE,
  resolveProductId,
} from './productProfile'

test('resolves the international and mainland product profiles', () => {
  assert.equal(resolveProductId('most'), 'most')
  assert.equal(resolveProductId('inkbox'), 'inkbox')
  assert.equal(resolveProductId('mohe'), 'inkbox')
  assert.equal(resolveProductId('墨盒'), 'inkbox')
  assert.equal(resolveProductId('unknown'), 'most')

  const most = getProductProfile('most')
  assert.equal(most.displayName, 'MostBox')
  assert.equal(most.scheme, 'most')
  assert.equal(most.features.web3, true)

  const inkbox = getProductProfile('inkbox')
  assert.equal(inkbox.displayName, '墨盒')
  assert.equal(inkbox.androidPackage, 'red.most.mohe')
  assert.equal(inkbox.iosBundleIdentifier, 'red.most.mohe')
  assert.equal(inkbox.features.chat, false)
  assert.equal(inkbox.legalUrls.privacy, 'https://most.red/mohe/privacy/')
})

test('defaults to MostBox profile for invalid build values', () => {
  assert.equal(PRODUCT_PROFILE.id, 'most')
})
