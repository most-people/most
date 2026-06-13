import { useMemo, useSyncExternalStore } from 'react'

export type Locale = 'zh-CN' | 'en'

type TranslationParams = Record<string, string | number>

const DEFAULT_LOCALE: Locale = 'zh-CN'
const STORAGE_KEY = 'mostbox.language'
const TRANSLATABLE_ATTRIBUTES = ['title', 'aria-label', 'placeholder', 'alt']
const SKIP_TEXT_SELECTOR =
  '[data-i18n-skip], script, style, noscript, code, pre, .share-link-text, .preview-text, .pem-block, .key-card-value, .milkdown, .ProseMirror, [contenteditable="true"], .message-content, .chat-message-content'
const SKIP_ATTRIBUTE_SELECTOR =
  '[data-i18n-skip], script, style, noscript, code, pre, .share-link-text, .preview-text, .pem-block, .key-card-value'

const localeNames: Record<Locale, string> = {
  'zh-CN': '中文',
  en: 'English',
}

const enText: Record<string, string> = {
  'MOST PEOPLE': 'MOST PEOPLE',
  MostBox: 'MostBox',
  Web3: 'Web3',
  'P2P 文件分享': 'P2P file sharing',
  'P2P 聊天': 'P2P chat',
  '频道加密通讯': 'Encrypted channels',
  '笔记': 'Notes',
  '加密云备份': 'Encrypted cloud backup',
  '游戏': 'Games',
  'P2P 牌桌': 'P2P card table',
  '账户工具箱': 'Account toolbox',
  '去中心化 P2P 工具箱': 'Decentralized P2P toolbox',
  'P2P 文件分享，无需注册': 'P2P file sharing, no signup required',
  '基于 Hyperswarm 的去中心化文件传输，让文件分享回归点对点。MostBox 不是云盘；链接来自 CID，可用性来自当前在线种子。当前 MVP 优先使用桌面客户端。':
    'Decentralized file transfer powered by Hyperswarm. MostBox is not cloud storage; links come from CIDs and availability comes from online seeders. The current MVP is best experienced in the desktop client.',
  '无需云端账号，使用本地身份隔离数据':
    'No cloud account required; local identity keeps data separated',
  'Hyperswarm P2P 直连传输': 'Direct Hyperswarm P2P transfer',
  'GB 级大文件流式处理': 'Streaming support for GB-scale files',
  '相同文件 = 相同 CID，链接可反复校验':
    'Same file means same CID, and links can be verified repeatedly',
  '下载完成后默认继续做种':
    'Downloads keep seeding by default after completion',
  '相比微信、QQ 或网盘，不依赖中心化账号和云端托管':
    'Unlike chat apps or cloud drives, it does not depend on centralized accounts or hosted storage',
  'Web 端只连接已有节点，桌面端提供完整 P2P 能力':
    'The Web app connects to existing nodes; the desktop app provides full P2P capability',
  'MIT 开源，自托管，数据完全自主掌控':
    'MIT open source, self-hostable, and fully under your control',
  '下载客户端': 'Download client',
  '支持 Windows、macOS 和 Linux，桌面端提供完整的 P2P 能力。':
    'Supports Windows, macOS, and Linux. The desktop app provides full P2P capability.',
  '前往下载页': 'Go to downloads',
  '安装并运行': 'Install and run',
  '安装后打开应用，无需单独安装 Node.js。':
    'Open the app after installation. No separate Node.js install is required.',
  '开始分享': 'Start sharing',
  '发布文件生成 most:// 链接，朋友下载校验通过后也会成为新的种子。':
    'Publish a file to create a most:// link. Friends who complete and verify the download become new seeders.',
  '去中心化频道聊天': 'Decentralized channel chat',
  '基于 Hypercore 的 P2P 加密即时通讯。创建频道，邀请朋友，端到端加密，无需服务器中转。':
    'P2P encrypted messaging powered by Hypercore. Create a channel, invite friends, and chat without a relay server.',
  'P2P 加密频道消息': 'Encrypted P2P channel messages',
  '本地登录身份保护消息署名':
    'Local login identity protects message signatures',
  '消息通过 Hyperswarm 网络同步':
    'Messages sync through the Hyperswarm network',
  '离线消息自动同步': 'Offline messages sync automatically',
  '无需中心化账号注册': 'No centralized account registration required',
  '创建频道': 'Create channel',
  '输入任意频道名即可加入或创建。':
    'Enter any channel name to join or create it.',
  '开始聊天': 'Start chatting',
  '发送消息，P2P 网络自动同步给所有在线节点。':
    'Send messages and the P2P network syncs them to online nodes.',
  'Web3 加密笔记': 'Web3 encrypted notes',
  '使用本地 Web3 密钥加密 Markdown 笔记，可在浏览器本地保存并按需同步到云端备份。':
    'Encrypt Markdown notes with local Web3 keys, save them in the browser, and sync encrypted backups when needed.',
  'Markdown 块编辑器': 'Markdown block editor',
  '公开 / 私密笔记切换': 'Public/private note switching',
  '文件夹、搜索和移动': 'Folders, search, and move',
  'Web3 登录态加密': 'Web3 login-based encryption',
  '云端备份与恢复': 'Cloud backup and restore',
  '独立于 P2P 文件分享': 'Independent from P2P file sharing',
  '生成 Web3 账号': 'Generate Web3 account',
  '用用户名和密码派生本地密钥。':
    'Derive local keys from a username and password.',
  '创建笔记': 'Create note',
  '写 Markdown，按需切换为私密内容。':
    'Write Markdown and switch content to private when needed.',
  '备份恢复': 'Backup and restore',
  '登录后可把加密笔记同步到云端。':
    'After login, encrypted notes can sync to the cloud.',
  '常驻节点里的在线牌桌': 'Online card tables in a resident node',
  '把干瞪眼作为 MostBox 的独立页面接入，复用现有频道消息、Web3 登录身份和桌面端常驻入口。':
    'Gandengyan is integrated as an independent MostBox page, reusing channel messages, Web3 login identity, and the desktop resident node.',
  '使用 MostBox 本地账号进入房间':
    'Enter rooms with your local MostBox account',
  '复用 /chat/ 的频道后端，不新增游戏后端接口':
    'Reuses the /chat/ channel backend without adding game-only APIs',
  '房间链接可直接分享到群组': 'Room links can be shared directly',
  '支持 1-2 副牌、2-6 人和人机陪测':
    'Supports 1-2 decks, 2-6 players, and bot testing',
  '游戏规则、频道事件和页面样式拆分维护':
    'Game rules, channel events, and page styles are maintained separately',
  '登录账号': 'Sign in',
  '使用现有 MostBox Web3 本地账号作为牌桌身份。':
    'Use your existing local MostBox Web3 account as the table identity.',
  '创建房间': 'Create room',
  '创建房间后复制链接，发给朋友加入。':
    'Create a room, copy the link, and send it to friends.',
  '开始调试': 'Start testing',
  '可先用人机补位测试出牌、计分和房间同步。':
    'Use bot seats to test plays, scoring, and room sync first.',
  '确定性密钥派生工具箱': 'Deterministic key derivation toolbox',
  '纯前端运行的 Web3 账户工具。输入用户名和密码，即可生成 Ed25519 / x25519 密钥对、助记词、以太坊地址，支持 PEM 导出和地址派生。':
    'A front-end only Web3 account tool. Enter a username and password to generate Ed25519/x25519 key pairs, a mnemonic, an Ethereum address, PEM exports, and derived addresses.',
  '纯前端运行，无需后端': 'Runs fully in the browser, no backend required',
  'Ed25519 / x25519 密钥对生成':
    'Ed25519 / x25519 key pair generation',
  'BIP-39 助记词派生': 'BIP-39 mnemonic derivation',
  '以太坊地址与私钥导出': 'Ethereum address and private key export',
  'PEM 格式密钥导出': 'PEM key export',
  '二维码展示地址与助记词': 'QR codes for addresses and mnemonics',
  '输入用户名': 'Enter username',
  '用户名 + 密码（可选）作为种子。':
    'Use username plus optional password as the seed.',
  '查看密钥': 'View keys',
  '即时生成 Ed25519、x25519 公钥与 IPNS ID。':
    'Instantly generate Ed25519 and x25519 public keys plus an IPNS ID.',
  '导出使用': 'Export and use',
  '复制地址、导出 PEM、派生子地址。':
    'Copy addresses, export PEM, and derive child addresses.',
  '检测中': 'Checking',
  '检测中...': 'Checking...',
  '已连接': 'Connected',
  '需连接': 'Needs connection',
  '已就绪': 'Ready',
  '节点入口': 'Node entry',
  'Web 连接节点': 'Connect Web node',
  '节点管理': 'Node admin',
  '进入': 'Open',
  '关于': 'About',
  '网络': 'Network',
  '切换主题': 'Toggle theme',
  '切换到中文': 'Switch to Chinese',
  '切换到英文': 'Switch to English',
  '打开菜单': 'Open menu',
  '展开侧边栏': 'Expand sidebar',
  '收起侧边栏': 'Collapse sidebar',
  '打开侧边栏': 'Open sidebar',
  '打开文件导航': 'Open file navigation',
  '连接节点': 'Connect node',
  '修改远程节点': 'Edit remote node',
  '连接远程节点': 'Connect remote node',
  'Web 端只连接已有 MostBox 节点。输入别人部署好的节点地址和邀请码后，可通过该节点使用文件分享和聊天；本机完整 P2P 能力请使用桌面客户端。':
    'The Web app only connects to an existing MostBox node. Enter a deployed node URL and invite code to use file sharing and chat through that node; use the desktop client for full local P2P capability.',
  '请输入有效的 http(s) 节点地址':
    'Please enter a valid http(s) node URL',
  '远程节点 HTTP 不可达，请检查地址':
    'The remote node HTTP endpoint is unreachable. Check the URL.',
  '远程节点 WebSocket 不可达，请检查地址或代理配置':
    'The remote node WebSocket endpoint is unreachable. Check the URL or proxy.',
  '远程节点连接失败，请检查地址和邀请码':
    'Remote node connection failed. Check the URL and invite code.',
  '远程节点已连接': 'Remote node connected',
  '远程节点连接失败': 'Remote node connection failed',
  '已清除远程节点，优先使用本地节点':
    'Remote node cleared; local node will be preferred',
  '邀请码': 'Invite code',
  '连接中...': 'Connecting...',
  '更新连接': 'Update connection',
  '断开连接': 'Disconnect',
  '登录': 'Sign in',
  '用户名': 'Username',
  '密码': 'Password',
  '密码（可选）': 'Password (optional)',
  '检查地址': 'Check address',
  '确认': 'Confirm',
  '登录中': 'Signing in',
  '已登录': 'Signed in',
  '未登录': 'Not signed in',
  '本地': 'Local',
  '收藏': 'Favorites',
  '回收站': 'Trash',
  '搜索': 'Search',
  '搜索...': 'Search...',
  '清空回收站': 'Empty trash',
  '发布文件': 'Publish file',
  '下载文件': 'Download file',
  '全部内容': 'All content',
  '未找到相关文件': 'No matching files found',
  '回收站是空的': 'Trash is empty',
  '暂无的收藏': 'No favorites yet',
  '暂无本地文件': 'No local files yet',
  '分享链接': 'Share link',
  '本机在线时可下载；下载者完成后会默认继续做种。':
    'Available while this device is online. Completed downloaders keep seeding by default.',
  '输入 most:// 链接': 'Enter a most:// link',
  '检测': 'Check',
  '已通过': 'Passed',
  '开始下载': 'Start download',
  '下载中...': 'Downloading...',
  '已选': 'Selected',
  '恢复': 'Restore',
  '永久删除': 'Delete permanently',
  '预览': 'Preview',
  '重命名': 'Rename',
  '移动': 'Move',
  '删除': 'Delete',
  '拉取到本机': 'Pull to this device',
  '分享': 'Share',
  '另存为': 'Save as',
  '传输': 'Transfers',
  '暂无传输': 'No transfers',
  '完成': 'Completed',
  '失败': 'Failed',
  '已取消': 'Cancelled',
  '取消中': 'Cancelling',
  '清空': 'Empty',
  '取消': 'Cancel',
  '批量删除': 'Delete selected',
  '重命名文件夹': 'Rename folder',
  '重命名文件': 'Rename file',
  '请输入新名称': 'Enter a new name',
  '请先登录后发布文件': 'Sign in before publishing files',
  '请先登录后下载文件': 'Sign in before downloading files',
  '请先检测链接可用性': 'Check link availability first',
  '下载已开始': 'Download started',
  '下载失败': 'Download failed',
  '检测通过': 'Check passed',
  '发布失败': 'Publish failed',
  '已恢复': 'Restored',
  '恢复失败': 'Restore failed',
  '回收站已清空': 'Trash emptied',
  '清空失败': 'Empty failed',
  '已收藏': 'Added to favorites',
  '已取消收藏': 'Removed from favorites',
  '操作失败': 'Action failed',
  '已永久删除': 'Deleted permanently',
  '已删除': 'Deleted',
  '删除失败': 'Delete failed',
  '已移动': 'Moved',
  '移动失败': 'Move failed',
  '已重命名': 'Renamed',
  '重命名失败': 'Rename failed',
  '已添加到本地': 'Added locally',
  '取消失败': 'Cancel failed',
  '文件尚未保存在本机，请先拉取到本机':
    'This file is not saved on this device yet. Pull it locally first.',
  '获取文件失败': 'Failed to get file',
  '文件已保存': 'File saved',
  '文件已下载': 'File downloaded',
  '开始拉取到本机': 'Pulling to this device',
  '已拉取到本机并开始做种':
    'Pulled to this device and started seeding',
  '拉取失败': 'Pull failed',
  '下载已取消': 'Download cancelled',
  '移动到': 'Move to',
  '输入路径创建嵌套文件夹': 'Enter a path to create nested folders',
  '如 图片/壁纸': 'Example: Images/Wallpapers',
  '该目录下没有子文件夹': 'No subfolders in this folder',
  '已复制': 'Copied',
  '复制': 'Copy',
  '下载': 'Download',
  '发送中': 'Sending',
  '发送中...': 'Sending...',
  'MostBox 文件': 'MostBox file',
  '图片': 'Image',
  '视频': 'Video',
  '文件': 'File',
  '有新消息': 'New messages',
  '频道操作': 'Channel actions',
  '取消置顶': 'Unpin',
  '置顶': 'Pin',
  '更多操作': 'More actions',
  '正在读取成员': 'Loading members',
  '正在读取成员...': 'Loading members...',
  '暂无成员': 'No members yet',
  '添加附件': 'Add attachment',
  '附件类型': 'Attachment type',
  '发送消息': 'Send message',
  '加载失败': 'Failed to load',
  '（文件为空）': '(File is empty)',
  '关闭预览': 'Close preview',
  '正在加载音频预览...': 'Loading audio preview...',
  '无法预览': 'Preview unavailable',
  '正在加载文本预览...': 'Loading text preview...',
  '如果是初次预览，可能需要等待 P2P 网络同步':
    'For a first preview, P2P sync may take a moment.',
  '全部笔记': 'All notes',
  '移动笔记': 'Move note',
  '正在移动': 'Moving',
  '还没有可选文件夹': 'No folders available yet',
  '或输入新目录路径，如 文章/摘录':
    'Or enter a new folder path, such as Articles/Clips',
  '目标位置': 'Target location',
  '更多': 'More',
  '云同步': 'Cloud sync',
  '本地导出': 'Local export',
  '网络连通性': 'Network connectivity',
  '通过向对应网站发送请求进行测试，延迟值仅供参考。':
    'Tests by sending requests to each site. Latency is for reference only.',
  '重新测试全部': 'Retest all',
  '重新测试': 'Retest',
  '可用': 'Available',
  '不可用': 'Unavailable',
  '超时': 'Timeout',
  '节点能力': 'Node capability',
  '连接已有节点': 'Connect to an existing node',
  '内置本地节点': 'Built-in local node',
  '下载校验': 'Download verification',
  '持续做种': 'Continuous seeding',
  '大文件传输': 'Large file transfer',
  '依赖所连节点': 'Depends on connected node',
  '完整支持': 'Fully supported',
  '默认开启': 'On by default',
  '10GB 上限内': 'Within 10GB limit',
  '桌面客户端是当前 MVP 的首选入口，内置本地 P2P 节点，提供发布、下载校验和持续做种的完整能力。Web 端只连接已有 MostBox 节点。':
    'The desktop client is the preferred MVP entrypoint. It includes a local P2P node with publishing, download verification, and continuous seeding. The Web app only connects to existing MostBox nodes.',
  '使用 npm 入口请先安装 Node.js >= 22.12，然后运行 npx most-box@latest 启动本机完整节点。':
    'For the npm entrypoint, install Node.js >= 22.12 first, then run npx most-box@latest to start a full local node.',
  '选择你的平台': 'Choose your platform',
  'Web 端 vs 桌面端': 'Web app vs desktop app',
  '功能': 'Feature',
  'Web 端': 'Web app',
  '桌面端': 'Desktop app',
  '返回首页': 'Back home',
  '来源': 'Source',
  '大小': 'Size',
  '当前': 'Current',
  '正在获取 Cloudflare R2 高速镜像。':
    'Fetching the Cloudflare R2 mirror.',
  '无法获取高速镜像信息，已切换到 GitHub Releases 备用下载。':
    'Could not fetch mirror information; switched to GitHub Releases fallback.',
  '下载来源': 'Download source',
  'Cloudflare R2 高速镜像': 'Cloudflare R2 mirror',
  '干瞪眼': 'Gandengyan',
  '炸金花': 'Zhajinhua',
  '房间号': 'Room code',
  '输入房间号': 'Enter room code',
  '加入房间': 'Join room',
  '节点已连接': 'Node connected',
  '正在连接节点...': 'Connecting node...',
  '当前账号': 'Current account',
  '轮到你操作': 'Your turn',
  '进行中': 'In progress',
  '本局结束': 'Round finished',
  '等待开局': 'Waiting to start',
  '已进入房间': 'Joined room',
  '房间已创建': 'Room created',
  '新一局已开始': 'New round started',
  '开局失败': 'Failed to start',
  '至少需要 2 名有足够筹码的玩家':
    'At least 2 players with enough chips are required',
  '炸金花牌桌': 'Zhajinhua table',
  '分享房间': 'Share room',
  '创建房间码邀请朋友加入，房间状态通过 MostBox P2P 频道同步。':
    'Create a room code to invite friends. Room state syncs through a MostBox P2P channel.',
  '底池': 'Pot',
  '当前注': 'Current bet',
  '筹码': 'chips',
  '已弃牌': 'Folded',
  '已看牌': 'Seen cards',
  '在局中': 'In round',
  '我的手牌': 'My hand',
  '未看牌': 'Not seen',
  '等待房主发牌': 'Waiting for host to deal',
  '操作': 'Actions',
  '再来一局': 'Play again',
  '开始本局': 'Start round',
  '等待房主开始或继续牌局。':
    'Waiting for the host to start or continue the round.',
  '筹码不足的玩家太多，无法开局':
    'Too many players have insufficient chips to start',
  '看牌': 'See cards',
  '跟注': 'Call',
  '弃牌': 'Fold',
  '加注': 'Raise',
  '选择比牌对象': 'Choose compare target',
  '比牌': 'Compare',
  '状态': 'Status',
  '房主': 'Host',
  '我的筹码': 'My chips',
  '本轮': 'This round',
  '提示': 'Hint',
  '等待玩家加入': 'Waiting for players',
  '比牌结果': 'Compare result',
  '胜出': 'wins',
  '关闭': 'Close',
  '明文': 'Plaintext',
  '密文': 'Ciphertext',
  '解密结果': 'Decryption result',
  '时间戳': 'Timestamp',
  '随机数': 'Nonce',
  '请输入用户名和密码以生成 PEM 密钥':
    'Enter a username and password to generate PEM keys',
  '请输入用户名和密码以查看身份信息':
    'Enter a username and password to view identity information',
  '请输入用户名和密码以使用钱包工具':
    'Enter a username and password to use wallet tools',
  '查看': 'View',
  'Ed25519 公钥': 'Ed25519 public key',
  'x25519 公钥': 'x25519 public key',
  'x25519 & Ed25519 私钥': 'x25519 & Ed25519 private keys',
  '隐藏私钥': 'Hide private key',
  '显示私钥': 'Show private key',
  '生成中...': 'Generating...',
  '生成并登录': 'Generate and sign in',
  '隐藏地址二维码': 'Hide address QR code',
  '显示地址二维码': 'Show address QR code',
  '隐藏助记词': 'Hide mnemonic',
  '显示助记词': 'Show mnemonic',
  '任何拥有您助记词的人都可以窃取您账户中的任何资产，切勿泄露！！！':
    'Anyone with your mnemonic can steal assets from your account. Never disclose it.',
  '隐藏助记词二维码': 'Hide mnemonic QR code',
  '显示助记词二维码': 'Show mnemonic QR code',
  '任何拥有您私钥的人都可以窃取您地址中的任何资产，切勿泄露！！！':
    'Anyone with your private key can steal assets from your address. Never disclose it.',
  '账户': 'Account',
  '地址': 'Address',
  '私钥': 'Private key',
  '加密': 'Encrypt',
  '解密': 'Decrypt',
  '发送方': 'Sender',
  '接收方': 'Recipient',
  '发送方 x25519 私钥': 'Sender x25519 private key',
  '接收方 x25519 公钥': 'Recipient x25519 public key',
  '输入要加密的消息': 'Enter a message to encrypt',
  '加密成功后显示密文':
    'Ciphertext appears here after encryption succeeds',
  '发送方 x25519 公钥': 'Sender x25519 public key',
  '接收方 x25519 私钥': 'Recipient x25519 private key',
  '粘贴要解密的密文': 'Paste ciphertext to decrypt',
  '解密成功后显示明文':
    'Plaintext appears here after decryption succeeds',
  '只输入发送方私钥和接收方公钥即可加密，无需生成完整账号。':
    'Encrypt with only the sender private key and recipient public key; no full account is required.',
  '只输入发送方公钥和接收方私钥即可解密，无需生成完整账号。':
    'Decrypt with only the sender public key and recipient private key; no full account is required.',
  '出错了': 'Something went wrong',
  '发生了意外错误，请尝试重新加载页面':
    'An unexpected error occurred. Try reloading the page.',
  '重新加载': 'Reload',
  '页面不存在': 'Page not found',
  '返回': 'Back',
  '队列中': 'Queued',
  '加入中': 'Joining',
  '做种中': 'Seeding',
  '已暂停': 'Paused',
  '错误': 'Error',
  '未 join': 'Not joined',
  '从未': 'Never',
  '刚刚': 'Just now',
  '已加入 CID topic，可被其他节点发现并提供完整副本。':
    'Joined the CID topic and can be discovered by other nodes to serve a full copy.',
  '队列中 / 加入中': 'Queued / joining',
  '正在等待或重连 topic，通常会自动进入做种中。':
    'Waiting for or reconnecting to the topic. It usually enters seeding automatically.',
  '已暂停 / 未 join': 'Paused / not joined',
  '本机仍持有文件，但当前不会对外提供下载。':
    'This device still holds the file, but is not currently serving downloads.',
  '加入或做种失败，请查看下方节点日志里的 seed 事件。':
    'Joining or seeding failed. Check seed events in the node logs below.',
  '全部': 'All',
  '正在检测后端连接，请稍后再试':
    'Checking backend connection. Try again in a moment.',
  '未连接后端': 'Backend is not connected',
  '无法读取节点状态': 'Unable to read node status',
  '节点状态已刷新': 'Node status refreshed',
  '节点配置已保存。修改了数据目录，需要重启 daemon 生效。':
    'Node settings saved. The data directory change requires a daemon restart.',
  '节点配置已保存': 'Node settings saved',
  '保存配置失败': 'Failed to save settings',
  '节点 ID 已复制': 'Node ID copied',
  '节点日志已清空': 'Node logs cleared',
  '清空日志失败': 'Failed to clear logs',
  '诊断已导出': 'Diagnostics exported',
  '导出诊断失败': 'Failed to export diagnostics',
  '用户数据已清除': 'User data cleared',
  '清除用户数据失败': 'Failed to clear user data',
  '在线': 'Online',
  '等待': 'Waiting',
  '刷新': 'Refresh',
  '未连接本地 daemon': 'Local daemon is not connected',
  '远程节点管理不可用': 'Remote node admin unavailable',
  '当前连接的是别人部署的远程节点，普通邀请码不能查看或修改节点管理数据。':
    'You are connected to someone else\'s remote node. A regular invite code cannot view or modify node admin data.',
  '节点 ID': 'Node ID',
  '复制节点 ID': 'Copy node ID',
  '连接': 'Connection',
  '容量': 'Capacity',
  '运行': 'Runtime',
  '节点状态': 'Node status',
  '版本': 'Version',
  '监听': 'Listening',
  '数据目录': 'Data directory',
  '用户数据': 'User data',
  '用户': 'User',
  '清除': 'Clear',
  '暂无用户数据': 'No user data yet',
  '节点设置': 'Node settings',
  '容量上限 GiB': 'Capacity limit GiB',
  '单文件最大 GiB': 'Max file size GiB',
  '远程访问邀请码': 'Remote access invite codes',
  '每行一个，或用英文逗号分隔':
    'One per line, or separated by English commas',
  '数据目录变更保存后需要重启 daemon。修改邀请码后新请求立即生效。':
    'Data directory changes require a daemon restart. Invite code changes apply to new requests immediately.',
  '发布和下载成功后会固定做种；MostBox 不设同时做种数或传输限速。':
    'Successful publishes and downloads keep seeding; MostBox does not set a simultaneous seeding limit or transfer rate limit.',
  '保存配置': 'Save settings',
  '持有副本': 'Held copies',
  '做种状态说明': 'Seeding status help',
  '个仍在后台做种。': 'more are still seeding in the background.',
  '最近服务': 'Last served',
  '暂无持有副本': 'No held copies yet',
  '节点日志': 'Node logs',
  '导出诊断': 'Export diagnostics',
  '清空日志': 'Clear logs',
  '日志筛选': 'Log filter',
  '暂无日志': 'No logs yet',
  '聊天': 'Chat',
  '无法读取频道成员': 'Unable to read channel members',
  '附件下载已取消': 'Attachment download cancelled',
  '附件下载失败': 'Attachment download failed',
  '无法读取频道消息': 'Unable to read channel messages',
  '点号为系统保留，不能用于手动频道 ID':
    'Dots are reserved by the system and cannot be used in manual channel IDs',
  '频道名只能包含字母、数字、下划线和连字符':
    'Channel names may contain only letters, numbers, underscores, and hyphens',
  '无法读取频道列表': 'Unable to read channel list',
  '本机已有': 'Already on this device',
  '可预览': 'Preview available',
  '开始下载附件': 'Attachment download started',
  '退出频道失败': 'Failed to leave channel',
  '置顶失败': 'Failed to pin channel',
  '取消置顶失败': 'Failed to unpin channel',
  '加入频道失败': 'Failed to join channel',
  '发送失败': 'Failed to send',
  '附件发送失败': 'Failed to send attachment',
  '设置备注失败': 'Failed to set note',
  '搜索频道': 'Search channels',
  '暂无频道': 'No channels yet',
  '未找到频道': 'No channels found',
  '加入频道': 'Join channel',
  '频道设置': 'Channel settings',
  '暂无消息，开始聊天吧！': 'No messages yet. Start chatting.',
  '输入消息...': 'Type a message...',
  '请先登录后发言': 'Sign in before sending messages',
  '正在打开频道': 'Opening channel',
  '正在恢复聊天内容...': 'Restoring chat content...',
  '选择频道': 'Choose channel',
  '从左侧边栏选择一个频道开始聊天，或创建一个新频道':
    'Choose a channel from the sidebar to start chatting, or create a new one.',
  '打开频道列表': 'Open channel list',
  '频道ID：3-20 位字母、数字、_ 或 -':
    'Channel ID: 3-20 letters, numbers, _ or -',
  '加入': 'Join',
  '加入中...': 'Joining...',
  '本地已有': 'Already local',
  '最近活跃': 'Recently active',
  '重命名频道': 'Rename channel',
  '输入备注名称': 'Enter a display name',
  '保存': 'Save',
  '保存中...': 'Saving...',
  '退出频道': 'Leave channel',
  '退出中...': 'Leaving...',
  '退出': 'Leave',
  '暂时没有在线种子': 'No online seeders right now',
  '暂时没有发现在线种子。请确认分享者或其他下载者仍在线做种。':
    'No online seeders were found. Confirm that the sharer or another downloader is still seeding.',
  '再次检测': 'Check again',
  '频道详情': 'Channel details',
  '显示 #地址后四位': 'Show #last four address characters',
  '频道 ID': 'Channel ID',
  '备注名称': 'Display name',
  '创建时间': 'Created at',
  '私密内容已加密': 'Private content is encrypted',
  '空白笔记': 'Blank note',
  '笔记不存在': 'Note not found',
  '请先登录 Web3 账号以解密此笔记':
    'Sign in with a Web3 account to decrypt this note',
  '无法解密，请确认当前 Web3 账号正确':
    'Unable to decrypt. Confirm the current Web3 account is correct.',
  '私密': 'Private',
  '公开': 'Public',
  '请输入笔记名称': 'Enter a note name',
  '笔记已保存': 'Note saved',
  '保存失败': 'Save failed',
  '新建笔记': 'New note',
  '笔记名称': 'Note name',
  '创建': 'Create',
  '笔记已创建': 'Note created',
  '创建失败': 'Create failed',
  '删除文件夹': 'Delete folder',
  '删除笔记': 'Delete note',
  '笔记列表': 'Note list',
  '搜索笔记': 'Search notes',
  '未找到笔记': 'No notes found',
  '还没有笔记': 'No notes yet',
  '文件夹': 'Folder',
  '新笔记': 'New note',
  '笔记编辑器': 'Note editor',
  '笔记阅读器': 'Note reader',
  '未命名笔记': 'Untitled note',
  '编辑模式': 'Edit mode',
  '阅读模式': 'Read mode',
  '编辑': 'Edit',
  '加载中...': 'Loading...',
  '没有打开的笔记': 'No note open',
  '选择一篇笔记继续': 'Choose a note to continue',
  '创建第一篇笔记': 'Create your first note',
  '打开笔记列表': 'Open note list',
  '处理中...': 'Processing...',
  '本地导入': 'Local import',
  '账号操作': 'Account actions',
  '确定要退出当前账号吗？': 'Sign out of the current account?',
  '退出登录': 'Sign out',
}

