import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  getStoreDownloadPolicyError,
  getStoreFilePolicyError,
} from './storeFilePolicy'

describe('store file policy', () => {
  it('blocks application packages and executable files', () => {
    assert.match(getStoreFilePolicyError('update.APK'), /当前商店版本/)
    assert.match(getStoreFilePolicyError('tool.exe'), /当前商店版本/)
    assert.match(
      getStoreFilePolicyError(
        'download',
        'application/vnd.android.package-archive'
      ),
      /当前商店版本/
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
    assert.match(
      getStoreDownloadPolicyError('update.apk', true),
      /当前商店版本/
    )
  })
})
