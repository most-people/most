export const zhCNChatJoinMessages = {
  'chatJoin.error.unknownFixture': '未知预设邀请：{fixture}',
  'chatJoin.error.missingToken': '邀请链接缺少 fragment token',
  'chatJoin.error.remoteConnectFailed': '远程节点连接失败',
  'chatJoin.error.noBackend': '未连接后端，邀请中也没有 node_url',
  'chatJoin.error.invalidInvite':
    '邀请内容无效或缺少 expires_at、uid、channels[].id',
  'chatJoin.error.expired': '邀请链接已过期，请让发送者重新生成',
  'chatJoin.error.request': '加入失败: {message}',
  'chatJoin.action.retry': '重试',
  'chatJoin.demo.title': '聊天邀请 Demo',
  'chatJoin.demo.guide.title': '如何生成并使用邀请链接',
  'chatJoin.demo.guide.description':
    '在这里填写频道信息、生成链接并完成一次真实加入测试，也可以粘贴已有链接检查内容。',
  'chatJoin.demo.guide.stepLabel': '第 {number} 步',
  'chatJoin.demo.guide.step.configure.title': '填写邀请内容',
  'chatJoin.demo.guide.step.configure.description':
    '用户 ID、频道 ID 和过期时间必填；昵称、头像、品牌、节点和界面偏好均为可选项。',
  'chatJoin.demo.guide.step.share.title': '生成并发送链接',
  'chatJoin.demo.guide.step.share.description':
    '点击生成链接，把完整的 /chat/join#token 链接发送给预期接收者。',
  'chatJoin.demo.guide.step.signIn.title': '接收者打开邀请',
  'chatJoin.demo.guide.step.signIn.description':
    'MostBox 在本地解析邀请，并把邀请中的身份与品牌资料应用到当前本地会话。',
  'chatJoin.demo.guide.step.join.title': '连接节点并进入频道',
  'chatJoin.demo.guide.step.join.description':
    'MostBox 按需连接邀请中的节点、加入所有频道，并打开第一个频道。',
  'chatJoin.demo.guide.security.title': '链接安全须知',
  'chatJoin.demo.guide.security.fragment':
    '#token 由浏览器本地处理，不会随普通 HTTP 请求发送给官网或 CDN。',
  'chatJoin.demo.guide.security.capability':
    '完整链接在过期前即代表加入能力；它不绑定收件人，请只发给预期接收者。',
  'chatJoin.demo.guide.security.identity':
    '邀请会创建或切换本地身份，并覆盖昵称、头像、Logo、主题和标签；只打开可信来源的链接。',
  'chatJoin.demo.guide.security.legacy':
    '旧版 ?token=...&pub=... 链接不再支持，需要重新生成。',
  'chatJoin.demo.parseSection': '解析现有链接',
  'chatJoin.demo.inviteSection': '邀请内容',
  'chatJoin.demo.outputSection': '生成结果',
  'chatJoin.demo.field.existingLink': '现有邀请链接',
  'chatJoin.demo.field.origin': '链接域名',
  'chatJoin.demo.field.locale': '语言',
  'chatJoin.demo.field.expiresAt': '过期时间（本地时间）',
  'chatJoin.demo.field.uid': '本地身份用户 ID',
  'chatJoin.demo.field.displayName': '显示昵称',
  'chatJoin.demo.field.avatar': '头像 URL 或 data URL',
  'chatJoin.demo.field.theme': '主题',
  'chatJoin.demo.field.appearance': '外观',
  'chatJoin.demo.field.channelId': '频道 ID',
  'chatJoin.demo.field.channelName': '频道备注',
  'chatJoin.demo.field.nodeUrl': '远程节点地址',
  'chatJoin.demo.field.nodeInvite': '远程节点邀请码',
  'chatJoin.demo.field.logo': '浅色 Logo',
  'chatJoin.demo.field.logoDark': '深色 Logo',
  'chatJoin.demo.field.data': '扩展数据',
  'chatJoin.demo.field.payload': '邀请内容 JSON',
  'chatJoin.demo.field.token': '加密令牌',
  'chatJoin.demo.field.link': '邀请链接',
  'chatJoin.demo.action.parseLink': '解析链接',
  'chatJoin.demo.action.generate': '生成链接',
  'chatJoin.demo.action.openLink': '打开链接',
  'chatJoin.demo.status.linkParsed': '已解析 fragment token',
  'chatJoin.demo.status.linkDecrypted': '已解密 payload 并回填表单',
  'chatJoin.demo.error.linkInvalid': '请输入 /chat/join#token 邀请链接',
  'chatJoin.demo.error.parseInvalidPayload':
    '链接已解析，但解密结果不是有效邀请 payload',
  'chatJoin.demo.error.channelInvalid':
    '频道 ID 需要是 3-30 位字母、数字、_ 或 -',
  'chatJoin.demo.error.uidRequired': '用户 ID 不能为空',
  'chatJoin.demo.error.expiresAtInvalid': '过期时间必须晚于当前时间',
  'chatJoin.demo.error.encryptFailed': '加密失败，请检查 payload',
} as const

