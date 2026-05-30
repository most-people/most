## Shell Preference

- On Windows, default to Git Bash for local shell commands.
- Preferred executable: `C:\Program Files\Git\bin\bash.exe`.
- If `bash` is not on PATH or the tool default shell is PowerShell, invoke commands through `& 'C:\Program Files\Git\bin\bash.exe' -lc '<command>'`.
- Use PowerShell only for Windows-specific tasks or when Git Bash cannot run the command.

---

## AI 行为准则

- 默认使用中文回复。
- 先明确目标和成功标准；不确定时说明歧义并提问。
- 简洁优先：只实现当前需求，不添加推测性功能、兼容分支或多余抽象。
- 精准修改：只改和任务直接相关的代码，不顺手重构、不清理无关代码。
- 目标驱动执行：多步任务先写简短计划，并说明每步如何验证。
- 新项目优先清晰正确：可以直接调整接口、数据结构和持久化格式；除非用户要求，不保留旧格式迁移。

---

# Most.Box

Most.Box 是一个 P2P 文件分享与做种工具：用户发布文件得到 `most://` 分享链接，其他人凭链接下载并校验；下载完成的人默认继续做种，让文件像 BitTorrent / 磁力链接一样传播。

它不是云盘、备份服务或付费存储市场。用户需要自己保存好重要数据；MostBox 只帮助在线用户把文件传播出去，并在仍有种子在线时让其他人下载。

Web3 产品入口和以太坊钱包工具保留为独立工具箱，不参与 MostBox 文件分享、下载或做种主流程。

## 计划文档

完整产品计划在 `docs/plan/`，入口是 `docs/plan/README.md`。不要在每次任务开始时通读全部计划；只在需求涉及相关主题时按需打开。

| 需求类型                               | 优先阅读                            |
| -------------------------------------- | ----------------------------------- |
| 当前任务板、优先级、验收顺序           | `docs/plan/任务优先级与周计划.md`   |
| MVP 范围、完成定义、验收剧本           | `docs/plan/MVP落地计划.md`          |
| MVP 后里程碑和 v1 边界                 | `docs/plan/实施路线图.md`           |
| 产品定位、价值、风险和竞品             | `docs/plan/项目计划书.md`           |
| 分层、核心模块、实现和后置能力         | `docs/plan/技术架构.md`             |
| CID、发布、下载、holding、数据目录入口 | `docs/plan/协议基线实现入口清单.md` |
| daemon、管理台、配置、安全和排障       | `docs/plan/节点运营.md`             |
| 默认公开分享、私密文件自加密           | `docs/plan/加密与存储.md`           |

## 当前 MVP 口径

首版只验证一个闭环：

```
CID
  → most:// 分享链接
  → 发布者按 CID topic 做种
  → 下载者凭链接下载并重算 CID 校验
  → 下载者默认持续做种
  → 发布者退出后，只要还有下载者在线即可继续传播
```

MVP 成功标准：

- 发布者在线时，下载者能凭 `most://` 链接发现 peer、下载文件并通过 CID 校验。
- 下载完成后，本机默认把该文件加入做种列表，应用/daemon 重启后自动重新 join 对应 CID topic。
- 发布者退出后，只要至少一个下载者仍在线做种，新下载者仍能完成下载并校验。
- 用户能看到本机正在做种的 CID、文件大小、topic join 状态和基础日志。

## 产品与协议不变量

- `most://<cid>?filename=...` 是 MostBox 原生分享链接；本轮不改成 `magnet:`，也不做双格式。
- CID 即权限：知道链接的人即可尝试下载；CID 或链接泄露不是漏洞。
- MostBox 不承诺永久保存或离线可用；可用性来自当前在线种子数量。
- 发布成功和下载成功后默认持续做种，除非用户暂停、删除文件或关闭应用。
- 文件模型是完整副本：不做分片、不做纠删码；每个做种 peer 持有完整文件。
- Hyperswarm topic 使用 `cid.multihash.digest`，不要额外 hash、截断或换 topic 规则。
- Hyperdrive 只存文件内容，key 固定为 `/<cid>`；用户可见路径和文件名不进入 Hyperdrive。
- 用户文件列表和目录结构由 `published-files.json` 维护；做种持有记录由 `node-holdings.json` 维护，避免污染用户文件管理视图。
- 不实现上链存储协议、智能合约、USDT 支付、质押、订单、赏金猎人、fraud proof、Treasury 或云端下单。

## 技术栈

- 前端：React 19, Next.js 16, TypeScript, Zustand, Lucide React
- 后端：Hono, `@hono/node-server`, WebSocket
- P2P：Hyperswarm 4.x, Hyperdrive 13.x, Corestore 7.x
- Web3 工具箱：ethers.js
- 桌面：Electron 41, electron-builder
- 测试：Node.js built-in test runner

