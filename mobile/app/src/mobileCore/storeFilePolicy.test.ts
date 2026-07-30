import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  getStoreDownloadPolicyError,
  getStoreFilePolicyError,
} from './storeFilePolicy'

describe('Google Play file policy', () => {
  it('blocks application packages and executable files', () => {
    assert.match(getStoreFilePolicyError('update.APK'), /Google Play/)
    assert.match(getStoreFilePolicyError('tool.exe'), /Google Play/)
    assert.match(
      getStoreFilePolicyError(
        'download',
        'application/vnd.android.package-archive'
      ),
      /Google Play/
    )
  })

  it('allows regular documents, media, and archives', () => {
    assert.equal(getStoreFilePolicyError('report.pdf'), '')
    assert.equal(getStoreFilePolicyError('photo.png', 'image/png'), '')
    assert.equal(getStoreFilePolicyError('archive.zip'), '')
  })

  it('requires an explicit filename before accepting a download', () => {
    assert.match(getStoreDownloadPolicyError('bafkreicid', false), /filename/)
    assert.equal(getStoreDownloadPolicyError('report.pdf', true), '')
    assert.match(getStoreDownloadPolicyError('update.apk', true), /Google Play/)
  })
})
