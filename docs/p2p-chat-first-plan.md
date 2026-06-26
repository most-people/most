# Most.Box 聊天优先改造计划

## 一句话目标

Most.Box 不彻底改成单一聊天产品，而是升级为 **聊天优先的 P2P 工具箱**：用户之间直接连接，从聊天开始，在聊天里完成通信、传文件、整理知识库；游戏保留独立入口，继续走 `game.*` Channel。

对普通用户的表达：

```text
Most.Box：用户之间直接连接的 P2P 工具箱。
从聊天开始，直接传文件、整理知识库。
```

对开发和验收的表达：

```text
Chat first.
Channel 是消息、文件附件和知识库入口的共同承载层。
文件分享和知识库围绕聊天组织；游戏保留独立入口，仍通过 game.* 房间同步。
```

内部产品比喻可以使用“P2P 微信”，帮助团队统一交互模型；对外正式定位不使用“微信替代品”或“即时通讯平台”，避免过早引入大型社交产品预期和更高合规压力。

## 定位决策

| 维度 | 采用 | 不采用 |
| --- | --- | --- |
| 外部定位 | 用户之间直接连接的 P2P 工具箱 | 微信替代品、匿名聊天平台、公共社交平台 |
| 产品入口 | 聊天优先 | 工具卡片优先、文件发布优先 |
| 功能组织 | 文件和知识库从聊天自然进入；游戏保留独立入口 | 一堆互不相关的独立工具 |
| 技术表达 | 技术词放到开发者说明和文档后半段 | 首屏堆 CID、Hyperswarm、Hyperdrive |
| 合规边界 | 邀请制、私域协作、用户直连 | 公共广场、频道推荐、热榜、内容分发平台 |

## 目标

| 目标 | 说明 | 成功标准 |
| --- | --- | --- |
| 聊天成为第一入口 | 用户打开 Most.Box 后优先看到会话和频道，而不是工具卡片或文件发布面板。 | 首页、桌面入口、README 首屏都明确“聊天优先”。 |
| 用户之间直接连接 | 首屏文案用“用户之间直接连接”解释 P2P，技术词放到后面。 | 非技术用户能在 30 秒内理解：这是从聊天开始的 P2P 工具箱。 |
| 文件成为聊天附件 | 文件发布和下载仍走 CID、`most://`、做种和校验，但用户入口优先是聊天附件。 | 在聊天里发送文件后，对方能下载、校验、预览，并默认继续做种。 |
| 知识库成为聊天沉淀 | Obsidian 风格知识库不再是孤立工具，而是聊天内容、想法和 Markdown 内容的沉淀处。 | 用户能从聊天语境保存到知识库；现有 `/note` 能力保留。 |
| 游戏保留独立入口 | 游戏继续复用 Channel 系统，但暂不放进聊天详情。 | 用户能从独立游戏页进入房间，游戏事件仍走 `game.*` channel。 |
| 保留协议不变量 | 不改变 CID、`most://`、Hyperdrive key、Hyperswarm topic、做种记录等底层规则。 | `npm run test:protocol` 继续通过。 |

## 非目标

- 不做一个中心化 IM 平台。
- 不对外宣称“替代微信”。
- 不做公共广场、热榜、推荐流、附近的人或频道搜索平台。
- 不实现朋友圈、公众号、支付、小程序商店或好友关系链。
- 不把 Web3 钱包变成聊天、文件或游戏的前置条件。
- 不把知识库包装成云盘，也不承诺永久保存。
- 不重写 P2P 文件协议；本轮只是把文件能力收进聊天体验。

## 当前结构事实

| 能力 | 当前入口 | 当前关键文件 | 改造方向 |
| --- | --- | --- | --- |
| 聊天频道 | `/chat/` | `src/features/chat/ChatPage.tsx`、`src/components/ChatUi.tsx`、`src/lib/channelApi.ts`、`src/hooks/useChannelMessages.ts`、`server/src/http/routes/channelRoutes.js` | 升级为主入口和主导航。 |
| 文件分享 | `/app/` | `src/features/files/AppPage.tsx`、`src/lib/fileApi.ts`、`server/src/http/routes/fileRoutes.js`、`server/src/core/cid.js` | 保留为传输管理/文件库；优先通过聊天附件触发。 |
| 聊天附件 | `/chat/` 内部 | `src/features/chat/ChatPage.tsx`、`src/components/ChatAttachmentCard.tsx`、`server/src/core/channelAttachment.js` | 作为文件传输的主体验继续打磨。 |
| 知识库 | `/note/` | `src/features/note/NotePage.tsx`、`src/components/MilkdownEditor.tsx`、`src/features/note/noteVaultApi.ts`、`server/src/http/routes/noteVaultRoutes.js` | 定位为知识库；接入聊天保存入口。 |
| 游戏房间 | `/game/gandengyan/`、`/game/zhajinhua/` | `src/hooks/useGameRoom.ts`、`server/src/core/gameRoom.js`、`src/features/game/**` | 保留独立游戏页面；继续复用 `game.<gameId>.<roomCode>` channel。 |
| 门户页 | `/` | `src/components/FeaturePortal.tsx`、`src/features/portal/HomePage.tsx`、`src/lib/i18n/messages/portal.ts` | 从工具箱卡片改成聊天优先介绍。 |
| 管理台 | `/admin/` | `src/features/admin/AdminPage.tsx`、`server/src/http/routes/nodeRoutes.js` | 保留为节点诊断和做种状态入口，不进入普通用户主流程。 |
| Web3 工具箱 | `/web3/` | `src/features/web3/Web3Page.tsx` | 保留独立工具箱，不参与聊天主流程。 |

