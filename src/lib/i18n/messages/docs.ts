export const zhCNDocsMessages = {
  'docs.meta.title': '开发者文档 · Most.Box',
  'docs.meta.desc':
    'MostBox MCP 接入指南与 Node Daemon OpenAPI 交互式接口参考。',
  'docs.hero.kicker': '开发者文档',
  'docs.hero.title': '连接 MostBox 节点',
  'docs.hero.desc':
    '为 AI 客户端配置受控 MCP 权限，或通过完整的 OpenAPI 合同检查和调用 daemon。',
  'docs.tabs.label': '文档类型',
  'docs.tabs.mcp': 'MCP 接入',
  'docs.tabs.openapi': 'OpenAPI 参考',
  'docs.toc.label': '本页目录',
  'docs.mcp.overview': '开始使用',
  'docs.mcp.overview.desc':
    '先启动 MostBox daemon，再用当前身份在管理台创建独立凭证。每个凭证都有自己的 scope、有效期和允许发布目录。',
  'docs.mcp.openAdmin': '打开 MCP 客户端管理',
  'docs.mcp.transports': '连接方式',
  'docs.mcp.http.title': 'Streamable HTTP',
  'docs.mcp.http.desc':
    '适合 Codex、VS Code 等支持远程 MCP URL 的客户端。端点只接受本机回环请求。',
  'docs.mcp.stdio.title': 'stdio',
  'docs.mcp.stdio.desc':
    '适合 Claude Desktop 等进程型客户端。命令只连接已经运行的 daemon，不会启动第二个 P2P 引擎。',
  'docs.mcp.clients': '客户端配置',
  'docs.mcp.clients.desc':
    '令牌只在创建时显示一次。使用环境变量或客户端的密码输入，避免把令牌写进仓库。',
  'docs.mcp.codex': 'Codex',
  'docs.mcp.claude': 'Claude Desktop',
  'docs.mcp.vscode': 'VS Code',
  'docs.mcp.capabilities': '权限与能力',
  'docs.mcp.capabilities.desc':
    '客户端只能发现凭证 scope 允许的 resources 和 tools。发布权限还受允许目录约束。',
  'docs.mcp.scopes': 'Scopes',
  'docs.mcp.scope': 'Scope',
  'docs.mcp.grants': '授予能力',
  'docs.mcp.scope.nodeRead': '读取节点状态、容量、网络与 holding',
  'docs.mcp.scope.filesRead': '读取文件元数据、下载任务并检查分享链接',
  'docs.mcp.scope.filesPublish': '发布允许目录中的 daemon 主机文件',
  'docs.mcp.scope.filesDownload': '发起 CID 校验下载并在成功后自动做种',
  'docs.mcp.scope.downloadsCancel': '取消当前用户的活动下载任务',
  'docs.mcp.resources': 'Resources',
  'docs.mcp.uri': 'URI',
  'docs.mcp.content': '内容',
  'docs.mcp.resource.node': '节点、网络、容量与做种摘要',
  'docs.mcp.resource.files': '当前用户文件元数据',
  'docs.mcp.resource.holdings': '本机完整 CID 副本和 topic 状态',
  'docs.mcp.resource.downloads': '当前用户活动下载任务',
  'docs.mcp.tools': 'Tools',
  'docs.mcp.tool': 'Tool',
  'docs.mcp.behavior': '行为',
  'docs.mcp.tool.nodeStatus': '读取节点、网络、容量与做种状态',
  'docs.mcp.tool.listFiles': '分页列出当前用户文件元数据',
  'docs.mcp.tool.listHoldings': '分页列出本机完整副本',
  'docs.mcp.tool.checkDownload': '检查 most:// 链接和在线可用性',
  'docs.mcp.tool.getShareLink': '按文件 CID 返回规范分享链接',
  'docs.mcp.tool.listDownloads': '列出活动下载任务',
  'docs.mcp.tool.publish': '发布授权目录中的本机文件',
  'docs.mcp.tool.download': '下载、校验并自动做种',
  'docs.mcp.tool.cancel': '取消当前用户的下载任务',
  'docs.mcp.security': '安全边界',
  'docs.mcp.security.loopback':
    'HTTP MCP 只接受回环请求；远程节点应先通过 SSH 隧道映射到本机。',
  'docs.mcp.security.token':
    '令牌绑定用户、scope 和有效期，撤销或删除后已有连接也不能继续调用。',
  'docs.mcp.security.roots':
    '发布路径必须是允许目录内的普通文件；符号链接逃逸、目录和特殊文件会被拒绝。',
  'docs.mcp.security.cid':
    '下载仍会重算 UnixFS CID v1；只有与链接一致的内容才会保存并自动做种。',
  'docs.mcp.security.content':
    'Resources 只返回有界结构化元数据，不把任意大文件内容送入模型上下文。',
  'docs.mcp.troubleshooting': '常见问题',
  'docs.mcp.problem.daemon': '无法连接 daemon',
  'docs.mcp.problem.daemon.desc':
    '确认 daemon 正在运行，并访问 http://127.0.0.1:1976/api/node/status 检查状态。',
  'docs.mcp.problem.token': '令牌无效或已过期',
  'docs.mcp.problem.token.desc':
    '在管理台检查凭证状态。明文令牌无法再次查看，需要删除旧凭证并创建新凭证。',
  'docs.mcp.problem.scope': '工具没有出现',
  'docs.mcp.problem.scope.desc':
    '工具列表按 scope 生成。为客户端创建包含所需 scope 的新凭证。',
  'docs.mcp.problem.path': '文件发布被拒绝',
  'docs.mcp.problem.path.desc':
    '确认路径位于 files:publish 凭证的允许目录内，而且目标是 daemon 主机上的普通文件。',
  'docs.openapi.title': 'Node Daemon API',
  'docs.openapi.desc':
    '下面的接口参考直接使用与 /api/openapi.json 相同的 OpenAPI 3.1 合同。阅读不需要 daemon 在线，发起请求时才需要连接。',
  'docs.openapi.target': '当前请求目标',
  'docs.openapi.auth.title': '请求鉴权',
  'docs.openapi.auth.signature':
    '用户接口会使用当前已登录的 MostBox 身份，为每个 method 与 path 自动生成动态签名。',
  'docs.openapi.auth.bearer':
    'MCP API 需要在查看器的认证控件中输入 Bearer token；页面不会持久化该令牌。',
  'docs.openapi.auth.invite':
    '连接远程节点时会复用已配置的 x-mostbox-invite；远程管理接口仍会被 daemon 拒绝。',
  'docs.openapi.warning':
    '写操作会改变本机状态。带高风险标记的请求在真正发送前还会再次确认。',
  'docs.openapi.loading': '正在加载 API 参考…',
  'docs.openapi.confirm.title': '确认发送高风险请求',
  'docs.openapi.confirm.message':
    '将发送 {method} {path}。此操作可能无法撤销。',
  'docs.openapi.confirm.action': '发送请求',
  'docs.nav.openMcp': '查看 MCP 文档',
} as const

