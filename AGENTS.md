## AI 行为准则

<!-- Source: swarmclawai/andrej-karpathy-skills, adapters/codex/AGENTS.md, synced 2026-06-04 -->

- 默认使用中文回复。
- 编码前先明确目标、成功标准、已知约束和关键假设；不确定时说明歧义并提问。
- 简单优先：只实现当前需求，不添加推测性功能、未请求的配置、兼容分支或多余抽象。
- 精准修改：只改和任务直接相关的代码，不顺手重构、不清理无关代码、不改变无关行为。
- 目标驱动执行：多步任务先写简短计划，并说明每步如何验证。
- 验证闭环：改动完成后运行最小必要检查，并清楚说明已验证内容、未验证风险和原因。
- 浏览器控制：需要操作浏览器（Expo Web / 管理台的手动验证、截图、表单填写、UI 调试）时，一律使用 `browser-skill`。

---

# Most.Box

Most.Box 是一个以去中心化聊天为核心、文件传输为辅的 P2P 工具：用户加入频道交换消息，也可以发布文件得到 `most://` 分享链接；下载完成的人默认继续做种，让文件像 BitTorrent / 磁力链接一样传播。

它不是云盘、备份服务或付费存储市场。用户需要自己保存好重要数据；MostBox 只帮助在线用户把文件传播出去，并在仍有种子在线时让其他人下载。

Web3 产品入口和以太坊钱包工具保留为独立工具箱，不参与 MostBox 聊天、文件传输或做种主流程；按长期方案阶段 5 移出主仓库。

当前对外定位是 **MostBox · 去中心化聊天与文件传输**。DChat 是产品方向名称；当前聊天模型沿用 P2P 频道，不承诺端到端加密、无服务器或永久在线。

## 开发与发行顺序

- 先开发并验证全功能版，再按上架需要适配海外 APP 商店版和中国大陆 APP 商店版；三个版本共享代码与协议核心，不默认复制三套业务工程。
- 中国大陆 Android 包名与 iOS Bundle ID 均为 `most.people`（`inkbox` profile）；正式签名与候选包尚未生成，不代表已完成合规。
- 产品范围和后续工作统一看 `docs/roadmap.md`；已有证据和未覆盖项看 `docs/validation-status.md`，不以旧日志或商店构建命令认定审核通过。

## 关联仓库

- 官网与合规事务在私有仓库 `most-people/most.red`，本机位于同级目录 `../most.red`：中国大陆官网、APP 上架（Google Play、App Store、大陆商店）、备案、公司资质与账号。上架状态和商店提出的产品侧依赖看 `../most.red/docs/release-readiness.md`，大陆 APP 备案看 `../most.red/docs/app-filing.md`。
- 本仓库负责产品与客户端实现；验收结果、候选包提交与哈希在 `docs/validation-status.md` 记录，供上架办理核对。
- 本仓库公开：不要把 `most.red` 中的公司证件、账号 ID、联系电话、订单号或审核往来复制到这里，引用时只写文档路径。

## 当前文档

过期阶段日志、旧封版和商店表单已移除；当前文档入口为 `docs/README.md`，代码、README 和验收文档是当前事实来源。处理相关需求时优先阅读：

| 需求类型                     | 优先阅读                         |
| ---------------------------- | -------------------------------- |
| 新用户、本地验收和 MVP 回归  | `docs/acceptance.md`             |
| 产品定位、使用方式和技术栈   | `README.md`                      |
| Android Alpha 内测验收       | `docs/mobile-android-alpha.md`   |
| iOS 真机可行性验证           | `docs/mobile-ios-feasibility.md` |
| 代码结构、协议边界和开发约定 | 本文件，以及相关入口文件         |

## 当前 MVP 口径

首版优先验证两个相互连接的闭环：

```
CID
  → most:// 分享链接
  → 发布者按 CID topic 做种
  → 下载者凭链接下载并重算 CID 校验
  → 下载者默认持续做种
  → 发布者退出后，只要还有下载者在线即可继续传播

频道
  → 创建或加入 P2P 频道
  → 消息在在线节点间同步
  → 聊天附件使用 most:// 链接并按 CID 校验
```

MVP 范围只包含上面两个闭环。深度要求：每条结论都要有失败模型、可检查的不变量、分布式统计、独立预言机和可复现的原始证据。执行步骤与工具现状见 `docs/acceptance.md` 的「MVP 深度验收」。

