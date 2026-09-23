export const chatMessages = {
  'chat.remoteRequired': {
    'zh-CN': '聊天需要远程节点',
    'zh-TW': '聊天需要遠端節點',
    en: 'Chat requires a remote node',
  },
  'chat.remoteRequiredBody': {
    'zh-CN': '请先在节点页连接已启用聊天的 MostBox 节点。',
    'zh-TW': '請先在節點頁連線已啟用聊天的 MostBox 節點。',
    en: 'Connect to a MostBox node with chat enabled from the Node tab.',
  },
  'chat.signInRequired': {
    'zh-CN': '请先登录节点',
    'zh-TW': '請先登入節點',
    en: 'Sign in to the node first',
  },
  'chat.signInRequiredBody': {
    'zh-CN': '聊天消息需要使用节点身份签名。',
    'zh-TW': '聊天訊息需要使用節點身份簽名。',
    en: 'Chat messages require a signed node identity.',
  },
  'chat.channelPlaceholder': {
    'zh-CN': '输入频道名称',
    'zh-TW': '輸入頻道名稱',
    en: 'Channel name',
  },
  'chat.join': { 'zh-CN': '加入', 'zh-TW': '加入', en: 'Join' },
  'chat.chooseChannel': {
    'zh-CN': '加入或选择一个频道开始聊天',
    'zh-TW': '加入或選擇一個頻道開始聊天',
    en: 'Join or select a channel to start chatting',
  },
  'chat.messagePlaceholder': {
    'zh-CN': '输入消息',
    'zh-TW': '輸入訊息',
    en: 'Write a message',
  },
  'chat.send': { 'zh-CN': '发送消息', 'zh-TW': '傳送訊息', en: 'Send message' },
  'chat.attach': {
    'zh-CN': '发送文件附件',
    'zh-TW': '傳送檔案附件',
    en: 'Send file attachment',
  },
  'chat.attachmentLabel': {
    'zh-CN': '附件：{fileName}',
    'zh-TW': '附件：{fileName}',
    en: 'Attachment: {fileName}',
  },
  'chat.attachmentFailed': {
    'zh-CN': '发送附件失败',
    'zh-TW': '傳送附件失敗',
    en: 'Could not send attachment',
  },
  'chat.loadFailed': {
    'zh-CN': '加载频道失败',
    'zh-TW': '載入頻道失敗',
    en: 'Could not load channel',
  },
  'chat.joinFailed': {
    'zh-CN': '加入频道失败',
    'zh-TW': '加入頻道失敗',
    en: 'Could not join channel',
  },
  'chat.sendFailed': {
    'zh-CN': '发送消息失败',
    'zh-TW': '傳送訊息失敗',
    en: 'Could not send message',
  },
  'chat.voiceTitle': {
    'zh-CN': '语音信令',
    'zh-TW': '語音信令',
    en: 'Voice signaling',
  },
  'chat.voiceJoin': {
    'zh-CN': '加入语音',
    'zh-TW': '加入語音',
    en: 'Join voice',
  },
  'chat.voiceLeave': {
    'zh-CN': '离开语音',
    'zh-TW': '離開語音',
    en: 'Leave voice',
  },
  'chat.voiceMute': {
    'zh-CN': '切换静音',
    'zh-TW': '切換靜音',
    en: 'Toggle mute',
  },
  'chat.voiceUnmute': {
    'zh-CN': '取消静音',
    'zh-TW': '取消靜音',
    en: 'Unmute',
  },
  'chat.voiceMuted': {
    'zh-CN': '已静音',
    'zh-TW': '已靜音',
    en: 'muted',
  },
  'chat.voiceConnecting': {
    'zh-CN': '连接中',
    'zh-TW': '連線中',
    en: 'Connecting',
  },
  'chat.voiceHint': {
    'zh-CN': '仅交换语音信令，不采集麦克风音频。',
    'zh-TW': '僅交換語音信令，不擷取麥克風音訊。',
    en: 'Signaling only; microphone audio is not captured.',
  },
  'chat.voiceFailed': {
    'zh-CN': '语音连接失败',
    'zh-TW': '語音連線失敗',
    en: 'Could not connect to voice signaling',
  },
} as const