const enPatterns: Array<[RegExp, string]> = [
  [/^打开(.+)$/, 'Open {1}'],
  [/^进入 (.+)$/, 'Open {1}'],
  [/^(\d+) 天 (\d+) 小时$/, '{1} days {2} hours'],
  [/^(\d+) 小时 (\d+) 分钟$/, '{1} hours {2} minutes'],
  [/^(\d+) 分钟$/, '{1} minutes'],
  [/^错误：(.+)$/, 'Error: {1}'],
  [/^已选 (\d+) 项$/, 'Selected {1} items'],
  [/^已选 (\d+) 个项目$/, 'Selected {1} items'],
  [/^删除于 (.+)$/, 'Deleted on {1}'],
  [/^当前远程节点：(.+)$/, 'Current remote node: {1}'],
  [
    /^当前版本 (.+)，可切换 Cloudflare R2 或 GitHub Releases 下载。$/,
    'Current version {1}. You can switch between Cloudflare R2 and GitHub Releases.',
  ],
  [/^下载 (.+)$/, 'Download {1}'],
  [/^(.+) 已存在$/, '{1} already exists'],
  [/^(.+) 已在本机$/, '{1} is already on this device'],
  [/^(.+) 可下载$/, '{1} is available to download'],
  [/^(.+) 下载完成$/, '{1} download completed'],
  [/^发布失败: (.+)$/, 'Publish failed: {1}'],
  [/^下载失败: (.+)$/, 'Download failed: {1}'],
  [/^保存失败: (.+)$/, 'Save failed: {1}'],
  [/^(.+) 已添加到本地$/, '{1} added locally'],
  [/^(.+) 传输进度$/, '{1} transfer progress'],
  [/^目标位置：(.+)$/, 'Target location: {1}'],
  [/^重新测试 (.+)$/, 'Retest {1}'],
  [/^派生 (\d+) 个地址$/, 'Derive {1} addresses'],
  [/^私钥（点击(.+)）$/, 'Private key (click to {1})'],
  [/^频道名至少 (\d+) 个字符$/, 'Channel names must be at least {1} characters'],
  [/^频道名最多 (\d+) 个字符$/, 'Channel names can be at most {1} characters'],
  [/^备注名称最多 (\d+) 个字符$/, 'Display names can be at most {1} characters'],
  [/^(.+) 已发布$/, '{1} published'],
  [/^ · 在线 (\d+)$/, ' · {1} online'],
  [/^群成员 \((\d+)\)$/, 'Members ({1})'],
  [/^(\d+) 篇$/, '{1} notes'],
  [/^确定要删除「(.+)」吗？此操作不可撤销。$/, 'Delete "{1}"? This cannot be undone.'],
  [/^确定要退出频道 "(.+)" 吗？$/, 'Leave channel "{1}"?'],
  [
    /^确定清除用户 (.+) 的文件记录和回收站吗？无人引用的副本也会被清理。$/,
    'Clear file records and trash for user {1}? Unreferenced copies will also be cleaned up.',
  ],
  [/^等待 (.+)$/, 'Waiting for {1}'],
  [/^(.+) 赢得 (.+) 筹码$/, '{1} wins {2} chips'],
  [/^(.+) 筹码$/, '{1} chips'],
  [/^当前注 (.+)$/, 'Current bet {1}'],
  [/^加 (.+)$/, 'Add {1}'],
  [/^(.+) 胜出$/, '{1} wins'],
]

