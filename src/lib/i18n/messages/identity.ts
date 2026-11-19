export const zhCNIdentityMessages = {
  'login.title': '登录',
  'login.username.placeholder': '用户名',
  'login.password.placeholder': '密码',
  'login.preview': '登录',
  'login.previewed': '检查地址',
  'login.loading': '登录中',
  'login.toast.signedIn': '已登录 {username}',
  'login.error.credentialsRequired': '请输入用户名和密码',
  'login.error.previewRequired': '请先预览并确认头像',
  'login.error.failed': '登录失败',
  'login.warning.passwordShort':
    '密码少于 18 个字符，账号可能被离线暴力破解。建议用一句诗或一句歌词作密码；你也可以忽略此提示继续使用。',
  'unlock.title': '输入密码解锁',
  'unlock.tip':
    '此操作需要账号密码。密码只保存在本页内存中，关闭页面后需重新输入。',
  'unlock.password.placeholder': '密码',
  'unlock.submit': '解锁',
  'unlock.error.passwordRequired': '请输入密码',
  'unlock.error.wrongPassword': '密码不正确',
  'profile.certTtl.label': '设备授权有效期',
  'profile.certTtl.4h': '4 小时',
  'profile.certTtl.1d': '1 天',
  'profile.certTtl.30d': '30 天',
  'profile.certTtl.hint':
    '限制这台设备访问节点的时长，修改时可能需要再次输入密码；到期前会提示输入密码续期。它不影响聊天消息的签名验证，不能阻止已泄露的设备密钥冒充你发言。',
  'profile.certTtl.expires': '当前授权到期时间：{time}',
  'profile.certTtl.failed': '未能修改设备授权有效期',
  'unlock.renewTip':
    '这台设备访问节点的授权即将到期。输入密码续期，否则到期后需要重新登录。',
} as const

export const zhTWIdentityMessages = {
  'login.title': '登入',
  'login.username.placeholder': '使用者名稱',
  'login.password.placeholder': '密碼',
  'login.preview': '登入',
  'login.previewed': '檢查地址',
  'login.loading': '登入中',
  'login.toast.signedIn': '已登入 {username}',
  'login.error.credentialsRequired': '請輸入使用者名稱和密碼',
  'login.error.previewRequired': '請先預覽並確認頭像',
  'login.error.failed': '登入失敗',
  'login.warning.passwordShort':
    '密碼少於 18 個字元，帳號可能被離線暴力破解。建議用一句詩或一句歌詞作密碼；你也可以忽略此提示繼續使用。',
  'unlock.title': '輸入密碼解鎖',
  'unlock.tip':
    '此操作需要帳號密碼。密碼只保存在本頁記憶體中，關閉頁面後需重新輸入。',
  'unlock.password.placeholder': '密碼',
  'unlock.submit': '解鎖',
  'unlock.error.passwordRequired': '請輸入密碼',
  'unlock.error.wrongPassword': '密碼不正確',
  'profile.certTtl.label': '裝置授權有效期',
  'profile.certTtl.4h': '4 小時',
  'profile.certTtl.1d': '1 天',
  'profile.certTtl.30d': '30 天',
  'profile.certTtl.hint':
    '限制這台裝置存取節點的時長，修改時可能需要再次輸入密碼；到期前會提示輸入密碼續期。它不影響聊天訊息的簽署驗證，不能阻止已外洩的裝置金鑰冒充你發言。',
  'profile.certTtl.expires': '目前授權到期時間：{time}',
  'profile.certTtl.failed': '未能修改裝置授權有效期',
  'unlock.renewTip':
    '這台裝置存取節點的授權即將到期。輸入密碼續期，否則到期後需要重新登入。',
} as const

export const enIdentityMessages = {
  'login.title': 'Sign in',
  'login.username.placeholder': 'Username',
  'login.password.placeholder': 'Password',
  'login.preview': 'Sign in',
  'login.previewed': 'Check address',
  'login.loading': 'Signing in',
  'login.toast.signedIn': 'Signed in as {username}',
  'login.error.credentialsRequired': 'Enter a username and password',
  'login.error.previewRequired': 'Preview and confirm the avatar first',
  'login.error.failed': 'Sign-in failed',
  'login.warning.passwordShort':
    'This password is shorter than 18 characters, so the account could be cracked offline. A line of a poem or song works well. You can ignore this warning and continue.',
  'unlock.title': 'Enter password to unlock',
  'unlock.tip':
    'This action needs your account password. It is kept in this page memory only and must be entered again after the page closes.',
  'unlock.password.placeholder': 'Password',
  'unlock.submit': 'Unlock',
  'unlock.error.passwordRequired': 'Enter your password',
  'unlock.error.wrongPassword': 'Incorrect password',
  'profile.certTtl.label': 'Device authorization period',
  'profile.certTtl.4h': '4 hours',
  'profile.certTtl.1d': '1 day',
  'profile.certTtl.30d': '30 days',
  'profile.certTtl.hint':
    'Limits how long this device can access the node (changing it may ask for your password again); you are asked for your password to renew before it ends. It does not affect how chat message signatures are checked and cannot stop a leaked device key from posting as you.',
  'profile.certTtl.expires': 'Current authorization ends at {time}',
  'profile.certTtl.failed': 'Could not change the device authorization period',
  'unlock.renewTip':
    "This device's access to the node is about to expire. Enter your password to renew it, or sign in again after it expires.",
} as const
