# MostBox Android 聊天优先完整种子 MVP 计划

## 背景与目标

MostBox 当前桌面端已经切到聊天优先：用户先进入聊天/房间，再在聊天里传文件、整理知识库；游戏保留独立入口。Android 也应沿用同一产品主线，但移动端第一阶段仍必须守住更底层的能力：**Android 设备自身能在前台成为完整种子节点**。

第一阶段以 Android 为优先平台，采用 Bare/Pear 技术试验路线，目标不是一次性迁移所有桌面功能，而是跑通聊天入口和附件做种闭环：

```text
手机加入聊天房间
  -> 发送 P2P Channel 消息
  -> 选择文件作为聊天附件
  -> 计算 UnixFS CID v1
  -> 生成 most:// 分享链接并发进聊天
  -> Android 前台 join CID topic 并做种
  -> 其他 MostBox 节点凭链接下载
  -> 下载方重算 CID 校验通过
```

## 当前状态

截至 2026-06-26，Android 已具备聊天优先 Alpha 基础：

- Android 真机可启动 Expo / React Native UI 和 Bare Worklet P2P core。
- Android 与桌面 MostBox 节点已完成发布、下载、CID 校验和前台做种互通。
- Mobile core 已支持 Channel create/list/messages/presence，并通过 JSONL IPC 暴露给 React Native UI。
- Android 首屏展示节点状态、聊天房间、消息输入、附件发送、附件接收、holding、传输活动和日志。
- Android 发送附件会发布文件、得到 `most://<cid>?filename=...` 链接、把链接发进当前聊天，并在前台继续做种。
- Android 收到包含 `most://` 的聊天消息后，可把链接填入附件接收区并下载校验。
- 第一版 Android 内测包仍只承诺前台做种，不承诺长期后台在线或商店分发能力。

## 参考 Keet/Pear 的实现原则

Keet 值得参考的是产品和工程分层，而不是照搬通话、账号体系或公共社交模型。MostBox app 版本沿用这些原则：

- **聊天优先，不做公共社交平台**：移动端围绕用户主动分享的聊天房间工作，不做公开频道推荐、热榜或陌生人发现。
- **无中心化文件服务**：附件发布、发现、下载、校验和继续做种仍围绕 P2P 与 CID；不引入云端中转、云盘订单或托管存储。
- **核心端与 UI 壳分离**：把 CID、链接解析、topic 派生、holding、Hyperdrive 读写、Hyperswarm 复制和 Channel 同步放在可移植 P2P core；Android、iOS、桌面和 CLI 只通过命令/事件与 core 通信。
- **Android 先验证完整节点**：优先证明 Android 手机在前台能参与聊天和成为完整种子，再谈后台常驻、商店分发和 iOS 迁移。
- **同一协议，多端互通**：移动端不新增 `most://` 格式、不新增 topic 规则、不维护双协议；桌面、daemon、移动端必须共享同一 CID 校验、Hyperdrive key 和 Channel 约定。
- **隐私边界说清楚**：MostBox 不需要云端账号，但 P2P 连接天然会暴露网络可达信息；UI 和文档不能承诺“完全匿名”。

## MVP 范围

本 MVP 包含聊天入口和文件附件主线：

- Android App 前台启动完整 P2P 节点。
- 支持加入或创建私域聊天房间，并通过 Channel 收发消息。
- 支持房间 presence，显示在线参与者数量。
- 支持通过 Android 系统文件选择器导入文件，并作为聊天附件发布为 `most://<cid>?filename=...` 链接。
- 支持把附件链接发送到当前聊天房间。
- 支持从聊天消息中识别 `most://` 链接并填入附件接收区。
- 支持粘贴或打开 `most://` 链接，由 Android 节点下载文件。
- 下载完成后重算 UnixFS CID v1，只有 CID 与链接一致才保存。
- 发布成功和下载成功后，Android App 在前台默认继续做种。
- App 重启后恢复本机 holdings，并重新 join 对应 CID topic。
- UI 显示本机正在做种的 CID、文件名、大小、topic join 状态、peer 数和基础日志。
- 下载完成的文件通过 Android 系统分享/保存能力导出。

本 MVP 明确不包含：

- Android 长期后台常驻做种承诺。
- iOS 实现。
- 公开频道推荐、附近的人、热榜或大型群组治理。
- 移动端知识库完整迁移。
- 移动端游戏 UI 完整迁移。
- 移动端 Web3 工具箱迁移。
- 远程节点管理后台。
- 旧游戏频道或旧事件格式兼容。
- 上链存储、支付、订单、赏金、fraud proof 或云端下单。

