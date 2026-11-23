# 文件传输

本篇定义完整副本的读取、校验与接力。CID 与链接见 [标识符](identifiers.md)；通道字节和权限证明见 [文件访问](file-privacy.md)。

## 1. 闭环

1. 从链接取得 CID，计算 `topic = H("topic/file", CID.multihash.digest)`。
2. 以 server/client 双模式加入文件 swarm 的该 topic。
3. 在连接上运行 Corestore 复制和 `most-cid-drive/3`；下载者发带证明的 `want`，已持有内容的节点才回 `have`。
4. 按到达顺序只读尝试对方 drive 中精确的 `/<cid>`，完整下载后重算 UnixFS CID。
5. 只有 CID 一致才写入自己的 drive、记录 holding 并做种；失败换来源。

## 2. 文件连接

在同一 Noise 流的 Protomux 上运行 `store.replicate(conn)` 和文件交换通道，不能各自另开复用器。Hypercore 通道负责传块，MostBox 通道只交换发现 drive 所需的信息；上游帧见 [连接](connection.md) §1。

## 3. 文件交换通道

`most-cid-drive/3` 无通道 id，handshake 为 32 字节 challenge。消息 0 `want` 与消息 1 `have` 均为 `fixed64`、无长度前缀，分别为 `topic ‖ proof` 和 `topic ‖ driveKey`。证明计算、端点密钥与拒绝条件完整定义于 [文件访问](file-privacy.md) §4，不能只凭 topic 回应。

收到 `have` 时，仅对当前进行中的 topic 收集 driveKey，按到达顺序去重；没有进行中下载则忽略。driveKey 是 Hyperdrive 元数据 core 的 32 字节 key。完整载荷向量见 `../vectors/v2/file.json`。

## 4. 自己的 CID drive

每节点每 CID 一个自己可写的 Hyperdrive，只提供自己的副本。参考实现以 `store.namespace(driveName)` 打开，`driveName = "cid-drive-" ‖ hex(MAC(secret, "cid-drive/name", topic))`；topic 是原始 32 字节。桌面 secret 为持久节点种子，移动为持久 `node-secret`，均不上线。

第三方可用自己的本地密钥管理方式，但必须保证其他种子不能为其写入签名，且按相同线上协议交付正确内容。driveName 和 secret 无需交换。旧数据的具体迁移边界见 [文件访问](file-privacy.md) §8。

## 5. drive 内布局

### 5.1 单文件

| 路径     | 内容                            |
| -------- | ------------------------------- |
| `/<cid>` | 文件完整字节（Hyperdrive blob） |

drive 中只能有精确的 `/<cid>`；文件名、用户路径和 metadata 不得写入 drive。

桌面：`server/src/index.js:1898-1920`；移动：`app/backend/protocol.mjs:1`、`67-69`。

### 5.2 目录集合（仅桌面）

当 CID 的 codec 是 dag-pb（`0x70`）且根块是 UnixFS 目录时：

| 路径             | 内容                               |
| ---------------- | ---------------------------------- |
| `/<rootCid>`     | 根目录块的 dag-pb 原始字节         |
| `/.unixfs/<cid>` | 子目录块的 dag-pb 原始字节（递归） |

目录中的文件不放在这个 drive 里：每个文件按自己的 CID 作为独立单文件下载（§5.1），各自有自己的 topic 和 drive。

读取每个块时必须重算 `CIDv1(dag-pb, sha256(block))` 并与期望一致，否则视为该来源错误。

桌面：`server/src/index.js:3301-3346`（读块与复制）、`3348-3390`（判定与读取目录）、`3600-3645`（遍历）、`3453`起（逐个下载子文件）。

两端差异：移动端未实现目录集合，所有 CID 都按 §5.1 单文件处理。

## 6. 下载流程

1. **先试本机 drive**：若自己的 drive 中 `/<cid>` 可读，先用它（仍走第 3 步校验）。用于 holding 记录丢失后的恢复。
2. **等待来源**：在截止时间内循环——
   - 每 2000 ms 重发 `want`（[文件访问](file-privacy.md) §4.4）；
   - 取候选集合中第一个未尝试过的 driveKey；
   - 没有候选时，距上次查找满 5000 ms（`TOPIC_LOOKUP_INTERVAL`）就对该 topic 调用 `discovery.refresh()`，然后最多等 500 ms 或下一个 `have` 到达。