export const zhTWDocsMessages = {
  'docs.meta.title': '開發者文件 · Most.Box',
  'docs.meta.desc':
    'MostBox MCP 接入指南與 Node Daemon OpenAPI 互動式介面參考。',
  'docs.hero.kicker': '開發者文件',
  'docs.hero.title': '連接 MostBox 節點',
  'docs.hero.desc':
    '為 AI 用戶端設定受控 MCP 權限，或透過完整的 OpenAPI 合約檢查和呼叫 daemon。',
  'docs.tabs.label': '文件類型',
  'docs.tabs.mcp': 'MCP 接入',
  'docs.tabs.openapi': 'OpenAPI 參考',
  'docs.toc.label': '本頁目錄',
  'docs.mcp.overview': '開始使用',
  'docs.mcp.overview.desc':
    '先啟動 MostBox daemon，再用目前身分在管理後台建立獨立憑證。每個憑證都有自己的 scope、有效期和允許發佈目錄。',
  'docs.mcp.openAdmin': '開啟 MCP 用戶端管理',
  'docs.mcp.transports': '連接方式',
  'docs.mcp.http.title': 'Streamable HTTP',
  'docs.mcp.http.desc':
    '適合 Codex、VS Code 等支援遠端 MCP URL 的用戶端。端點只接受本機回環請求。',
  'docs.mcp.stdio.title': 'stdio',
  'docs.mcp.stdio.desc':
    '適合 Claude Desktop 等程序型用戶端。命令只連接已執行的 daemon，不會啟動第二個 P2P 引擎。',
  'docs.mcp.clients': '用戶端設定',
  'docs.mcp.clients.desc':
    '權杖只在建立時顯示一次。使用環境變數或用戶端的密碼輸入，避免把權杖寫進儲存庫。',
  'docs.mcp.codex': 'Codex',
  'docs.mcp.claude': 'Claude Desktop',
  'docs.mcp.vscode': 'VS Code',
  'docs.mcp.capabilities': '權限與能力',
  'docs.mcp.capabilities.desc':
    '用戶端只能發現憑證 scope 允許的 resources 和 tools。發佈權限還受允許目錄約束。',
  'docs.mcp.scopes': 'Scopes',
  'docs.mcp.scope': 'Scope',
  'docs.mcp.grants': '授予能力',
  'docs.mcp.scope.nodeRead': '讀取節點狀態、容量、網路與 holding',
  'docs.mcp.scope.filesRead': '讀取檔案中繼資料、下載任務並檢查分享連結',
  'docs.mcp.scope.filesPublish': '發佈允許目錄中的 daemon 主機檔案',
  'docs.mcp.scope.filesDownload': '發起 CID 校驗下載並在成功後自動做種',
  'docs.mcp.scope.downloadsCancel': '取消目前使用者的活動下載任務',
  'docs.mcp.resources': 'Resources',
  'docs.mcp.uri': 'URI',
  'docs.mcp.content': '內容',
  'docs.mcp.resource.node': '節點、網路、容量與做種摘要',
  'docs.mcp.resource.files': '目前使用者檔案中繼資料',
  'docs.mcp.resource.holdings': '本機完整 CID 副本和 topic 狀態',
  'docs.mcp.resource.downloads': '目前使用者活動下載任務',
  'docs.mcp.tools': 'Tools',
  'docs.mcp.tool': 'Tool',
  'docs.mcp.behavior': '行為',
  'docs.mcp.tool.nodeStatus': '讀取節點、網路、容量與做種狀態',
  'docs.mcp.tool.listFiles': '分頁列出目前使用者檔案中繼資料',
  'docs.mcp.tool.listHoldings': '分頁列出本機完整副本',
  'docs.mcp.tool.checkDownload': '檢查 most:// 連結和線上可用性',
  'docs.mcp.tool.getShareLink': '按檔案 CID 返回標準分享連結',
  'docs.mcp.tool.listDownloads': '列出活動下載任務',
  'docs.mcp.tool.publish': '發佈授權目錄中的本機檔案',
  'docs.mcp.tool.download': '下載、校驗並自動做種',
  'docs.mcp.tool.cancel': '取消目前使用者的下載任務',
  'docs.mcp.security': '安全邊界',
  'docs.mcp.security.loopback':
    'HTTP MCP 只接受回環請求；遠端節點應先透過 SSH 通道映射到本機。',
  'docs.mcp.security.token':
    '權杖綁定使用者、scope 和有效期，撤銷或刪除後既有連接也不能繼續呼叫。',
  'docs.mcp.security.roots':
    '發佈路徑必須是允許目錄內的一般檔案；符號連結逃逸、目錄和特殊檔案會被拒絕。',
  'docs.mcp.security.cid':
    '下載仍會重算 UnixFS CID v1；只有與連結一致的內容才會儲存並自動做種。',
  'docs.mcp.security.content':
    'Resources 只返回有界結構化中繼資料，不把任意大檔案內容送入模型上下文。',
  'docs.mcp.troubleshooting': '常見問題',
  'docs.mcp.problem.daemon': '無法連接 daemon',
  'docs.mcp.problem.daemon.desc':
    '確認 daemon 正在執行，並存取 http://127.0.0.1:1976/api/node/status 檢查狀態。',
  'docs.mcp.problem.token': '權杖無效或已過期',
  'docs.mcp.problem.token.desc':
    '在管理後台檢查憑證狀態。明文權杖無法再次查看，需要刪除舊憑證並建立新憑證。',
  'docs.mcp.problem.scope': '工具沒有出現',
  'docs.mcp.problem.scope.desc':
    '工具清單按 scope 產生。為用戶端建立包含所需 scope 的新憑證。',
  'docs.mcp.problem.path': '檔案發佈被拒絕',
  'docs.mcp.problem.path.desc':
    '確認路徑位於 files:publish 憑證的允許目錄內，而且目標是 daemon 主機上的一般檔案。',
  'docs.openapi.title': 'Node Daemon API',
  'docs.openapi.desc':
    '下方介面參考直接使用與 /api/openapi.json 相同的 OpenAPI 3.1 合約。閱讀不需要 daemon 上線，發起請求時才需要連接。',
  'docs.openapi.target': '目前請求目標',
  'docs.openapi.auth.title': '請求驗證',
  'docs.openapi.auth.signature':
    '使用者介面會使用目前已登入的 MostBox 身分，為每個 method 與 path 自動產生動態簽章。',
  'docs.openapi.auth.bearer':
    'MCP API 需要在檢視器的驗證控制中輸入 Bearer token；頁面不會持久化該權杖。',
  'docs.openapi.auth.invite':
    '連接遠端節點時會重用已設定的 x-mostbox-invite；遠端管理介面仍會被 daemon 拒絕。',
  'docs.openapi.warning':
    '寫入操作會改變本機狀態。帶高風險標記的請求在真正傳送前還會再次確認。',
  'docs.openapi.loading': '正在載入 API 參考…',
  'docs.openapi.confirm.title': '確認傳送高風險請求',
  'docs.openapi.confirm.message':
    '將傳送 {method} {path}。此操作可能無法復原。',
  'docs.openapi.confirm.action': '傳送請求',
  'docs.nav.openMcp': '查看 MCP 文件',
} satisfies Record<keyof typeof zhCNDocsMessages, string>