失败模型（验收必须覆盖）：

- 对端：正常、发错字节、截断、极慢、谎报大小。
- 网络：同局域网、跨 NAT 打洞、经中继、丢包与抖动、网络切换。
- 进程：任一持久化写入点被 kill -9；移动端被系统清理。
- 流失：在线种子数 1、2、5，节点按记录的随机种子上下线。

文件接力不变量：

- F1 只有重算 UnixFS CID v1 与链接一致的内容才会保存、记录 holding、join topic；应用/daemon 重启后自动重新 join。
- F2 发送坏数据的 peer 永远不能让下载者做种错误内容。MVP 接受“整文件下载后校验”：单个坏 peer 单次尝试的代价上界为该 peer 声明的文件大小（且不超过 `maxFileSizeBytes`），超出即中止；校验失败后临时文件清理、不记 holding、不报告本地已有。MVP 不做边下载边校验，因为需要传输 UnixFS DAG 中间节点，属于协议变更。坏 peer 被跳过后继续尝试其他种子，见 `docs/cid-drive-protocol.md`。
- F3 任意崩溃点重启后，holding、`published-files.json` 与 Hyperdrive `/<cid>` 实际可读性一致；不一致时以 CID 可读为准自愈或报错，不误报“已有”。
- F4 根项目、移动端与 kubo/Helia 对同一黄金样本集给出相同 CID（含 0B、块边界 ±1、2/4/10GiB 编码边界）。
- F5 发布者退出后，只要至少 1 个下载者在线做种，新节点可完成下载并校验。

聊天不变量：

- C1 已确认消息不丢；C2 不重复；C3 同一发送者顺序保持。
- C4 分区恢复后，在线成员最终收敛到同一消息集合。
- C5 明确并测试“其他成员全部离线时可读到的历史”边界。

量化门槛（2026-11-15 确定；先提交、再测试，结果不得事后改口径）：

- 本地模拟网络接力（`hyperdht/testnet` + NAT/丢包模拟，小文件）：每种网络条件 ≥300 次。同网与打洞失败 ≤3 次（成功率 ≥99%），发现时间 P95 同网 ≤10s、打洞 ≤30s；中继成功率 ≥95%，发现时间 P95 ≤60s。60s 是界面提示“暂未发现在线种子”的时限，P95 超过它就意味着界面会误导用户。
- 流失场景：只统计下载全程至少有 1 个种子在线的尝试，门槛同上。
- 真机/真实网络接力：每种条件（Wi-Fi、蜂窝、跨网）≥30 次，失败 ≤3 次（成功率 ≥90%），报告 P50/P95，不设时间门槛。
- 聊天：随机断连/分区/重启注入 ≥100 轮，C1–C4 零违例；分区恢复后在线成员收敛时间 P95 ≤30s。
- 变异测试：CID 计算与下载校验、holding 恢复、`most://` 解析三条路径合计变异得分 ≥85%；比较下载 CID 与链接 CID 的那个判断，其变异体必须 100% 被杀死。存活变异体逐条列出并说明原因。

证据要求：

- 每次结论附提交号、包 SHA-256、设备/OS、NAT 类型与连接路径（直连/打洞/中继）、随机种子、原始事件日志。
- 一条命令可在干净环境重放统计；结论只由原始日志计算，不由人工摘要认定。
- 隐私事实写明：知道 CID 的人可经 DHT 枚举做种者 IP，并有实测记录。

用户可见状态：本机正在做种的 CID、文件大小、topic join 状态、连接路径和基础日志。

## 产品与协议不变量