## 核心实现约束

- CID 使用 UnixFS CID v1，当前由 `server/src/core/cid.js` 和 `ipfs-unixfs-importer@16.1.5` 生成。
- CID 显式参数：`cidVersion: 1`、`rawLeaves: true`、`wrapWithDirectory: false`；升级 importer 前必须跑 CID 黄金样本测试。
- 下载完成后必须重算 UnixFS CID v1，只有 CID 与链接一致才保存并做种。
- 下载只接受 Hyperdrive 中精确的 `/<cid>` 文件；下载完成后写入 Hyperdrive 并记录 holding，让下载者自动成为新的种子。
- 节点配置保留 `maxFileSizeBytes`、`capacityBytes` 和数据目录；发布或下载成功后固定自动做种，不提供关闭开关、产品层同时做种上限或应用层限速。
- 节点/做种能力 API 优先：HTTP API + WebSocket + OpenAPI 是稳定入口；Web 管理台给人用；薄 CLI 只做安装、启动、诊断。

## 常用命令

```bash
npm run dev            # Next.js，端口 3000
node server/index.js   # 后端，默认端口 1976
npm start              # 构建静态 out/ 并由后端 serve
npm test
npm run test:unit
npm run test:protocol
npm run lint
```

## 验证策略

- 改 CID、发布、下载、链接解析、P2P pull 时，优先跑 `npm run test:protocol`。
- 改后端核心逻辑时，跑相关 `node --test server/tests/...`；范围较大时跑 `npm test`。
- 改前端结构或样式时，跑 `npm run lint`，必要时启动前后端手动验证。
- 涉及 MVP 主线时，用“发布者退出后，下载者种子仍可继续传播并校验”作为最高验收场景。
- Web3 工具箱保留独立测试；不要把钱包作为文件分享前置条件。

## 代码约定

- 使用 ESM；本地导入带 `.js` 扩展名。
- 2 空格缩进、单引号、默认不写分号。
- 命名：组件 / 类 `PascalCase`，函数 / 变量 `camelCase`，常量 `UPPER_SNAKE_CASE`，私有字段 `#field`。
- TypeScript 避免 `any`，组件 Props 使用 `{ComponentName}Props`。
- 全局 Zustand 状态在 `app/app/useAppStore.ts`，组件通过 action 修改状态。
- 错误类在 `server/src/utils/errors.js`；P2P 网络噪声错误可静默处理。
- 测试使用 `node:test` 和 `node:assert`，测试文件命名 `*.test.js`。

## 前端样式

- 全部使用 CSS class，禁止组件内联 `style={{}}`。
- 全局变量和基础组件类在 `app/globals.css`；页面样式放到 `styles/{模块}.css` 并由对应 layout 引入。
- 按钮和输入框复用全局 `.btn` / `.input` 及其变体，不在页面 CSS 重复定义。
- 图标统一使用 `lucide-react`；品牌 Logo 等自定义图标放在 `components/icons/`。
- `ModalOverlay` 是唯一弹窗玻璃容器提供者；弹窗 CSS 不重复定义容器的 width、padding、background、blur、border、shadow、radius。

## P2P / 聊天注意点

- Hyperswarm 4.x 中 `conn` 直接作为流使用，不要调用 `conn.openStream()`。
- Channel append 监听用 `lastCoreLength` 只处理新消息，避免重复推旧消息。
- 双方都拥有频道时，通过 `store.namespace(\`channel-${name}\`).replicate(conn)` 复制。
- WebSocket 订阅要等 `peerId` 就绪；未就绪时暂存频道名，随后补发订阅。

## 关键入口

- 前端主应用：`app/app/page.tsx`、`components/AppHomeMode.tsx`
- Web3 工具箱：`app/web3/page.tsx`
- 笔记模块：`app/note/page.tsx`、`components/MilkdownEditor.tsx`
- 管理后台：`app/admin/page.tsx`、`app/admin/layout.tsx`
- 全局状态：`app/app/useAppStore.ts`
- 后端入口：`server/index.js`
- 核心引擎：`server/src/index.js`
- 做种配置：`server/src/node/config.js`
- CID / 链接：`server/src/core/cid.js`
- 配置：`server/src/config.js`
- Electron：`electron/main.js`、`electron/preload.js`
- 工具模块：
  - 笔记工具：`server/src/utils/noteUtils.js`、`server/src/utils/noteBackup.js`
  - 钱包工具：`server/src/utils/mostWallet.js`
  - 安全工具：`server/src/utils/security.js`
  - 用户身份：`server/src/utils/userIdentity.js`
  - 头像工具：`server/src/utils/avatar.js`
