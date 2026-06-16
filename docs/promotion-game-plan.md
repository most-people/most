# MOST PEOPLE 全网闯关宣传计划

这份计划把 MOST PEOPLE / MostBox 的全网宣传拆成一套闯关任务。每一关只做当前关卡要求的事，完成验收后再进入下一关，避免一上来全网乱发、素材不齐、定位跑偏。

## 游戏目标

主线目标：

让 MOST PEOPLE 被更多人理解为一个开源、本地优先的 P2P 工具箱。核心入口是 `most://` 文件分享：发布者在线时别人可以下载，下载者校验完成后默认继续做种，让文件像种子一样继续传播。

胜利条件：

- 目标用户能在 30 秒内理解它不是网盘，而是 P2P 文件分享与工具箱。
- 新用户能从官网、GitHub、桌面端或 `npx most-box@latest` 进入体验。
- 至少 3 个社区产生真实讨论，而不是只留下无人回应的链接。
- 第一批用户愿意提交 issue、反馈长测结果或帮助传播。

核心口径：

- MOST PEOPLE 是 P2P 工具箱，不是云盘。
- CID 是内容身份，下载完成会重算 CID 校验。
- 可用性来自在线种子，不承诺永久保存。
- 文件分享、频道、笔记、Web3 身份是工具箱里的不同能力，文件传播主线不依赖钱包。

## 计分规则

每完成一个任务获得 XP。每一关达到最低 XP 后即可进入下一关。

| 类型 | 说明 | XP |
| --- | --- | --- |
| 文案任务 | 完成一段可直接发布的中文或英文文案 | 10 |
| 素材任务 | 完成截图、视频、GIF、封面或演示链接 | 20 |
| 发布任务 | 在一个平台按规则发布并保留链接 | 30 |
| 互动任务 | 回复评论、收集反馈、整理问题 | 20 |
| 复盘任务 | 记录数据、问题、下一步动作 | 20 |

通关建议：

- 每天最多打 1 个主线关卡和 2 个支线任务。
- 每次发帖前都先确认平台规则，尤其是 Product Hunt、Hacker News 和 Reddit。
- 不同平台重写标题和开头，不要把同一篇广告复制到全网。
- 每条内容都带一个明确行动：下载、GitHub Star、试用、反馈或转发。

## 第 0 关：世界观校准

目标：

把产品一句话讲清楚，避免后续所有宣传跑偏。

任务：

1. 写下中文一句话定位：

   ```text
   MOST PEOPLE 是一个本地优先的 P2P 工具箱，用 most:// 链接分享文件，下载者校验完成后默认继续做种。
   ```

2. 写下英文一句话定位：

   ```text
   MOST PEOPLE is a local-first P2P toolbox for sharing files with most:// links, CID verification, and downloader-powered seeding.
   ```

3. 写下三条“不是什么”：

   ```text
   它不是云盘。
   它不是备份服务。
   它不是付费存储市场。
   ```

4. 写下三条“为什么值得试”：

   ```text
   不需要把文件上传到中心化网盘。
   下载完成会用 CID 校验内容。
   下载者默认成为新的种子，传播能力来自在线用户。
   ```

验收：

- 任何介绍都不出现“永久免费网盘”“永久保存”“离线可用”等误导表达。
- 朋友只看一句话也能明白核心玩法。

解锁：

完成后进入第 1 关。

## 第 1 关：装备包

目标：

准备全网发布都能复用的基础素材。

任务：

1. 官网入口检查：
   - 首页首屏能看到 MOST PEOPLE / MostBox 名称。
   - 有桌面客户端下载入口。
   - 有 GitHub 链接。
   - 有 `npx most-box@latest` 入口。
   - 有“不是云盘”的边界说明。

2. GitHub 仓库检查：
   - README 首屏说明 P2P 文件分享主线。
   - README 里有安装、运行、测试、FAQ。
   - Release 页面能找到最新版本。
   - Topics 包含 `p2p`、`file-sharing`、`hyperswarm`、`open-source`。