- `most://<cid>?filename=...` 是 MostBox 原生分享链接；本轮不改成 `magnet:`，也不做双格式。
- CID 即权限：知道链接的人即可尝试下载；CID 或链接泄露不是漏洞。
- CID 是唯一内容身份：发布、做种 topic、Hyperdrive key、下载发现、本地已有判断、预览/打开和完整性校验都必须以 CID 为准。
- 文件名、用户可见路径、聊天附件路径和 metadata 只服务展示、分类、保存路径与冲突提示，不得替代 CID 判断内容是否存在、是否可读或是否可信。
- MostBox 不承诺永久保存或离线可用；可用性来自当前在线种子数量。
- 发布成功和下载成功后默认持续做种，除非用户暂停、删除文件或关闭应用。
- 文件模型是完整副本：不做分片、不做纠删码；每个做种 peer 持有完整文件。
- Hyperswarm topic 使用 `cid.multihash.digest`，不要额外 hash、截断或换 topic 规则。长期方案阶段 2 将统一修改此规则（见 `docs/decentralization-plan.md`），在那之前不得零散改动。
- Hyperdrive 只存文件内容，key 固定为 `/<cid>`；用户可见路径和文件名不进入 Hyperdrive。
- 每个节点只做种自己的 CID drive：drive 名由本节点私密种子派生（桌面为节点种子，移动为 `cid-drive-secret`），他人无法为其签名；下载者经 `most-cid-drive/2` 通道向 peer 询问 drive key，逐个读取并按 CID 校验。不要恢复共享密钥 drive，记录中的 `driveName` 不可作为依据。协议见 `docs/cid-drive-protocol.md`。
- 用户文件列表和目录结构由 `published-files.json` 维护；做种持有记录由 `node-holdings.json` 维护，避免污染用户文件管理视图。
- 不实现上链存储协议、智能合约、USDT 支付、质押、订单、赏金猎人、fraud proof、Treasury 或云端下单。

## 技术栈

- 前端：React 19, Vite, TanStack Start static prerender, TanStack Router, TypeScript, Zustand, Lucide React
- 后端：Hono, `@hono/node-server`, WebSocket
- P2P：Hyperswarm 4.x, Hyperdrive 13.x, Corestore 7.x
- Web3 工具箱：ethers.js
- 桌面：Electron 44, electron-builder
- 移动端：Expo 57, React Native 0.86, react-native-bare-kit / Bare Worklet
- 测试：Node.js built-in test runner

根项目本地开发建议 Node.js >= 24；Expo 57 移动端子包建议 Node.js >= 24。

## 核心实现约束

- CID 使用 UnixFS CID v1，当前由 `server/src/core/cid.js` 和 `ipfs-unixfs-importer@17.1.1` 生成；移动端当前使用 `17.0.1`，两端必须保持黄金 CID 一致。
- CID 显式参数：`cidVersion: 1`、`rawLeaves: true`、`wrapWithDirectory: false`；升级 importer 前必须跑 CID 黄金样本测试。
- 下载完成后必须重算 UnixFS CID v1，只有 CID 与链接一致才保存并做种。
- 判断“本地已有”必须确认本机可按 `/<cid>` 读到内容；只有 metadata、文件名或保存路径匹配不算本地已有。
- 下载只接受 Hyperdrive 中精确的 `/<cid>` 文件；下载完成后写入 Hyperdrive 并记录 holding，让下载者自动成为新的种子。
- 节点配置保留 `maxFileSizeBytes`、`capacityBytes` 和数据目录；发布或下载成功后固定自动做种，不提供关闭开关、产品层同时做种上限或应用层限速。
- 节点/做种能力 API 优先：HTTP API + WebSocket + OpenAPI 是稳定入口；Web 管理台给人用；薄 CLI 只做安装、启动、诊断。

## 常用命令

```bash
npm start              # Vite / TanStack Start 前端，端口 2020
npm run server         # 后端，默认端口 1976
npm run serve          # 构建并由后端 serve
npm test
npm run test:unit
npm run test:protocol
npm run lint

# Android 子包
cd app
npm install
npm start
npm test
npm run build
```

## 发布约定

- 发版流程和版本同步清单以 `README.md` 的 CI/CD 小节为准；处理发版任务前必须先核对该小节。
- 特别注意 Android 子包版本和 Expo 可见版本必须随根包版本一起更新，不能只依赖 CI tag 生成 APK 文件名。

## 验证策略

- 改 CID、发布、下载、链接解析、P2P pull 时，优先跑 `npm run test:protocol`。
- 改后端核心逻辑时，跑相关 `node --test server/tests/...`；范围较大时跑 `npm test`。
- 改前端结构或样式时，跑 `npm run typecheck`、`npm run typecheck:strict-router`、`npm run lint`，必要时启动前后端手动验证。
- 涉及 MVP 主线时，用“发布者退出后，下载者种子仍可继续传播并校验”作为最高验收场景。
- Web3 工具箱保留独立测试；不要把钱包作为文件分享前置条件。

## 代码约定

