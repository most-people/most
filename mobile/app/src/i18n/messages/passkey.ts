export const passkeyMessages = {
  'passkey.lab.title': {
    'zh-CN': '通行密钥实验',
    'zh-TW': '通行密鑰實驗',
    en: 'Passkey lab',
  },
  'passkey.lab.create': {
    'zh-CN': '创建通行密钥账号',
    'zh-TW': '建立通行密鑰帳號',
    en: 'Create passkey account',
  },
  'passkey.lab.authenticate': {
    'zh-CN': '验证已有通行密钥',
    'zh-TW': '驗證現有通行密鑰',
    en: 'Verify existing passkey',
  },
  'passkey.lab.verifiedTitle': {
    'zh-CN': '通行密钥验证通过',
    'zh-TW': '通行密鑰驗證通過',
    en: 'Passkey verified',
  },
  'passkey.lab.verifiedBody': {
    'zh-CN': '{name}\n{address}\n凭据指纹：{fingerprint}',
    'zh-TW': '{name}\n{address}\n憑據指紋：{fingerprint}',
    en: '{name}\n{address}\nCredential fingerprint: {fingerprint}',
  },
  'passkey.lab.failedTitle': {
    'zh-CN': '通行密钥实验失败',
    'zh-TW': '通行密鑰實驗失敗',
    en: 'Passkey lab failed',
  },
  'passkey.lab.failedBody': {
    'zh-CN': '加密回调无效、已过期或没有待处理请求，未产生账号。',
    'zh-TW': '加密回呼無效、已過期或沒有待處理請求，未產生帳號。',
    en: 'The encrypted callback is invalid, expired, or has no pending request. No account was produced.',
  },
  'passkey.lab.openFailed': {
    'zh-CN': '无法打开 most.box 通行密钥实验页。',
    'zh-TW': '無法開啟 most.box 通行密鑰實驗頁。',
    en: 'Could not open the most.box passkey lab.',
  },
} as const
