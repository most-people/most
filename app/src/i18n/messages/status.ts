export const statusMessages = {
  'status.starting.title': {
    'zh-CN': '正在启动节点…',
    'zh-TW': '正在啟動節點…',
    en: 'Starting node…',
  },
  'status.starting.detail': {
    'zh-CN': '启动完成后会自动连接其他在线节点。',
    'zh-TW': '啟動完成後會自動連線其他上線節點。',
    en: 'It will connect to other online peers once started.',
  },
  'status.offline.title': {
    'zh-CN': '未连接',
    'zh-TW': '未連線',
    en: 'Not connected',
  },
  'status.offline.localDetail': {
    'zh-CN': '本机节点未运行，暂时无法收发消息。点击查看并重试。',
    'zh-TW': '本機節點未執行，暫時無法收發訊息。點擊查看並重試。',
    en: 'The local node is not running, so messages cannot be sent or received. Tap to review and retry.',
  },
  'status.offline.remoteDetail': {
    'zh-CN': '无法连接 {source}，暂时无法收发消息。点击检查连接。',
    'zh-TW': '無法連線 {source}，暫時無法收發訊息。點擊檢查連線。',
    en: 'Cannot reach {source}, so messages cannot be sent or received. Tap to check the connection.',
  },
  'status.login.title': {
    'zh-CN': '未登录远程节点',
    'zh-TW': '未登入遠端節點',
    en: 'Not signed in to the remote node',
  },
  'status.login.detail': {
    'zh-CN': '登录 {source} 后才能收发消息。点击前往登录。',
    'zh-TW': '登入 {source} 後才能收發訊息。點擊前往登入。',
    en: 'Sign in to {source} to send and receive messages. Tap to sign in.',
  },
  'status.reconnecting.title': {
    'zh-CN': '正在重新连接…',
    'zh-TW': '正在重新連線…',
    en: 'Reconnecting…',
  },
  'status.reconnecting.detail': {
    'zh-CN': '正在恢复与 {source} 的连接并同步消息，已有历史仍可查看。',
    'zh-TW': '正在恢復與 {source} 的連線並同步訊息，已有歷史仍可查看。',
    en: 'Restoring the connection to {source} and syncing. Existing history is still available.',
  },
  'status.alone.title': {
    'zh-CN': '已联网 · 暂无其他节点在线',
    'zh-TW': '已連網 · 暫無其他節點上線',
    en: 'Online · no other peers yet',
  },
  'status.alone.detail': {
    'zh-CN': '消息会先保存在本节点，等对方上线后自动同步。',
    'zh-TW': '訊息會先保存在本節點，等對方上線後自動同步。',
    en: 'Messages are kept on this node and sync automatically when others come online.',
  },
  'status.connected.title': {
    'zh-CN': '已连接 · {count} 个节点在线',
    'zh-TW': '已連線 · {count} 個節點上線',
    en: 'Connected · {count} peers online',
  },
  'status.connected.localDetail': {
    'zh-CN': '本机节点 · 点对点同步中',
    'zh-TW': '本機節點 · 點對點同步中',
    en: 'This device · syncing peer to peer',
  },
  'status.connected.remoteDetail': {
    'zh-CN': '通过 {source} · 点对点同步中',
    'zh-TW': '透過 {source} · 點對點同步中',
    en: 'Via {source} · syncing peer to peer',
  },
  'status.channelAlone.title': {
    'zh-CN': '本频道暂无其他节点在线',
    'zh-TW': '本頻道暫無其他節點上線',
    en: 'No other peers online in this channel',
  },
  'status.channelConnected.title': {
    'zh-CN': '本频道 {count} 个节点在线',
    'zh-TW': '本頻道 {count} 個節點上線',
    en: '{count} peers online in this channel',
  },
  'status.delivery.localOnly': {
    'zh-CN': '仅保存在本节点，对方上线后同步',
    'zh-TW': '僅保存在本節點，對方上線後同步',
    en: 'Saved on this node only; syncs when others come online',
  },
  'status.delivery.peers': {
    'zh-CN': '已发给 {count} 个在线节点',
    'zh-TW': '已發給 {count} 個上線節點',
    en: 'Sent to {count} online peers',
  },
} as const