let currentLocale: Locale = DEFAULT_LOCALE
let translatingDocument = false
let translationScheduled = false
let observer: MutationObserver | null = null
let originalTitle = ''
const localeListeners = new Set<() => void>()
const textOriginals = new WeakMap<Text, string>()
const attributeOriginals = new WeakMap<Element, Map<string, string>>()

function isLocale(value: unknown): value is Locale {
  return value === 'zh-CN' || value === 'en'
}

function readStoredLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return isLocale(stored) ? stored : DEFAULT_LOCALE
  } catch {
    return DEFAULT_LOCALE
  }
}

function emitLocaleChange() {
  for (const listener of localeListeners) listener()
}

function applyDocumentLocale(locale: Locale) {
  if (typeof document === 'undefined') return
  document.documentElement.lang = locale === 'en' ? 'en' : 'zh-CN'
  document.documentElement.dataset.locale = locale
}

export function getLocale() {
  return currentLocale
}

export function getLocaleName(locale: Locale) {
  return localeNames[locale]
}

export function getNextLocale(locale = currentLocale): Locale {
  return locale === 'zh-CN' ? 'en' : 'zh-CN'
}

export function initializeLocale() {
  const nextLocale = readStoredLocale()
  if (nextLocale !== currentLocale) {
    currentLocale = nextLocale
    emitLocaleChange()
  }
  applyDocumentLocale(currentLocale)
}