- 使用 ESM；本地导入带 `.js` 扩展名。
- 2 空格缩进、单引号、默认不写分号。
- 修改代码、测试、文档或配置后，经常运行 `npm run format`；提交前必须再运行一次，确保仓库格式统一。
- 命名：组件 / 类 `PascalCase`，函数 / 变量 `camelCase`，常量 `UPPER_SNAKE_CASE`，私有字段 `#field`。
- TypeScript 避免 `any`，组件 Props 使用 `{ComponentName}Props`。
- 前端路由使用 TanStack Router：`src/routes/**/index.tsx` 只做路由注册、SSR 开关、redirect/head/search 等关键配置；页面组件放在同目录 `index.lazy.tsx` 并从 `src/features/**` 引入。
- 全局 Zustand 状态在 `src/stores/useAppStore.ts`，组件通过 action 修改状态。
- i18n 文案按域放在 `src/lib/i18n/messages/*.ts`，由 `src/lib/i18n/messages.ts` 聚合导出；业务代码通过稳定 `MessageKey` 使用文案，不直接拼中文 UI 文案。
- 错误类在 `server/src/utils/errors.js`；P2P 网络噪声错误可静默处理。
- 测试使用 `node:test` 和 `node:assert`，测试文件命名 `*.test.js`。

## 前端样式

- 全部使用 CSS class，禁止组件内联 `style={{}}`。
- 全局变量和基础组件类在 `src/styles/globals.css`；页面样式放到 `src/styles/{模块}.css` 并由对应 route/root 引入。
- 按钮和输入框复用全局 `.btn` / `.input` 及其变体，不在页面 CSS 重复定义。
- 图标统一使用 `lucide-react`；品牌 Logo 等自定义图标放在 `src/components/icons/`。
- `ModalOverlay` 是唯一弹窗玻璃容器提供者；弹窗 CSS 不重复定义容器的 width、padding、background、blur、border、shadow、radius。

## P2P / 聊天注意点

- Hyperswarm 4.x 中 `conn` 直接作为流使用，不要调用 `conn.openStream()`。
- Channel append 监听用 `lastCoreLength` 只处理新消息，避免重复推旧消息。
- 双方都拥有频道时，通过 `store.namespace(\`channel-${name}\`).replicate(conn)` 复制。
- WebSocket 订阅要等 `peerId` 就绪；未就绪时暂存频道名，随后补发订阅。
- Hyperswarm 每 10 分钟才重查已加入的 topic；下载等待来源时两端每 `TOPIC_LOOKUP_INTERVAL`（5s）调用 `discovery.refresh()`，不要删除。
- 读频道历史（含启动时重放、发送前索引扫描）只用 `core.get(i, { wait: false })`，缺块即停；远端频道 core 打开时 `core.download({ start: 0, end: -1 })`。否则作者离线时启动/读取/发送会挂起，见 `channelPartialCore.test.js`。
- 代码中不写入任何默认中继地址或公钥（含负责人的个人服务器）；中继只由节点配置 `relayPublicKey` 指定，默认空。改中继行为时核对 `PRIVACY.md` 的中继披露。

## 关键入口

- 前端主应用：`src/features/chat/ChatPage.tsx`、`src/features/files/AppPage.tsx`
- 前端路由壳：`src/routes/**/index.tsx`、`src/routes/**/index.lazy.tsx`
- i18n 文案入口：`src/lib/i18n/messages.ts`、`src/lib/i18n/messages/*.ts`
- Web3 工具箱：`src/features/web3/Web3Page.tsx`
- 管理后台：`src/features/admin/AdminPage.tsx`
- 移动端应用：`app/`
- 全局状态：`src/stores/useAppStore.ts`
- 后端 daemon 启动入口：`server/index.js`
- HTTP 应用和路由：`server/src/http/app.js`
- HTTP 支撑模块：`server/src/http/*.js`
- 核心引擎：`server/src/index.js`
- 做种配置：`server/src/node/config.js`
- CID / 链接：`server/src/core/cid.js`
- 配置：`server/src/config.js`
- Electron：`electron/main.js`、`electron/preload.cjs`
- 工具模块：
  - 钱包工具：`server/src/utils/mostWallet.js`
  - 安全工具：`server/src/utils/security.js`
  - 用户身份：`server/src/utils/userIdentity.js`
  - 头像工具：`server/src/utils/avatar.js`