export const enDocsMessages = {
  'docs.meta.title': 'Developer docs · Most.Box',
  'docs.meta.desc':
    'MostBox MCP setup and interactive Node Daemon OpenAPI reference.',
  'docs.hero.kicker': 'Developer documentation',
  'docs.hero.title': 'Connect to a MostBox node',
  'docs.hero.desc':
    'Give AI clients controlled MCP access, or inspect and call the daemon through its complete OpenAPI contract.',
  'docs.tabs.label': 'Documentation type',
  'docs.tabs.mcp': 'MCP setup',
  'docs.tabs.openapi': 'OpenAPI reference',
  'docs.toc.label': 'On this page',
  'docs.mcp.overview': 'Get started',
  'docs.mcp.overview.desc':
    'Start the MostBox daemon, then create a dedicated credential with your current identity in node administration. Every credential has its own scopes, expiry, and allowed publish directories.',
  'docs.mcp.openAdmin': 'Open MCP client administration',
  'docs.mcp.transports': 'Connection options',
  'docs.mcp.http.title': 'Streamable HTTP',
  'docs.mcp.http.desc':
    'For clients such as Codex and VS Code that accept a remote MCP URL. The endpoint only accepts loopback requests.',
  'docs.mcp.stdio.title': 'stdio',
  'docs.mcp.stdio.desc':
    'For process-based clients such as Claude Desktop. The command connects to the running daemon and never starts a second P2P engine.',
  'docs.mcp.clients': 'Client configuration',
  'docs.mcp.clients.desc':
    'The token is shown only once. Use an environment variable or password input so it is never committed to a repository.',
  'docs.mcp.codex': 'Codex',
  'docs.mcp.claude': 'Claude Desktop',
  'docs.mcp.vscode': 'VS Code',
  'docs.mcp.capabilities': 'Permissions and capabilities',
  'docs.mcp.capabilities.desc':
    'Clients only discover resources and tools allowed by their credential scopes. Publishing is also restricted to allowed directories.',
  'docs.mcp.scopes': 'Scopes',
  'docs.mcp.scope': 'Scope',
  'docs.mcp.grants': 'Granted capability',
  'docs.mcp.scope.nodeRead':
    'Read node status, capacity, network, and holdings',
  'docs.mcp.scope.filesRead':
    'Read file metadata and downloads, and inspect share links',
  'docs.mcp.scope.filesPublish':
    'Publish daemon-host files from allowed directories',
  'docs.mcp.scope.filesDownload':
    'Start CID-verified downloads and seed successful content',
  'docs.mcp.scope.downloadsCancel':
    'Cancel active downloads owned by the current user',
  'docs.mcp.resources': 'Resources',
  'docs.mcp.uri': 'URI',
  'docs.mcp.content': 'Content',
  'docs.mcp.resource.node': 'Node, network, capacity, and seeding summary',
  'docs.mcp.resource.files': 'Current user file metadata',
  'docs.mcp.resource.holdings': 'Complete local CID replicas and topic state',
  'docs.mcp.resource.downloads': 'Current user active download tasks',
  'docs.mcp.tools': 'Tools',
  'docs.mcp.tool': 'Tool',
  'docs.mcp.behavior': 'Behavior',
  'docs.mcp.tool.nodeStatus': 'Read node, network, capacity, and seeding state',
  'docs.mcp.tool.listFiles': 'Page through current user file metadata',
  'docs.mcp.tool.listHoldings': 'Page through complete local replicas',
  'docs.mcp.tool.checkDownload': 'Check a most:// link and online availability',
  'docs.mcp.tool.getShareLink':
    'Return the canonical share link for a file CID',
  'docs.mcp.tool.listDownloads': 'List active download tasks',
  'docs.mcp.tool.publish': 'Publish a local file from an allowed directory',
  'docs.mcp.tool.download': 'Download, verify, and seed content',
  'docs.mcp.tool.cancel': 'Cancel a current user download task',
  'docs.mcp.security': 'Security boundaries',
  'docs.mcp.security.loopback':
    'HTTP MCP only accepts loopback requests. Tunnel a remote node to localhost through SSH first.',
  'docs.mcp.security.token':
    'Tokens are bound to a user, scopes, and expiry. Revoking or deleting one also blocks existing connections.',
  'docs.mcp.security.roots':
    'Publish paths must be regular files under an allowed directory. Symlink escapes, directories, and special files are rejected.',
  'docs.mcp.security.cid':
    'Downloads still recalculate UnixFS CID v1. Only content matching the link is saved and seeded.',
  'docs.mcp.security.content':
    'Resources return bounded structured metadata and never place arbitrary large file content in model context.',
  'docs.mcp.troubleshooting': 'Troubleshooting',
  'docs.mcp.problem.daemon': 'Cannot connect to the daemon',
  'docs.mcp.problem.daemon.desc':
    'Confirm the daemon is running, then open http://127.0.0.1:1976/api/node/status to check it.',
  'docs.mcp.problem.token': 'Token is invalid or expired',
  'docs.mcp.problem.token.desc':
    'Check the credential state in administration. Plaintext tokens cannot be shown again, so delete the old credential and create a new one.',
  'docs.mcp.problem.scope': 'A tool is missing',
  'docs.mcp.problem.scope.desc':
    'The tool list is generated from scopes. Create a new client credential containing the required scope.',
  'docs.mcp.problem.path': 'File publishing is rejected',
  'docs.mcp.problem.path.desc':
    'Confirm the path is inside an allowed directory for the files:publish credential and is a regular file on the daemon host.',
  'docs.openapi.title': 'Node Daemon API',
  'docs.openapi.desc':
    'The reference below uses the same OpenAPI 3.1 contract as /api/openapi.json. It remains readable offline; only Try it requires a daemon connection.',
  'docs.openapi.target': 'Current request target',
  'docs.openapi.auth.title': 'Request authentication',
  'docs.openapi.auth.signature':
    'User APIs use the signed-in MostBox identity to generate a fresh signature for every method and path.',
  'docs.openapi.auth.bearer':
    'MCP APIs require a Bearer token in the reference authentication control. The page never persists that token.',
  'docs.openapi.auth.invite':
    'Configured x-mostbox-invite credentials are reused for remote nodes. The daemon still rejects remote administration APIs.',
  'docs.openapi.warning':
    'Write operations change local state. Requests marked as high risk require another confirmation before transmission.',
  'docs.openapi.loading': 'Loading API reference…',
  'docs.openapi.confirm.title': 'Confirm high-risk request',
  'docs.openapi.confirm.message':
    'Send {method} {path}? This operation may not be reversible.',
  'docs.openapi.confirm.action': 'Send request',
  'docs.nav.openMcp': 'View MCP documentation',
} satisfies Record<keyof typeof zhCNDocsMessages, string>