## 技术路线

移动端采用 **React Native/Expo UI + Bare Worklet P2P core**：

- React Native/Expo 负责页面、按钮、文件选择器、分享面板、聊天房间和状态展示。
- Bare Worklet 负责运行 P2P 逻辑，并通过 RPC 与 UI 通信。
- P2P worker 使用 `bare-pack --target android --linked` 打包，优先验证 Android 真机可运行性。
- UI 与 worker 之间使用命令和事件通信，避免把 HTTP/Hono/WebSocket server 搬进移动端。

当前开发入口：

- Android 工程：`mobile/android/`
- UI 入口：`mobile/android/App.tsx`
- 移动端 core 接口：`mobile/android/src/mobileCore/`
- Bare Worklet 后端入口：`mobile/android/backend/backend.mjs`
- 当前 UI 已接入真实 Bare Worklet P2P core；Channel、Hyperswarm、Hyperdrive、CID 校验和 holdings 由 `mobile/android/backend/mobile-core.mjs` 提供。

Android 开发、测试和打包入口统一以 `mobile/android/` 子包脚本为准，仓库根目录不提供 `android:start`、`android:test` 或 `android:build` 包装脚本：

```bash
cd mobile/android
npm install
npm start
npm test
npm run build
```

需要保留的 MostBox 协议不变量：

- `most://<cid>?filename=...` 是原生分享链接格式。
- CID 是唯一内容身份，文件名只服务展示和保存路径。
- CID 使用 UnixFS CID v1。
- CID 显式参数保持 `cidVersion: 1`、`rawLeaves: true`、`wrapWithDirectory: false`。
- Hyperswarm topic 使用 `cid.multihash.digest`，不额外 hash、不截断、不替换规则。
- Hyperdrive 只存文件内容，key 固定为 `/<cid>`。
- 下载完成后必须重算 CID，通过后才能保存并加入 holdings。
- 普通聊天频道使用公共 Channel 系统；游戏频道如后续接入，仍使用 `game.<gameId>.<roomCode>`。

移动端 RPC 接口：

- Commands：`node.start`、`node.stop`、`file.publish`、`file.download`、`file.listHoldings`、`file.export`、`file.deleteHolding`、`channel.create`、`channel.list`、`channel.messages`、`channel.send`、`channel.presence.*`、`log.list`。
- Events：`node.ready`、`network.status`、`seed.status`、`publish.progress`、`publish.success`、`download.progress`、`download.success`、`channel.joined`、`channel.message`、`channel.status`、`channel.presence`、`error`。

## 分阶段实施计划

### Phase 0：Android 真机技术试验（已通过）

目标是先验证移动端 P2P runtime 是否可行，不做完整产品 UI。

- 基于 `bare-expo` 或等价模板创建最小 Android App。
- 使用 `react-native-bare-kit` 启动 Bare Worklet。
- 在 Worklet 中验证 Corestore 可持久化写入 App 沙盒。
- 验证 Hyperdrive 可写入和读取 `/<cid>` 文件。
- 验证 Hyperswarm 可 join topic，并与桌面 MostBox 节点建立连接。
- 验证 Android 真机前台可从桌面种子拉取一个小文件并重算 CID 通过。

Phase 0 已在 Android 真机通过。若后续升级 Hyperswarm、Corestore、Hyperdrive、Bare Worklet 或 React Native 原生依赖，仍需重新跑本阶段关键检查。

### Phase 1：最小文件引擎（已具备内测能力）

目标是实现 Android 前台完整种子的文件闭环。

- 抽取或复用 CID、most link、topic digest 等纯协议逻辑。
- 实现移动端 holdings 存储，避免污染用户可见文件管理视图。
- 实现发布：系统文件选择器导入文件、计算 CID、写入 Hyperdrive、记录 holding、join topic。
- 实现下载：解析 `most://`、发现 peer、读取 Hyperdrive 中精确 `/<cid>` 文件、重算 CID、写入本机 Hyperdrive、记录 holding。
- 实现 App 前台启动时恢复 holdings，并批量重新 join CID topic。
- 实现基础日志和状态事件，供 UI 展示。

### Phase 2：聊天入口与 Android UI（当前）

目标是让移动端进入 MostBox 时也围绕聊天组织能力。

