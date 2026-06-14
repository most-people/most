import {
  MOST_LINK_ERROR_CODES,
  parseMostLink,
} from '~server/src/core/mostLink.js'
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
  [MOST_LINK_ERROR_CODES.LINK_EMPTY]: 'app.download.validation.empty',
  [MOST_LINK_ERROR_CODES.INVALID_URL]: 'app.download.validation.invalidUrl',
  [MOST_LINK_ERROR_CODES.INVALID_PROTOCOL]:
    'app.download.validation.protocol',
  [MOST_LINK_ERROR_CODES.UNSUPPORTED_PATH]: 'app.download.validation.path',
  [MOST_LINK_ERROR_CODES.CID_EMPTY]: 'app.download.validation.invalidCid',
  [MOST_LINK_ERROR_CODES.INVALID_CID_FORMAT]:
    'app.download.validation.invalidCid',
  [MOST_LINK_ERROR_CODES.CID_V1_REQUIRED]: 'app.download.validation.cidV1',
  [MOST_LINK_ERROR_CODES.CID_DIGEST_LENGTH]:
    'app.download.validation.cidDigest',
  [MOST_LINK_ERROR_CODES.FILENAME_REQUIRED]:
    'app.download.validation.filenameRequired',
}

export function getMostLinkValidationMessageKey(
  link: string
): DownloadValidationMessage | null {
  if (!link) return { key: 'app.download.validation.empty' }

  const result = parseMostLink(link)
  if (!result.errorCode) return null

  if (result.errorCode === MOST_LINK_ERROR_CODES.UNSUPPORTED_QUERY_PARAM) {
    return {
      key: 'app.download.validation.unsupportedParam',
      params: {
        param: result.details?.param || '',
      },
    }
  }

  return {
    key:
      downloadValidationErrorKeys[result.errorCode || ''] ||
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
