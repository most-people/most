import { parseMostLink } from '~/server/src/core/mostLink.js'
import type { MessageKey } from '~/lib/i18n'

type TranslationParams = Record<string, string | number>

export type I18nTranslate = (
  key: MessageKey,
  params?: TranslationParams
) => string

type DownloadValidationMessage = {
  key: MessageKey
  params?: TranslationParams
}

const downloadValidationErrorKeys: Record<string, MessageKey> = {
  'Link must be a non-empty string': 'app.download.validation.empty',
  'Link must be a valid most:// URL': 'app.download.validation.invalidUrl',
  'Link must use most:// protocol': 'app.download.validation.protocol',
  'Link path is not supported': 'app.download.validation.path',
  'Invalid CID format': 'app.download.validation.invalidCid',
  'Invalid CID format: CID v1 required': 'app.download.validation.cidV1',
  'CID digest must be 32 bytes': 'app.download.validation.cidDigest',
  'filename is required': 'app.download.validation.filenameRequired',
}

export function getMostLinkValidationMessageKey(
  link: string
): DownloadValidationMessage | null {
  if (!link) return { key: 'app.download.validation.empty' }

  const result = parseMostLink(link)
  if (!result.error) return null

  if (result.error.startsWith('Unsupported query parameter: ')) {
    return {
      key: 'app.download.validation.unsupportedParam',
      params: {
        param: result.error.slice('Unsupported query parameter: '.length),
      },
    }
  }

  return {
    key:
      downloadValidationErrorKeys[result.error] ||
      'app.download.validation.generic',
  }
}

export function getLocalizedDownloadLinkValidationMessage(
  link: string,
  t: I18nTranslate
) {
  const message = getMostLinkValidationMessageKey(link)
  return message ? t(message.key, message.params) : null
}
