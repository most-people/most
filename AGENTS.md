## AI 行为准则

- 默认使用中文回复。
- 先明确目标和成功标准；不确定时说明歧义并提问。
- 简洁优先：只实现当前需求，不添加推测性功能、兼容分支或多余抽象。
- 精准修改：只改和任务直接相关的代码，不顺手重构、不清理无关代码。
- 目标驱动执行：多步任务先写简短计划，并说明每步如何验证。
- 新项目优先清晰正确：可以直接调整接口、数据结构和持久化格式；除非用户要求，不保留旧格式迁移。
- Demo 数据不是兼容代码：`DEMO_*` / marketing / no-backend preview 数据要保留；不确定时先问。

---

# Most.Box

Most.Box 是一个公共内容保种网络：用户为一个 CID 付费，独立节点帮用户长期保留完整副本，任何人都能凭 CID 下载并校验文件。

它不是隐私网盘。MostBox 默认面向公共内容；私密文件必须由用户先本地加密，再把密文作为普通文件上传。

## 计划文档

完整产品计划在 `docs/plan/`，入口是 `docs/plan/README.md`。不要在每次任务开始时通读全部计划；只在需求涉及相关主题时按需打开。

| 需求类型 | 优先阅读 |
| -------- | -------- |
| 当前任务顺序、周计划、验收 | `docs/plan/任务优先级与周计划.md` |
| MVP 范围、完成定义、后置能力 | `docs/plan/MVP落地计划.md` |
| MVP 后路线和 v1 边界 | `docs/plan/实施路线图.md` |
| 总体定位、经济模型、风险边界 | `docs/plan/项目计划书.md` |
| 技术分层、接口优先原则、非 MVP 能力 | `docs/plan/技术架构.md` |
| CID / 上传 / 下载 / 数据目录入口 | `docs/plan/协议基线实现入口清单.md` |
| 合约、订单状态、质押、结算 | `docs/plan/智能合约.md` |
| 节点 daemon、Web 管理台、运营策略 | `docs/plan/节点运营.md` |
| 审计、fraud proof、Degraded | `docs/plan/零知识证明.md` |
| 默认不加密、私密文件边界 | `docs/plan/加密与存储.md` |

## 当前 MVP 口径

首版只验证一个闭环：

```
CID + Merkle 校验
  → Hyperswarm 完整副本保种
  → 本地/测试网 USDT 订单
  → 用户手动选择节点
  → 节点 pullConfirm
  → 下载者凭 CID 下载并校验
  → 最小随机 chunk 审计
```

MVP 成功标准：

- 上传者离线后，选中的节点仍能继续保种。
- 下载者只凭 CID 能下载，并通过 CID + `chunkMerkleRoot` 双重校验。
- 节点能按订单获得可解释的 USDT 收益，并承担可测试的失信成本。
- 正常节点能通过随机 chunk 审计；错误 proof 必须被识别。

## 产品与协议不变量

- CID 即权限：知道 CID 就能查询订单、发现节点并尝试下载；CID 泄露不是漏洞。
- v1 只支持 USDT：支付、质押、罚没、审计奖励和 Treasury 都用 USDT；不发行原生代币。
- 文件模型是完整副本：不做分片、不做纠删码；`replicaCount >= 1`，默认推荐 2。
- `replicaCount=1` 必须强警告并二次确认，因为无冗余，手动修复也可能没有可用源。
- 同一 CID 同时最多 1 个 active order；续费用 `addFunds` 延长现有订单，不创建并行订单。
- 用户手动选择节点；MVP/v1 不做自动抽签、自动 repair 或固定全网定价。
- 浏览器只展示 demo、文档和客户端下载引导；正式下单、下载、做种、审计和长期节点能力放在桌面端或后台 daemon。
- 节点能力 API 优先：HTTP API + WebSocket + OpenAPI 是稳定入口；Web 管理台给人用；薄 CLI 只做安装、启动、诊断。
- 正常审计链下完成，零 gas；只有可验证欺诈或达到不响应阈值后的状态变更才上链。
- 不响应本身不是 fraud proof，不能仅凭超时罚没本金；只有节点签名过的错误 proof 才触发 USDT 质押罚没。
- Degraded 后由用户手动选择替补节点；v1 不做自动修复调度和自动带宽费结算。
- 手续费和罚没余额先进单一 Treasury 地址；不做复杂分账。

## 技术栈

- 前端：React 19, Next.js 16, TypeScript, Zustand, Lucide React
- 后端：Hono, `@hono/node-server`, WebSocket
- P2P：Hyperswarm 4.x, Hyperdrive 13.x, Corestore 7.x
- Web3：ethers.js, Hardhat, Solidity, EIP-712
- 桌面：Electron 41, electron-builder
- 测试：Node.js built-in test runner

## 核心实现约束

- CID 使用 UnixFS CID v1，当前由 `server/src/core/cid.js` 和 `ipfs-unixfs-importer@16.1.5` 生成。
- CID 显式参数：`cidVersion: 1`、`rawLeaves: true`、`wrapWithDirectory: false`；升级 importer 前必须跑 CID 黄金样本测试。
- Merkle 默认按 256KB chunk 生成 `chunkMerkleRoot`，它是下载校验、pullConfirm 和审计的协议锚点。
- Hyperswarm topic 使用 `cid.multihash.digest`，不要额外 hash、截断或换 topic 规则。
- Hyperdrive 只存文件内容，key 固定为 `/<cid>`；用户可见路径和文件名不进入 Hyperdrive。
- 用户文件列表和目录结构由 `published-files.json` 维护；节点持有记录应和桌面文件管理视图分开，避免污染用户文件列表。
- 下载完成后可临时做种，帮助热门文件分摊节点上行压力。
- `most://<cid>?filename=...&r=...` 中的 `r` 是 `chunkMerkleRoot`，下载和 P2P pull 都应把它作为必填校验锚。

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

环境变量：

- `MOSTBOX_PORT`，默认 `1976`
- `MOSTBOX_HOST`，默认 `0.0.0.0`

## 验证策略

- 改 CID、Merkle、上传、下载、链接解析、P2P pull 时，优先跑 `npm run test:protocol`。
- 改后端核心逻辑时，跑相关 `node --test server/tests/...`；范围较大时跑 `npm test`。
- 改前端结构或样式时，跑 `npm run lint`，必要时启动前后端手动验证。
- 改合约时，按 `docs/plan/智能合约.md` 的状态机补 Hardhat 单测，不只测成功路径。
- 涉及 MVP 主线时，用“上传者离线后仍可下载并校验”作为最高验收场景。

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
- 全局状态：`app/app/useAppStore.ts`
- 后端入口：`server/index.js`
- 核心引擎：`server/src/index.js`
- CID / 链接：`server/src/core/cid.js`
- Merkle：`server/src/core/merkle.js`
- 配置：`server/src/config.js`
- Electron：`electron/main.js`、`electron/preload.js`