## 信息架构目标

| 层级 | 目标入口 | 用户理解 | 技术承载 |
| --- | --- | --- | --- |
| 主入口 | `/chat/` | 聊天、群、房间 | Channel + WebSocket + Corestore/Hypercore |
| 聊天内能力 | 附件 | 传文件 | `most://` + CID 校验 + 下载后做种 |
| 聊天内能力 | 知识库 | 保存消息、写 Markdown、整理内容 | `/note/` + IndexedDB / 本地 Markdown vault |
| 独立工具 | 游戏 | 独立房间游戏 | `game.*` channel + 游戏事件 JSON |
| 高级入口 | 文件库/传输管理 | 管理已发布文件和下载 | `/app/` + holdings + file API |
| 高级入口 | 节点管理 | 看连接、日志、做种状态 | `/admin/` |
| 独立工具 | Web3 | 密钥、钱包、PEM、地址工具 | `/web3/` |

## 阶段计划

| 阶段 | 目标 | 主要改动 | 涉及文件 | 验证方式 |
| --- | --- | --- | --- | --- |
| P0：定位统一 | 外部定位改为“聊天优先的 P2P 工具箱”，内部用“P2P 微信”辅助理解交互。 | 更新 README 首屏、门户页文案、SEO 标题、package 描述和宣传口径；强调“用户之间直接连接”，避免“微信替代品”。 | `README.md`、`package.json`、`src/lib/i18n/messages/portal.ts`、`src/components/FeaturePortal.tsx` | `npm run typecheck`、`npm run lint`；人工检查首页第一屏。 |
| P1：聊天主入口 | 让 `/chat/` 成为用户第一路径。 | 调整首页默认选中聊天；桌面入口优先跳转聊天；导航排序改为聊天、文件、记录、游戏、管理。 | `src/features/portal/HomePage.tsx`、`src/components/FeaturePortal.tsx`、`src/components/AppShell.tsx`、相关 i18n | `npm run typecheck`、`npm run lint`；打开 `/` 和 `/chat/` 检查路径清晰。 |
| P2：聊天核心体验 | 把频道体验做成真正的聊天主界面。 | 强化会话列表、未读、置顶、成员在线、频道备注、邀请加入；减少“频道”技术感，文案改成“聊天/群/房间”。 | `src/features/chat/ChatPage.tsx`、`src/components/ChatUi.tsx`、`src/lib/chatUnread.js`、`src/lib/i18n/messages/chat.ts` | `npm run test:frontend`、`npm run typecheck`、`npm run lint`；两端创建/加入同一聊天并收发消息。 |
| P3：文件作为聊天附件 | 让文件传输从聊天自然发生。 | 保留现有附件发布逻辑；优化附件发送、下载检测、无种子提示、下载完成预览；把 `/app/` 降级为文件库/传输管理。 | `src/features/chat/ChatPage.tsx`、`src/components/ChatAttachmentCard.tsx`、`src/lib/fileApi.ts`、`server/src/core/channelAttachment.js`、`src/features/files/AppPage.tsx` | `npm run test:protocol`；两节点聊天发送文件，接收方下载并 CID 校验通过。 |
| P4：知识库接入聊天 | 把知识库解释为聊天里的内容沉淀处。 | 新增从消息保存到知识库的入口；知识库页继续支持 Obsidian 风格 Markdown vault；不改变现有 vault API。 | `src/features/chat/ChatPage.tsx`、`src/features/note/NotePage.tsx`、`src/features/note/noteVaultApi.ts`、`src/lib/i18n/messages/note.ts` | `node --test server/tests/unit/noteVault.test.js server/tests/unit/accountBackup.test.js`；手动验证保存消息到知识库。 |
| P5：游戏保留独立入口 | 游戏继续复用 Channel，但暂不放进聊天详情。 | 移除聊天详情里的游戏入口；独立游戏页仍使用 `game.<gameId>.<roomCode>` channel，不新增独立后端协议。 | `src/hooks/useGameRoom.ts`、`src/features/game/**`、`server/src/core/gameRoom.js` | `node --test server/tests/unit/gameRoom.test.js server/tests/unit/gandengyan.test.js server/tests/unit/zhajinhua.test.js`；两端从独立游戏页加入房间并同步事件。 |
| P6：验收口径切换 | 新 MVP 从“文件闭环”升级为“聊天闭环 + 文件附件闭环”。 | 更新 `docs/acceptance.md`，保留原文件协议回归；新增 P2P 聊天、附件、知识库和独立游戏验收路径。 | `docs/acceptance.md`、必要测试文档 | `npm run test:protocol`、`npm run test:frontend`、相关后端单测；人工跑完整聊天场景。 |
| P7：移动端跟进 | Android 也围绕聊天启动。 | 移动端优先实现频道聊天、附件收发和基础做种状态，再补文件库和游戏。 | `mobile/android/**` | `cd mobile/android && npm test`；真机前台聊天和附件传输。 |

