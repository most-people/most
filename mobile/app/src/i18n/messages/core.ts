export const coreMessages = {
  'common.cancel': {
    'zh-CN': '取消',
    'zh-TW': '取消',
    en: 'Cancel',
  },
  'common.close': {
    'zh-CN': '关闭',
    'zh-TW': '關閉',
    en: 'Close',
  },
  'common.delete': {
    'zh-CN': '删除',
    'zh-TW': '刪除',
    en: 'Delete',
  },
  'common.retry': {
    'zh-CN': '重试',
    'zh-TW': '重試',
    en: 'Retry',
  },
  'common.save': {
    'zh-CN': '保存',
    'zh-TW': '儲存',
    en: 'Save',
  },
  'common.edit': {
    'zh-CN': '编辑',
    'zh-TW': '編輯',
    en: 'Edit',
  },
  'common.preview': {
    'zh-CN': '预览',
    'zh-TW': '預覽',
    en: 'Preview',
  },
  'common.copy': {
    'zh-CN': '复制',
    'zh-TW': '複製',
    en: 'Copy',
  },
  'common.share': {
    'zh-CN': '分享',
    'zh-TW': '分享',
    en: 'Share',
  },
  'common.unknown': {
    'zh-CN': '未知',
    'zh-TW': '未知',
    en: 'Unknown',
  },
  'common.language.choose': {
    'zh-CN': '选择语言',
    'zh-TW': '選擇語言',
    en: 'Choose language',
  },
  'common.language.current': {
    'zh-CN': '{language}（当前）',
    'zh-TW': '{language}（目前）',
    en: '{language} (Current)',
  },
  'nav.files': {
    'zh-CN': '文件',
    'zh-TW': '檔案',
    en: 'Files',
  },
  'nav.knowledge': {
    'zh-CN': '知识库',
    'zh-TW': '知識庫',
    en: 'Knowledge',
  },
  'nav.transfers': {
    'zh-CN': '传输',
    'zh-TW': '傳輸',
    en: 'Transfers',
  },
  'nav.node': {
    'zh-CN': '节点',
    'zh-TW': '節點',
    en: 'Node',
  },
  'core.error.seedUnavailable': {
    'zh-CN': '暂未发现在线种子，请稍后重试。',
    'zh-TW': '暫未發現在線種子，請稍後重試。',
    en: 'No online seed was found. Try again later.',
  },
  'core.error.downloadCancelled': {
    'zh-CN': '下载已取消。',
    'zh-TW': '下載已取消。',
    en: 'Download cancelled.',
  },
  'core.error.cidMismatch': {
    'zh-CN': '文件校验失败，内容与分享链接不一致。',
    'zh-TW': '檔案驗證失敗，內容與分享連結不一致。',
    en: 'File verification failed because the content does not match the share link.',
  },
  'core.error.notReady': {
    'zh-CN': 'P2P 核心未就绪，请稍后重试。',
    'zh-TW': 'P2P 核心尚未就緒，請稍後重試。',
    en: 'The P2P core is not ready. Try again later.',
  },
  'core.error.network': {
    'zh-CN': '连接种子失败，请检查网络后重试。',
    'zh-TW': '連線種子失敗，請檢查網路後重試。',
    en: 'Could not connect to a seed. Check your network and try again.',
  },
  'core.error.generic': {
    'zh-CN': '操作未完成，请稍后重试。',
    'zh-TW': '操作未完成，請稍後重試。',
    en: 'The operation did not complete. Try again later.',
  },
  'core.transfer.calculatingCid': {
    'zh-CN': '正在计算 CID',
    'zh-TW': '正在計算 CID',
    en: 'Calculating CID',
  },
  'core.transfer.writingDrive': {
    'zh-CN': '正在写入本地内容库',
    'zh-TW': '正在寫入本機內容庫',
    en: 'Writing to the local content store',
  },
  'core.transfer.publishedSeeding': {
    'zh-CN': '发布完成，正在做种',
    'zh-TW': '發佈完成，正在做種',
    en: 'Published and seeding',
  },
  'core.transfer.connecting': {
    'zh-CN': '正在连接内容网络',
    'zh-TW': '正在連線內容網路',
    en: 'Connecting to the content network',
  },
  'core.transfer.localAvailable': {
    'zh-CN': '本机已有该文件',
    'zh-TW': '本機已有此檔案',
    en: 'Already available on this device',
  },
  'core.transfer.findingPeers': {
    'zh-CN': '正在查找在线种子',
    'zh-TW': '正在尋找在線種子',
    en: 'Finding online seeds',
  },
  'core.transfer.downloading': {
    'zh-CN': '正在下载文件',
    'zh-TW': '正在下載檔案',
    en: 'Downloading file',
  },
  'core.transfer.verifying': {
    'zh-CN': '正在校验 CID',
    'zh-TW': '正在驗證 CID',
    en: 'Verifying CID',
  },
  'core.transfer.downloadedSeeding': {
    'zh-CN': '下载完成，正在做种',
    'zh-TW': '下載完成，正在做種',
    en: 'Downloaded and seeding',
  },
} as const