3. 截图素材：
   - 主应用发布文件截图 1 张。
   - 复制 `most://` 链接截图 1 张。
   - 下载检测或下载成功截图 1 张。
   - 管理台 holding / seed 状态截图 1 张。

4. 视频素材：
   - 30 秒短视频：发布文件到复制链接。
   - 60 秒短视频：A 发布，B 下载并继续做种。
   - 3 分钟演示视频：完整解释“不是云盘，是 P2P 工具箱”。

5. 文案素材：
   - 中文短版。
   - 英文短版。
   - 中文技术长版。
   - 英文技术长版。
   - FAQ 10 问。

验收：

- 所有素材放在一个可复用目录或发布清单里。
- 任意平台发帖时，10 分钟内能取到对应图片、视频和文案。

解锁：

素材包完成 80% 后进入第 2 关。

## 第 2 关：新手村内测

目标：

先找小范围真实用户试用，修掉最容易劝退人的问题。

任务：

1. 找 10 个种子用户：
   - 2 个开发者。
   - 2 个 NAS / 自托管用户。
   - 2 个经常传大文件的人。
   - 2 个对隐私和本地优先感兴趣的人。
   - 2 个完全不了解 P2P 的普通用户。

2. 给他们同一个任务：

   ```text
   下载 MOST PEOPLE，发布一个测试文件，把 most:// 链接发给另一个人，让对方下载并反馈体验。
   ```

3. 收集五类反馈：
   - 第一次打开是否知道下一步做什么。
   - 是否理解 `most://` 链接。
   - 下载失败时是否知道原因。
   - 是否理解“下载者继续做种”。
   - 是否误以为这是云盘。

4. 整理反馈：
   - 高频问题。
   - 阻塞问题。
   - 文案误解。
   - 截图或视频需要补充的地方。

验收：

- 至少 5 人完成发布或下载。
- 至少收集 10 条具体反馈。
- 至少修正 3 个宣传文案或 FAQ 问题。

解锁：

完成内测反馈表后进入第 3 关。

## 第 3 关：中文开发者首发

目标：

先在理解开源和 P2P 的中文开发者圈建立第一波讨论。

优先平台：

- V2EX
- 掘金
- 开源中国
- 知乎
- GitHub Discussions / Issues

任务：

1. V2EX 帖子：
   - 标题示例：`我做了一个本地优先的 P2P 工具箱，用 most:// 分享文件`
   - 开头讲“为什么做”。
   - 中间讲“怎么用”。
   - 结尾请大家试用和提建议。

2. 掘金技术文：
   - 主题：`most://、CID 和下载者继续做种：一个 P2P 文件分享工具的 MVP 闭环`
   - 重点讲协议边界、CID 校验、Hyperswarm topic、Hyperdrive key。

3. 开源中国项目帖：
   - 重点讲开源、安装方式、平台支持、适合谁用。

4. 知乎回答：
   - 问题方向：不用网盘怎么传大文件、P2P 文件分享工具、开源文件分享。
   - 写成经验分享，不写成硬广。

5. GitHub：
   - 发布首个宣传 issue 或 discussion，用来收集反馈。
   - 把常见问题整理回 README 或 docs。

验收：

- 至少发布 3 个中文开发者平台。
- 每个平台至少回复前 10 条评论。
- 收集不少于 15 条反馈。

解锁：

中文开发者圈有人开始讨论后进入第 4 关。

## 第 4 关：中文大众场景扩散

目标：

把技术卖点翻译成普通用户能理解的使用场景。

优先平台：

- Bilibili
- 小红书
- 即刻
- 微信公众号
- 视频号
- 少数派

任务：

1. Bilibili 视频：
   - 标题示例：`我做了一个不用网盘会员的大文件 P2P 分享工具`
   - 结构：痛点 15 秒，演示 90 秒，边界说明 30 秒，下载入口 15 秒。