export const zhTWChatJoinMessages = {
  'chatJoin.error.unknownFixture': '未知預設邀請：{fixture}',
  'chatJoin.error.missingToken': '邀請連結缺少 fragment token',
  'chatJoin.error.remoteConnectFailed': '遠端節點連線失敗',
  'chatJoin.error.noBackend': '未連線後端，邀請中也沒有 node_url',
  'chatJoin.error.invalidInvite':
    '邀請內容無效或缺少 expires_at、uid、channels[].id',
  'chatJoin.error.expired': '邀請連結已過期，請讓傳送者重新生成',
  'chatJoin.error.request': '加入失敗: {message}',
  'chatJoin.action.retry': '重試',
  'chatJoin.demo.title': '聊天邀請 Demo',
  'chatJoin.demo.guide.title': '如何生成並使用邀請連結',
  'chatJoin.demo.guide.description':
    '在這裡填寫頻道資訊、生成連結並完成一次真實加入測試，也可以貼上現有連結檢查內容。',
  'chatJoin.demo.guide.stepLabel': '第 {number} 步',
  'chatJoin.demo.guide.step.configure.title': '填寫邀請內容',
  'chatJoin.demo.guide.step.configure.description':
    '使用者 ID、頻道 ID 和到期時間必填；暱稱、頭像、品牌、節點和介面偏好均為選填項目。',
  'chatJoin.demo.guide.step.share.title': '生成並傳送連結',
  'chatJoin.demo.guide.step.share.description':
    '點擊生成連結，把完整的 /chat/join#token 連結傳送給預期接收者。',
  'chatJoin.demo.guide.step.signIn.title': '接收者開啟邀請',
  'chatJoin.demo.guide.step.signIn.description':
    'MostBox 在本機解析邀請，並將邀請中的身分與品牌資料套用到目前本機工作階段。',
  'chatJoin.demo.guide.step.join.title': '連線節點並進入頻道',
  'chatJoin.demo.guide.step.join.description':
    'MostBox 視需要連線邀請中的節點、加入所有頻道，並開啟第一個頻道。',
  'chatJoin.demo.guide.security.title': '連結安全須知',
  'chatJoin.demo.guide.security.fragment':
    '#token 由瀏覽器本機處理，不會隨一般 HTTP 請求傳送給官網或 CDN。',
  'chatJoin.demo.guide.security.capability':
    '完整連結在到期前即代表加入能力；它不綁定收件者，請只傳給預期接收者。',
  'chatJoin.demo.guide.security.identity':
    '邀請會建立或切換本機身分，並覆蓋暱稱、頭像、Logo、主題和標籤；只開啟可信來源的連結。',
  'chatJoin.demo.guide.security.legacy':
    '舊版 ?token=...&pub=... 連結已不再支援，需要重新生成。',
  'chatJoin.demo.parseSection': '解析現有連結',
  'chatJoin.demo.inviteSection': '邀請內容',
  'chatJoin.demo.outputSection': '生成結果',
  'chatJoin.demo.field.existingLink': '現有邀請連結',
  'chatJoin.demo.field.origin': '連結域名',
  'chatJoin.demo.field.locale': '語言',
  'chatJoin.demo.field.expiresAt': '到期時間（本機時間）',
  'chatJoin.demo.field.uid': '本機身分使用者 ID',
  'chatJoin.demo.field.displayName': '顯示暱稱',
  'chatJoin.demo.field.avatar': '頭像 URL 或 data URL',
  'chatJoin.demo.field.theme': '主題',
  'chatJoin.demo.field.appearance': '外觀',
  'chatJoin.demo.field.channelId': '頻道 ID',
  'chatJoin.demo.field.channelName': '頻道備註',
  'chatJoin.demo.field.nodeUrl': '遠端節點位址',
  'chatJoin.demo.field.nodeInvite': '遠端節點邀請碼',
  'chatJoin.demo.field.logo': '淺色 Logo',
  'chatJoin.demo.field.logoDark': '深色 Logo',
  'chatJoin.demo.field.data': '擴充資料',
  'chatJoin.demo.field.payload': '邀請內容 JSON',
  'chatJoin.demo.field.token': '加密權杖',
  'chatJoin.demo.field.link': '邀請連結',
  'chatJoin.demo.action.parseLink': '解析連結',
  'chatJoin.demo.action.generate': '生成連結',
  'chatJoin.demo.action.openLink': '開啟連結',
  'chatJoin.demo.status.linkParsed': '已解析 fragment token',
  'chatJoin.demo.status.linkDecrypted': '已解密 payload 並回填表單',
  'chatJoin.demo.error.linkInvalid': '請輸入 /chat/join#token 邀請連結',
  'chatJoin.demo.error.parseInvalidPayload':
    '連結已解析，但解密結果不是有效邀請 payload',
  'chatJoin.demo.error.channelInvalid':
    '頻道 ID 需要是 3-30 位字母、數字、_ 或 -',
  'chatJoin.demo.error.uidRequired': '使用者 ID 不可為空',
  'chatJoin.demo.error.expiresAtInvalid': '到期時間必須晚於目前時間',
  'chatJoin.demo.error.encryptFailed': '加密失敗，請檢查 payload',
} as const