export function setLocale(locale: Locale) {
  if (!isLocale(locale)) return
  currentLocale = locale
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, locale)
    } catch {
      // Ignore storage failures; the active session still switches language.
    }
  }
  applyDocumentLocale(locale)
  emitLocaleChange()
  translateDocument(locale)
}

function subscribeLocale(listener: () => void) {
  localeListeners.add(listener)
  if (typeof window !== 'undefined') {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return
      const nextLocale = isLocale(event.newValue)
        ? event.newValue
        : DEFAULT_LOCALE
      if (nextLocale === currentLocale) return
      currentLocale = nextLocale
      applyDocumentLocale(nextLocale)
      emitLocaleChange()
      translateDocument(nextLocale)
    }
    window.addEventListener('storage', handleStorage)
    return () => {
      localeListeners.delete(listener)
      window.removeEventListener('storage', handleStorage)
    }
  }
  return () => {
    localeListeners.delete(listener)
  }
}

function interpolate(template: string, params?: TranslationParams) {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    params[key] === undefined ? `{${key}}` : String(params[key])
  )
}

function applyPattern(template: string, matches: RegExpMatchArray) {
  return template.replace(/\{(\d+)\}/g, (_, index) => {
    const value = matches[Number(index)] || ''
    return translateText(value, 'en')
  })
}