2. 小红书 / 视频号：
   - 只讲一个场景：给朋友传大文件。
   - 不讲太多协议名。
   - 强调“双方需要在线”和“不是永久网盘”。

3. 即刻：
   - 发构建故事。
   - 发截图。
   - 发“今天修了哪个用户反馈”的连续动态。

4. 公众号 / 少数派：
   - 写产品故事长文。
   - 讲为什么不做云盘、不做付费保种市场。
   - 用图解释发布者、下载者、继续做种。

验收：

- 至少发布 1 个视频、1 篇长文、3 条短动态。
- 评论区至少出现 5 个真实使用问题。
- FAQ 根据评论新增或修改 5 条。

解锁：

普通用户能复述“不是云盘，是 P2P 分享”后进入第 5 关。

## 第 5 关：国际开源首发

目标：

把 MOST PEOPLE 推给国际开源、P2P、自托管和隐私工具圈。

优先平台：

- GitHub
- Hacker News Show HN
- Product Hunt
- Reddit
- X
- LinkedIn
- Mastodon / Bluesky
- Lobsters

任务：

1. 英文 GitHub README 检查：
   - 首屏清楚解释 local-first P2P toolbox。
   - 有截图或 GIF。
   - 有 installation、usage、FAQ。
   - 有 “Not cloud storage” 边界说明。

2. Hacker News：
   - 标题示例：`Show HN: MOST PEOPLE, a local-first P2P toolbox for file sharing`
   - 正文短、诚实、可试用。
   - 准备回答技术问题：CID、Hyperswarm、availability、security、NAT。

3. Product Hunt：
   - 提前准备 tagline、gallery、maker comment。
   - Tagline 示例：`A local-first P2P toolbox for sharing files with CID verification`
   - Maker comment 讲故事和边界，不夸大。

4. Reddit：
   - 优先考虑 `r/selfhosted`、`r/opensource`、`r/privacy`、`r/p2p`。
   - 发帖前读 subreddit 规则。
   - 用“Looking for feedback”语气。
   - 少贴多处，避免被认定为自我推广垃圾信息。

5. X / LinkedIn：
   - 连续发 7 天。
   - 每天只讲一个点：演示、架构、边界、开源、FAQ、用户反馈、下一步。

验收：

- 至少完成 3 个国际平台发布。
- Hacker News 或 Reddit 至少有 1 个帖子产生 10 条以上讨论。
- Product Hunt 页面完成素材和 maker comment。

解锁：

国际圈出现真实提问后进入第 6 关。

## 第 6 关：内容副本循环

目标：

用 14 天持续内容把一次发布变成持续曝光。

每日副本：

| 天数 | 主题 | 产出 |
| --- | --- | --- |
| D1 | 发布文件到 `most://` | 30 秒演示视频 |
| D2 | CID 为什么是内容身份 | 技术短文 |
| D3 | 下载者为什么继续做种 | 图解 |
| D4 | 它为什么不是云盘 | FAQ |
| D5 | NAS 做种场景 | 教程 |
| D6 | 大文件分享场景 | 用户故事 |
| D7 | 一周反馈复盘 | changelog |
| D8 | 管理台怎么看 holding | 截图讲解 |
| D9 | P2P 失败时怎么排查 | 故障指南 |
| D10 | 桌面端 vs npx | 对比说明 |
| D11 | 频道和工具箱能力 | 功能介绍 |
| D12 | Web3 工具箱为什么独立 | 边界说明 |
| D13 | 邀请开发者贡献 | good first issue 清单 |
| D14 | 二周发布总结 | 数据复盘 |

验收：

- 连续 14 天至少发布 10 条内容。
- 每条内容都有一个明确 CTA。
- 每 3 天根据评论修一次 FAQ。

解锁：

完成 14 天内容循环后进入第 7 关。

## 第 7 关：社区据点

目标：

把流量沉淀到可持续互动的地方。

任务：

1. 建立反馈入口：
   - GitHub Issues。
   - GitHub Discussions。
   - 微信群或频道。
   - Discord / Telegram，按目标用户选择。