export const enChatJoinMessages = {
  'chatJoin.error.unknownFixture': 'Unknown preset invite: {fixture}',
  'chatJoin.error.missingToken': 'Invite link is missing its fragment token',
  'chatJoin.error.remoteConnectFailed': 'Failed to connect to remote node',
  'chatJoin.error.noBackend':
    'No backend is connected and the invite has no node_url',
  'chatJoin.error.invalidInvite':
    'Invite is invalid or missing expires_at, uid, or channels[].id',
  'chatJoin.error.expired':
    'This invite link has expired. Ask the sender to generate a new one.',
  'chatJoin.error.request': 'Join failed: {message}',
  'chatJoin.action.retry': 'Retry',
  'chatJoin.demo.title': 'Chat invite demo',
  'chatJoin.demo.guide.title': 'Create and use an invite link',
  'chatJoin.demo.guide.description':
    'Enter channel details, generate a link, and complete a real join test, or paste an existing link to inspect its payload.',
  'chatJoin.demo.guide.stepLabel': 'Step {number}',
  'chatJoin.demo.guide.step.configure.title': 'Configure the invite',
  'chatJoin.demo.guide.step.configure.description':
    'User ID, channel ID, and expiry are required. Name, avatar, branding, node connection, and appearance are optional.',
  'chatJoin.demo.guide.step.share.title': 'Generate and share',
  'chatJoin.demo.guide.step.share.description':
    'Generate the link, then send the complete /chat/join#token URL to the intended recipient.',
  'chatJoin.demo.guide.step.signIn.title': 'Open the invite',
  'chatJoin.demo.guide.step.signIn.description':
    'MostBox parses the invite locally and applies its identity and branding fields to the current local session.',
  'chatJoin.demo.guide.step.join.title': 'Connect and join',
  'chatJoin.demo.guide.step.join.description':
    'MostBox connects to the invited node when needed, joins every channel, and opens the first one.',
  'chatJoin.demo.guide.security.title': 'Link security',
  'chatJoin.demo.guide.security.fragment':
    'The browser processes #token locally; ordinary HTTP requests do not send it to the website or CDN.',
  'chatJoin.demo.guide.security.capability':
    'The complete link grants join capability until it expires. It is not recipient-bound, so share it only with intended recipients.',
  'chatJoin.demo.guide.security.identity':
    'An invite creates or switches the local identity and replaces its name, avatar, logos, theme, and tag. Open links only from trusted sources.',
  'chatJoin.demo.guide.security.legacy':
    'Legacy ?token=...&pub=... links are unsupported and must be regenerated.',
  'chatJoin.demo.parseSection': 'Parse existing link',
  'chatJoin.demo.inviteSection': 'Invite payload',
  'chatJoin.demo.outputSection': 'Generated output',
  'chatJoin.demo.field.existingLink': 'Existing invite link',
  'chatJoin.demo.field.origin': 'Link origin',
  'chatJoin.demo.field.locale': 'Locale',
  'chatJoin.demo.field.expiresAt': 'Expiry (local time)',
  'chatJoin.demo.field.uid': 'Local identity user ID',
  'chatJoin.demo.field.displayName': 'Display name',
  'chatJoin.demo.field.avatar': 'Avatar URL or data URL',
  'chatJoin.demo.field.theme': 'Theme',
  'chatJoin.demo.field.appearance': 'Appearance',
  'chatJoin.demo.field.channelId': 'Channel ID',
  'chatJoin.demo.field.channelName': 'Channel remark',
  'chatJoin.demo.field.nodeUrl': 'Remote node URL',
  'chatJoin.demo.field.nodeInvite': 'Remote node invite code',
  'chatJoin.demo.field.logo': 'Light logo',
  'chatJoin.demo.field.logoDark': 'Dark logo',
  'chatJoin.demo.field.data': 'Extra data',
  'chatJoin.demo.field.payload': 'Invite payload JSON',
  'chatJoin.demo.field.token': 'Encrypted token',
  'chatJoin.demo.field.link': 'Invite link',
  'chatJoin.demo.action.parseLink': 'Parse link',
  'chatJoin.demo.action.generate': 'Generate link',
  'chatJoin.demo.action.openLink': 'Open link',
  'chatJoin.demo.status.linkParsed': 'Parsed the fragment token',
  'chatJoin.demo.status.linkDecrypted': 'Decrypted payload and filled the form',
  'chatJoin.demo.error.linkInvalid': 'Enter a /chat/join#token invite link',
  'chatJoin.demo.error.parseInvalidPayload':
    'The link was parsed, but the decrypted result is not a valid invite payload.',
  'chatJoin.demo.error.channelInvalid':
    'Channel ID must be 3-30 letters, numbers, _ or -',
  'chatJoin.demo.error.uidRequired': 'User ID is required',
  'chatJoin.demo.error.expiresAtInvalid':
    'Expiry must be later than the current time',
  'chatJoin.demo.error.encryptFailed': 'Encryption failed. Check the payload.',
} as const