## MVP 验收场景

第一阶段完成后，Most.Box 的主线验收应从“文件发布页闭环”升级为“聊天入口闭环 + 文件附件闭环”：

1. 用户 A 打开 Most.Box，进入聊天主界面。
2. 用户 A 创建一个聊天/房间，并把入口发给用户 B。
3. 用户 B 加入后，双方能通过 P2P Channel 收发消息。
4. 用户 A 在聊天里发送文件附件。
5. 用户 B 点击附件下载，下载完成后重算 CID 校验通过，并默认继续做种。
6. 用户 A 退出后，只要用户 B 仍在线做种，用户 C 仍可通过同一 `most://` 内容完成下载。
7. 用户能把重要消息或想法保存到知识库。
8. 用户能从独立游戏页面进入房间，游戏事件通过 Channel 同步；聊天详情暂不提供游戏入口。

其中第 4-6 步继续沿用现有文件分享最高验收标准，不能因为聊天主入口改造而降低 CID 和做种要求。

## 文案原则

| 场景 | 推荐表述 | 避免表述 |
| --- | --- | --- |
| 首屏 | 用户之间直接连接的 P2P 工具箱 | 去中心化无服务器分布式协议套件 |
| 副标题 | 从聊天开始，直接传文件、整理知识库 | P2P 微信、微信替代品、匿名聊天平台 |
| 文件 | 在聊天里直接传文件，下载后还能继续帮对方传播 | 免费网盘、永久保存、不限条件下载 |
| 知识库 | 把聊天里的重要内容沉淀成 Markdown 知识库 | 云端知识库、永久同步 |
| 游戏 | 独立房间游戏，事件仍通过 Channel 同步 | 独立游戏平台 |
| 技术页 | 基于 Channel、CID、Hyperswarm、Hyperdrive 的 P2P 能力 | 把技术词放到普通用户第一屏 |

## 合规与产品边界

本计划不是法律意见，但产品设计需要默认降低公共社交平台风险：

| 边界 | 计划内 | 暂不做 |
| --- | --- | --- |
| 关系形态 | 用户主动分享频道名、邀请链接或房间码 | 全网用户搜索、附近的人、陌生人推荐 |
| 内容形态 | 私域聊天、文件附件、个人记录、房间游戏事件 | 公开信息流、热榜、广场、频道排行 |
| 发现方式 | 手动加入、邀请加入 | 平台推荐、算法分发、公开频道市场 |
| 账号体系 | 本地身份用于署名、鉴权和数据隔离 | 中心化社交账号体系 |
| 管理能力 | 本机节点日志、holding、连接状态和基础诊断 | 平台级内容审核后台 |
| 宣传口径 | 用户直连、聊天优先、P2P 工具箱 | 无监管、不可追踪、规避审查、匿名社交 |

后续如果要做公开频道、跨陌生人发现、推荐流或大型群组，需要单独开合规评估和产品设计，不放进本轮聊天优先改造。

## 关键约束

- `most://<cid>?filename=...` 保持 MostBox 原生分享链接。
- CID 仍是唯一内容身份；文件名、聊天附件名和记录标题只做展示。
- Hyperswarm topic 仍使用 `cid.multihash.digest`，不要额外 hash、截断或换 topic。
- Hyperdrive 文件内容 key 仍固定为 `/<cid>`。
- 下载完成必须重算 UnixFS CID v1，匹配后才保存并做种。
- 聊天附件必须继续通过 `server/src/core/channelAttachment.js` 校验 CID、文件名和链接一致性。
- 游戏继续使用公共 Channel 系统，不新增独立游戏后端接口。
- Web3 工具箱保留独立入口，不成为聊天、文件、记录或游戏的前置条件。

## 推荐执行顺序

1. 先改定位和入口，不动协议。
2. 再打磨聊天基础体验。
3. 再把文件附件体验做顺。
4. 再接知识库保存入口，并保留游戏独立入口。
5. 最后更新验收文档、README、截图和宣传物料。

这个顺序的好处是：产品心智先统一，底层 P2P 文件闭环不被打断，每一步都能单独验收和回滚。