function preserveOuterWhitespace(input: string, output: string) {
  const match = input.match(/^(\s*)([\s\S]*?)(\s*)$/)
  if (!match) return output
  return `${match[1]}${output}${match[3]}`
}

export function translateText(
  input: string,
  locale = currentLocale,
  params?: TranslationParams
) {
  if (typeof input !== 'string' || locale === DEFAULT_LOCALE) {
    return interpolate(input, params)
  }

  const trimmed = input.trim()
  if (!trimmed) return input

  const exact = enText[trimmed]
  if (exact) return preserveOuterWhitespace(input, interpolate(exact, params))

  for (const [pattern, template] of enPatterns) {
    const matches = trimmed.match(pattern)
    if (matches) {
      return preserveOuterWhitespace(input, applyPattern(template, matches))
    }
  }

  return interpolate(input, params)
}

export function useLocale() {
  return useSyncExternalStore(subscribeLocale, getLocale, () => DEFAULT_LOCALE)
}

export function useI18n() {
  const locale = useLocale()
  return useMemo(
    () => ({
      locale,
      nextLocale: getNextLocale(locale),
      localeName: getLocaleName(locale),
      nextLocaleName: getLocaleName(getNextLocale(locale)),
      setLocale,
      t: (text: string, params?: TranslationParams) =>
        translateText(text, locale, params),
    }),
    [locale]
  )
}

