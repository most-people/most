# MostBox iOS 完整种子 MVP 计划

## 背景与目标

MostBox 当前桌面端通过本地 Node daemon 运行 Hyperswarm、Hyperdrive 和 Corestore，完成发布、下载、CID 校验和持续做种。移动端如果只做远程节点前端，成本较低；但本计划的目标是验证更进一步的能力：**iOS 设备自身也能成为完整种子节点**。

第一阶段以 iOS 为优先平台，采用 Bare/Pear 技术试验路线，目标不是一次性迁移所有桌面功能，而是跑通 MostBox 文件分享的最小闭环：

```text
手机导入文件
  -> 计算 UnixFS CID v1
  -> 生成 most:// 分享链接
  -> iOS 前台 join CID topic 并做种
  -> 其他 MostBox 节点凭链接下载
  -> 下载方重算 CID 校验通过
```

## MVP 范围

本 MVP 只包含文件分享主线：

- iOS App 前台启动完整 P2P 节点。
- 支持通过系统文件选择器导入文件，并发布为 `most://<cid>?filename=...` 链接。
- 支持粘贴或打开 `most://` 链接，由 iOS 节点下载文件。
- 下载完成后重算 UnixFS CID v1，只有 CID 与链接一致才保存。
- 发布成功和下载成功后，iOS App 在前台默认继续做种。
- App 重启后恢复本机 holdings，并重新 join 对应 CID topic。
- UI 显示本机正在做种的 CID、文件名、大小、topic join 状态、peer 数和基础日志。
- 下载完成的文件通过 iOS 系统分享/保存能力导出。

本 MVP 明确不包含：

- iOS 长期后台做种承诺。
- Android 实现。
- 聊天、游戏、笔记、Web3 工具箱。
- 远程节点管理后台。
- 旧游戏频道或旧事件格式兼容。
- 上链存储、支付、订单、赏金、fraud proof 或云端下单。

## 技术路线

移动端采用 **React Native/Expo UI + Bare Worklet P2P core**：

- React Native/Expo 负责页面、按钮、文件选择器、分享面板和状态展示。
- Bare Worklet 负责运行 P2P 逻辑，并通过 RPC 与 UI 通信。
- P2P worker 使用 `bare-pack --target ios --linked` 打包，优先验证 iOS 真机可运行性。
- UI 与 worker 之间使用命令和事件通信，避免把 HTTP/Hono/WebSocket server 搬进移动端。

需要保留的 MostBox 协议不变量：

- `most://<cid>?filename=...` 是原生分享链接格式。
- CID 是唯一内容身份，文件名只服务展示和保存路径。
- CID 使用 UnixFS CID v1。
- CID 显式参数保持 `cidVersion: 1`、`rawLeaves: true`、`wrapWithDirectory: false`。
- Hyperswarm topic 使用 `cid.multihash.digest`，不额外 hash、不截断、不替换规则。
- Hyperdrive 只存文件内容，key 固定为 `/<cid>`。
- 下载完成后必须重算 CID，通过后才能保存并加入 holdings。

建议的移动端 RPC 接口：

- Commands：`node.start`、`node.stop`、`file.publish`、`file.download`、`file.listHoldings`、`file.export`、`log.list`。
- Events：`node.ready`、`network.status`、`seed.status`、`publish.progress`、`publish.success`、`download.progress`、`download.success`、`error`。

## 分阶段实施计划

### Phase 0：iOS 真机技术试验

目标是先验证移动端 P2P runtime 是否可行，不做完整产品 UI。

- 基于 `bare-expo` 或等价模板创建最小 iOS App。
- 使用 `react-native-bare-kit` 启动 Bare Worklet。
- 在 Worklet 中验证 Corestore 可持久化写入 App 沙盒。
- 验证 Hyperdrive 可写入和读取 `/<cid>` 文件。
- 验证 Hyperswarm 可 join topic，并与桌面 MostBox 节点建立连接。
- 验证 iOS 真机前台可从桌面种子拉取一个小文件并重算 CID 通过。