3. **读取与校验**：
   - 用只读会话打开对端 drive（`new Hyperdrive(store.session(), driveKey)`；关闭 drive 会关闭传入会话，因此不得传主 store），等待 `/<cid>` 条目出现（最长 10 s，`STREAM_READ_TIMEOUT`）。
   - 桌面：若条目声明的 blob 大小超过 `maxFileSizeBytes`，中止；读取字节超出声明大小也中止。
   - 读取全部字节到临时文件，流停滞超时则失败。
   - 用与发布相同的参数重算 UnixFS CID v1。
4. **结果**：
   - 一致：写入自己的 drive `/<cid>`，确认可读，记录 holding，加入 topic（之后即可回答 `have`）。
   - 不一致：删除临时文件，本次下载内不再尝试该 driveKey，回到第 2 步。
   - 截止时间到仍无成功：失败；若曾出现过不一致，报告完整性错误，否则报告未找到来源。

每个 driveKey 在一次下载中只尝试一次。没有多源并行、没有持久信誉。

桌面：`server/src/index.js:6296-6385`（等待来源）、`1656-1935`（读取、校验、写入）；移动：`app/backend/mobile-core.mjs:3055` 起（等待来源）、`1202-1370`（读取、校验、写入）。

两端差异：移动端把下载写到 `<downloadPath>/<cid>.part` 并支持续传；若校验失败且本次用了续传的旧字节，删除 `.part` 后对同一来源从 0 重试一次（`app/backend/mobile-core.mjs:1339-1351`）。桌面每次从 0 读。

两端差异：移动端没有 `maxFileSizeBytes` 检查（`app/backend/mobile-core.mjs:1275` 只读取声明大小用于进度），与 AGENTS.md 中 F2 的「不超过 `maxFileSizeBytes`」口径不一致。

## 7. 时间常量

| 名称                         | 值       | 桌面                      | 移动                             |
| ---------------------------- | -------- | ------------------------- | -------------------------------- |
| `DRIVE_UPDATE_INTERVAL`      | 2000 ms  | `server/src/config.js:28` | `app/backend/mobile-core.mjs:78` |
| `TOPIC_LOOKUP_INTERVAL`      | 5000 ms  | `server/src/config.js:30` | `app/backend/mobile-core.mjs:80` |
| `DOWNLOAD_POLL_INTERVAL_MIN` | 500 ms   | `server/src/config.js:26` | `app/backend/mobile-core.mjs:76` |
| `STREAM_READ_TIMEOUT`        | 10000 ms | `server/src/config.js:20` | `app/backend/mobile-core.mjs:74` |

这些是本地节奏，不影响互通；列出是为了让第二个客户端的发现时间可比。

## 8. 做种、边界与验证

发布或校验下载成功后默认持续做种，除非用户暂停、删除文件或关闭应用；重启从本地记录恢复加入。持有记录、文件列表与实际可读内容必须一致，恢复时不能仅凭 metadata 报告“已有”。坏来源的临时文件不进入 holding，坏 core 与诚实种子的 core 分离。

没有种子在线时不能下载；复制文字 core 不传输附件字节。附件由用户点击后下载是 [群聊模型](../../chat-model.md)的产品要求，客户端全端行为仍待核对和验收，不以文档整合认定完成。当前不提供永久存储、多源并行、持久信誉或边下载边校验。

下载截止时间由调用入口给定，不是网络常量。桌面和移动的具体默认值应以调用方参数核对；不能把 §7 的单次流超时当作总下载时限。F1–F5 及量化门槛见 [验收指南](../../acceptance.md)，已有结果与移动大小上限缺口见 [验证状态](../../validation-status.md)。

---

[目录](README.md) · 上一篇：[文件发现与访问证明](file-privacy.md) · 下一篇：[语音信令](voice.md)
