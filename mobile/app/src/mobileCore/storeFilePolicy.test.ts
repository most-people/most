import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  getStoreDownloadPolicyErrorKey,
  getStoreFilePolicyErrorKey,
  STORE_FILE_POLICY_ERROR_KEYS,
} from './storeFilePolicy'

describe('store file policy', () => {
  it('blocks application packages and executable files', () => {
    assert.equal(
      getStoreFilePolicyErrorKey('update.APK'),
      STORE_FILE_POLICY_ERROR_KEYS.blockedExecutable
    )
    assert.equal(
      getStoreFilePolicyErrorKey('tool.exe'),
      STORE_FILE_POLICY_ERROR_KEYS.blockedExecutable
    )
    assert.equal(
      getStoreFilePolicyErrorKey(
        'download',
        'application/vnd.android.package-archive'
      ),
      STORE_FILE_POLICY_ERROR_KEYS.blockedExecutable
    )
  })

  it('allows regular documents, media, and archives', () => {
    assert.equal(getStoreFilePolicyErrorKey('report.pdf'), null)
    assert.equal(getStoreFilePolicyErrorKey('photo.png', 'image/png'), null)
    assert.equal(getStoreFilePolicyErrorKey('archive.zip'), null)
  })

  it('requires an explicit filename before accepting a download', () => {
    assert.equal(
      getStoreDownloadPolicyErrorKey('bafkreicid', false),
      STORE_FILE_POLICY_ERROR_KEYS.filenameRequired
    )
    assert.equal(getStoreDownloadPolicyErrorKey('report.pdf', true), null)
    assert.equal(
      getStoreDownloadPolicyErrorKey('update.apk', true),
      STORE_FILE_POLICY_ERROR_KEYS.blockedExecutable
    )
  })
})