- 首屏显示节点状态、聊天房间、消息列表、在线 presence、附件发送、附件接收、正在做种列表和最近日志。
- 聊天房间使用移动端 Channel RPC，不新增 Android 专用后端协议。
- 发送附件时复用文件发布逻辑，发布成功后把 `most://` 链接发进当前聊天。
- 接收附件时从聊天消息中识别 `most://` 链接，再走现有下载和 CID 校验流程。
- 文件详情显示 CID、文件名、大小、状态，并支持通过系统分享/保存导出。
- App 进入后台或系统暂停时，UI 明确提示做种可能暂停；不展示“后台持续在线”的承诺。

### Phase 3：互操作验收与内测（当前重点）

目标是确认 Android 节点与现有桌面/daemon 协议完全互通。

- Android 与桌面加入同一聊天房间并双向收发消息。
- Android 发送附件，桌面从聊天中拿到 `most://` 链接并下载校验通过。
- 桌面发送附件链接，Android 从聊天消息接收并下载校验通过。
- 桌面发布者退出后，第二个桌面节点从 Android 前台种子下载并校验通过。
- Android 发布，桌面节点凭 `most://` 链接下载并校验通过。
- Android 重启 App 后恢复 holdings，并能继续向桌面节点供种。
- 使用本地 Android Studio + 真机做调试，并准备 APK 内测包。

内测包交付入口：

- `cd mobile/android && npm test`：运行移动端 CID、`most://` 链接协议、Channel core 和 JSONL IPC 测试。
- `cd mobile/android && npm run build`：生成版本化 APK `mobile/android/dist/mostbox-android-<version>-release.apk` 和 SHA256 校验文件。
- `docs/mobile-android-alpha.md`：记录每轮真机复测的设备、网络、房间、CID、耗时、结果和失败日志摘要。

## 验收场景

MVP 通过标准：

- Android 真机前台可以启动 P2P 节点，并显示节点 ready/在线状态。
- Android 可以加入或创建聊天房间。
- Android 与桌面 MostBox 能通过同一 Channel 双向收发消息。
- Android 发送附件后，聊天中出现稳定 `most://` 链接。
- 桌面 MostBox 可以凭 Android 附件链接下载并通过 CID 校验。
- 桌面发送的附件链接可以被 Android 接收、下载、校验并加入 holdings。
- 桌面发布者退出后，只要 Android App 仍在前台做种，新下载者仍能完成下载并校验。
- Android 下载桌面发布的文件后，默认把该文件加入做种列表。
- Android App 重启后自动恢复 holdings，并重新 join 对应 CID topic。
- 用户可以看到 CID、文件大小、topic join 状态、peer 数、聊天 presence 和基础日志。

## 风险与假设

关键风险：

- Bare/Pear 在 Android 真机上对 Hyperswarm、Corestore、Hyperdrive 和相关 native addon 的支持可能存在兼容缺口。
- Android 后台执行、电池优化、厂商省电策略会影响持续做种，第一版不能承诺长期后台在线。
- 大文件会放大存储、内存、文件导入导出和系统中断恢复风险。
- 移动端聊天当前以 Channel 文本消息和 `most://` 附件链接为主，尚未迁移桌面端完整聊天 UI、知识库完整能力或游戏入口。
- 当前桌面 daemon 中存在大量 Node-only 依赖，移动端应抽取协议核心，而不是直接搬运整个 `server/index.js`。

默认假设：

- 第一阶段只做 Android。
- 使用本地 Android Studio + Android 真机调试。
- 第一阶段只承诺 App 前台可做种。
- 文件进出使用 Android 系统文件选择器和系统分享/保存能力。
- iOS、后台长期做种、移动端完整记录/游戏/Web3 迁移都不进入本轮范围。

## iOS 后续路线

Android MVP 验证通过后，再启动 iOS 适配。iOS 复用同一个 P2P core、RPC 协议和 MostBox 文件分享协议，只替换平台 UI、文件访问、deep link、系统分享和后台限制处理。

## 参考资料

- [Pear Bare Mobile Guide](https://docs.pears.com/guide/making-a-bare-mobile-app/)
- [Bare Runtime](https://bare.pears.com/)
- [Pear Docs](https://docs.pears.com/)
- [Hyperswarm 文档](https://hypercore-protocol.github.io/new-website/guides/modules/hyperswarm/)
- [Android app links](https://developer.android.com/training/app-links)
- [Android background work](https://developer.android.com/develop/background-work/background-tasks)