2. 建立固定栏目：
   - 每周进展。
   - 用户问题答疑。
   - 测试任务征集。
   - 贡献者感谢。

3. 建立贡献路径：
   - 文档贡献。
   - 测试反馈。
   - 翻译。
   - 平台打包。
   - Bug 修复。

4. 做一个公开任务板：
   - 新手可做。
   - 需要测试。
   - 需要设计。
   - 需要真实设备。

验收：

- 至少 30 个用户进入一个社区据点。
- 至少 5 个外部用户提交 issue、反馈或 PR。
- 每周有一次公开更新。

解锁：

社区据点稳定后进入第 8 关。

## 第 8 关：Boss 战 - 全网发布周

目标：

集中打一波全网发布，让不同圈层在同一周看到 MOST PEOPLE。

发布节奏：

| 时间 | 平台 | 内容 |
| --- | --- | --- |
| 周一上午 | 官网、GitHub Release | 正式发布入口 |
| 周一中午 | V2EX、掘金 | 中文开发者首发 |
| 周一晚上 | Bilibili、即刻 | 演示视频和构建故事 |
| 周二 | 知乎、少数派、公众号 | 长文解释 |
| 周三 | Hacker News | Show HN |
| 周四 | Reddit、Lobsters | 国际技术讨论 |
| 周五 | Product Hunt | 产品发布 |
| 周末 | 全平台复盘 | 数据、反馈、下一步 |

Boss 战规则：

- 每个平台发布后 2 小时内集中回复评论。
- 争议问题不争吵，统一回到事实：P2P、CID、在线种子、不是云盘。
- 发现 bug 立即开 issue，并在评论区贴链接。
- 每天晚上整理当天反馈，第二天发布“我根据反馈改了什么”。

验收：

- 一周内完成 8 个以上平台发布。
- 获得 100 个以上 GitHub Star 或 300 个以上有效访问。
- 获得 30 条以上可执行反馈。
- 至少产出 1 篇发布周复盘。

## 第 9 关：数据面板

目标：

用数据判断宣传是否有效，而不是靠感觉。

核心指标：

| 指标 | 第一周目标 | 第一个月目标 |
| --- | --- | --- |
| GitHub Stars | 100+ | 500+ |
| 官网访问 | 3000+ | 15000+ |
| 桌面端下载 | 300+ | 1000+ |
| `npx most-box@latest` 试用 | 100+ | 500+ |
| 有效反馈 | 30+ | 150+ |
| Issue / PR | 10+ | 40+ |
| 真实长测用户 | 5+ | 20+ |

记录模板：

```text
日期:
平台:
发布链接:
标题:
曝光:
点击:
下载:
Star:
评论数:
有效反馈:
争议点:
下一步:
```

验收：

- 每个平台都有发布记录。
- 每周至少一次数据复盘。
- 能回答“哪个渠道带来了最多真实试用”。

## 第 10 关：长线主线

目标：

把一次宣传变成持续增长。

长期任务：

1. 每月发布一次进展总结。
2. 每月做一次真实文件长测：100MB、1GB、跨网络、发布者退出。
3. 持续维护 FAQ，把重复问题前置。
4. 建立“用户故事”页面。
5. 维护“适合谁 / 不适合谁”页面。
6. 邀请自托管、NAS、开源工具作者试用。
7. 把高质量 issue 标成 good first issue。

长期验收：

- 用户理解边界更清楚，误以为云盘的人减少。
- GitHub 上有人主动回答问题。
- 外部用户开始写教程、视频或文章。
- 每个版本发布都有可传播的故事。

## 可直接使用的文案

### 中文短版

```text
我做了一个 P2P 工具箱：MOST PEOPLE。

它的核心功能是用 most:// 链接分享文件。发布者在线时别人可以下载，下载完成的人会自动继续做种，所以文件可以像种子一样继续传播。

它不是云盘，不承诺永久保存，也不卖存储。CID 是内容身份，下载完成会重新计算 CID 校验。

欢迎试用、提 issue、给建议：
[官网]
[GitHub]
```