Phase 0 成功后再进入功能开发；如果 Hyperswarm/Corestore/Hyperdrive 任一关键模块无法在 iOS 真机跑通，需要暂停并重新评估 native/Rust 或其他 runtime 方案。

### Phase 1：最小文件引擎

目标是实现 iOS 前台完整种子的文件闭环。

- 抽取或复用 CID、most link、topic digest 等纯协议逻辑。
- 实现移动端 holdings 存储，避免污染用户可见文件管理视图。
- 实现发布：系统文件选择器导入文件、计算 CID、写入 Hyperdrive、记录 holding、join topic。
- 实现下载：解析 `most://`、发现 peer、读取 Hyperdrive 中精确 `/<cid>` 文件、重算 CID、写入本机 Hyperdrive、记录 holding。
- 实现 App 前台启动时恢复 holdings，并批量重新 join CID topic。
- 实现基础日志和状态事件，供 UI 展示。

### Phase 2：iOS UI 与文件进出

目标是让技术闭环具备可手动验收的 App 体验。

- 首页显示节点状态、peer 数、正在做种列表和最近日志。
- 发布页支持选择文件、显示 CID 计算进度、复制分享链接。
- 下载页支持粘贴 `most://` 链接、检查/启动下载、显示进度和校验结果。
- 文件详情页显示 CID、文件名、大小、状态，并支持通过系统分享/保存导出。
- App 进入后台或系统暂停时，UI 明确提示做种可能暂停；不展示“后台持续在线”的承诺。

### Phase 3：互操作验收与内测

目标是确认 iOS 节点与现有桌面/daemon 协议完全互通。

- 桌面发布，iOS 下载并前台做种。
- 桌面发布者退出后，第二个桌面节点从 iOS 前台种子下载并校验通过。
- iOS 发布，桌面节点凭 `most://` 链接下载并校验通过。
- iOS 重启 App 后恢复 holdings，并能继续向桌面节点供种。
- 使用本地 Mac + Xcode 做 iOS 真机调试和 TestFlight 内测包准备。

## 验收场景

MVP 通过标准：

- iOS 真机前台可以启动 P2P 节点，并显示节点 ready 状态。
- iOS 发布文件得到稳定 `most://` 链接。
- 桌面 MostBox 可以凭 iOS 链接下载并通过 CID 校验。
- 桌面发布者退出后，只要 iOS App 仍在前台做种，新下载者仍能完成下载并校验。
- iOS 下载桌面发布的文件后，默认把该文件加入做种列表。
- iOS App 重启后自动恢复 holdings，并重新 join 对应 CID topic。
- 用户可以看到 CID、文件大小、topic join 状态和基础日志。

## 风险与假设

关键风险：

- Bare/Pear 在 iOS 真机上对 Hyperswarm、Corestore、Hyperdrive 和相关 native addon 的支持可能存在兼容缺口。
- iOS 对后台执行限制严格，第一版不能承诺长期后台在线做种。
- 大文件会放大存储、内存、文件导入导出和系统中断恢复风险。
- 当前桌面 daemon 中存在大量 Node-only 依赖，移动端应抽取协议核心，而不是直接搬运整个 `server/index.js`。

默认假设：

- 第一阶段只做 iOS。
- 使用本地 Mac + Xcode 做真机调试。
- 第一阶段只承诺 App 前台可做种。
- 文件进出使用 iOS 系统文件选择器和系统分享/保存能力。
- Android、后台长期做种、聊天/游戏/笔记/Web3 迁移都不进入本轮范围。

## 参考资料

- [Pear Bare Mobile Guide](https://docs.pears.com/guide/making-a-bare-mobile-app/)
- [Bare Runtime](https://bare.pears.com/)
- [Pear Docs](https://docs.pears.com/)
- [Hyperswarm 文档](https://hypercore-protocol.github.io/new-website/guides/modules/hyperswarm/)
- [Apple Background Execution](https://developer.apple.com/documentation/xcode/configuring-background-execution-modes)