function shouldSkipTextNode(node: Node) {
  const parent = node.parentElement
  return !parent || Boolean(parent.closest(SKIP_TEXT_SELECTOR))
}

function shouldSkipAttributeNode(element: Element) {
  return Boolean(element.closest(SKIP_ATTRIBUTE_SELECTOR))
}

function translateNodeText(node: Text, locale: Locale) {
  const current = node.nodeValue || ''
  if (!current.trim() || shouldSkipTextNode(node)) return

  const stored = textOriginals.get(node)

  if (locale === DEFAULT_LOCALE) {
    if (stored && current === translateText(stored, 'en')) {
      node.nodeValue = stored
    } else {
      textOriginals.set(node, current)
    }
    return
  }

  const expected = stored ? translateText(stored, locale) : ''
  const original = stored && current === expected ? stored : current
  textOriginals.set(node, original)

  const next = translateText(original, locale)
  if (current !== next) node.nodeValue = next
}

function getAttributeOriginals(element: Element) {
  let originals = attributeOriginals.get(element)
  if (!originals) {
    originals = new Map()
    attributeOriginals.set(element, originals)
  }
  return originals
}

function translateElementAttributes(element: Element, locale: Locale) {
  if (shouldSkipAttributeNode(element)) return
  const originals = getAttributeOriginals(element)
  for (const attribute of TRANSLATABLE_ATTRIBUTES) {
    const current = element.getAttribute(attribute)
    if (!current?.trim()) continue
    const stored = originals.get(attribute)

    if (locale === DEFAULT_LOCALE) {
      if (stored && current === translateText(stored, 'en')) {
        element.setAttribute(attribute, stored)
      } else {
        originals.set(attribute, current)
      }
      continue
    }

    const expected = stored ? translateText(stored, locale) : ''
    const original = stored && current === expected ? stored : current
    originals.set(attribute, original)
    const next = translateText(original, locale)
    if (current !== next) element.setAttribute(attribute, next)
  }
}