### 英文短版

```text
MOST PEOPLE is a local-first P2P toolbox.

Its core flow is simple: publish a file, get a most:// link, let others download and verify it by CID, and every completed downloader becomes a seeder by default.

It is not cloud storage. Availability comes from online peers.

Try it here:
[Website]
[GitHub]
```

### Hacker News 短版

```text
Show HN: MOST PEOPLE, a local-first P2P toolbox for file sharing

I built MOST PEOPLE / MostBox as a local-first P2P toolbox. The core file-sharing flow is:

publish a file -> get a most:// link -> another peer downloads and verifies it by CID -> the downloader becomes a seeder by default.

It is not cloud storage and does not promise permanent availability. Availability comes from online peers.

I would love feedback on the UX, the protocol boundaries, and whether the “not cloud storage” positioning is clear enough.

[Website]
[GitHub]
```

### Product Hunt Maker Comment

```text
Hi Product Hunt,

I built MOST PEOPLE, a local-first P2P toolbox centered on simple file sharing.

The main idea is to make the P2P flow understandable for normal users: publish a file, copy a most:// link, let someone download and verify the content by CID, and then that downloader keeps seeding by default.

This is not cloud storage. It does not promise permanent availability. The goal is honest P2P sharing with clear integrity checks and transparent limits.

I would love feedback on the onboarding, the wording, and whether the product explains the P2P tradeoffs clearly enough.
```

### Reddit 反馈帖短版

```text
I built a local-first P2P toolbox and would love feedback from self-hosted / open-source users.

The core flow is file sharing with most:// links:

1. publish a file locally
2. share the most:// link
3. the downloader verifies the file by CID
4. completed downloaders become seeders by default

It is not cloud storage, and availability depends on online peers.

I am mostly looking for feedback on whether the UX and documentation make those tradeoffs clear.

[GitHub]
[Website]
```

## 风险地图

| 风险 | 表现 | 处理方式 |
| --- | --- | --- |
| 被理解成云盘 | 用户问“文件会永久保存吗” | 反复强调不是云盘，可用性来自在线种子 |
| 被平台当广告 | Reddit / 社区删帖 | 按规则发反馈帖，少发链接，多参与讨论 |
| 技术门槛高 | 普通用户不懂 CID 和做种 | 用图和视频解释，不把协议名放首屏 |
| 首次体验卡住 | 用户不知道要启动本地节点 | 官网和 README 明确桌面端 / npx / Web 入口区别 |
| 下载失败引发负面反馈 | 没有种子、网络不通 | FAQ 提前写清排查步骤 |
| 宣传过度承诺 | 用户期待永久保存和不限条件下载 | 所有文案保留边界说明 |

## 平台规则复核清单

发布前逐项确认：

- Product Hunt 发布素材、tagline、maker comment 是否准备好。
- Hacker News 是否符合 Show HN：必须能让别人直接试用。
- Reddit 是否符合目标 subreddit 的自我推广规则。
- 中文社区是否需要避免标题党和重复顶帖。
- 每个平台是否有不同标题和开头。

参考入口：

- Product Hunt Launch: https://www.producthunt.com/launch
- Hacker News Show HN: https://news.ycombinator.com/showhn.html
- Reddit self-promotion: https://www.reddit.com/r/reddit.com/wiki/selfpromotion/

## 最终通关画面

当你完成这套任务时，理想状态不是“全网都看过一个广告”，而是：

- 开发者知道这是一个认真做协议边界的开源 P2P 项目。
- 普通用户知道它能解决“临时传大文件”的问题，但不是云盘。
- 自托管用户知道可以把 NAS 变成长期在线做种节点。
- 早期用户愿意帮你测试、反馈、写教程和传播。

这才是 MOST PEOPLE 作为 P2P 工具箱真正开始滚起来的时刻。