function translateDocumentTitle(locale: Locale) {
  if (typeof document === 'undefined') return
  const current = document.title

  if (locale === DEFAULT_LOCALE) {
    if (originalTitle && current === translateText(originalTitle, 'en')) {
      document.title = originalTitle
    } else {
      originalTitle = current
    }
    return
  }

  const expected = originalTitle ? translateText(originalTitle, locale) : ''
  const source = originalTitle && current === expected ? originalTitle : current
  originalTitle = source
  const next = translateText(source, locale)
  if (current !== next) document.title = next
}

export function translateDocument(locale = currentLocale) {
  if (typeof document === 'undefined' || translatingDocument) return
  translatingDocument = true
  try {
    applyDocumentLocale(locale)
    translateDocumentTitle(locale)
    const body = document.body
    if (!body) return

    const textWalker = document.createTreeWalker(
      body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          return shouldSkipTextNode(node)
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT
        },
      }
    )

    let textNode = textWalker.nextNode()
    while (textNode) {
      translateNodeText(textNode as Text, locale)
      textNode = textWalker.nextNode()
    }

    const selector = TRANSLATABLE_ATTRIBUTES.map(
      attribute => `[${attribute}]`
    ).join(',')
    const elements = body.querySelectorAll(selector)
    elements.forEach(element => translateElementAttributes(element, locale))
  } finally {
    translatingDocument = false
  }
}

function scheduleDocumentTranslation() {
  if (translationScheduled || translatingDocument) return
  translationScheduled = true
  window.requestAnimationFrame(() => {
    translationScheduled = false
    translateDocument(currentLocale)
  })
}

export function startLocaleDomSync() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {}
  }

  translateDocument(currentLocale)

  if (observer) return () => {}
  observer = new MutationObserver(() => {
    scheduleDocumentTranslation()
  })
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: TRANSLATABLE_ATTRIBUTES,
  })

  return () => {
    observer?.disconnect()
    observer = null
  }
}
