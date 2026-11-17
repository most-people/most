# 文件传输

设计动机见 [CID drive 协议 v2](../cid-drive-protocol.md)；本文只描述线上行为。CID 参数与 `most://` 语法见 `identifiers.md`（待写），topic 加入与 DHT 见 `discovery.md`（待写）。

## 1. 概览

1. 下载者从链接得到 CID，计算 topic = CID 的 multihash digest（32 字节）。
2. 下载者以 `server: true, client: true` 加入文件 swarm 的该 topic。
3. 每条文件 swarm 连接上同时运行 Corestore 复制和 `most-cid-drive/2` 通道。
4. 下载者发 `want(topic)`；持有已校验内容的对端回 `have(topic, driveKey)`。
5. 下载者只读打开该 driveKey 的 Hyperdrive，读 `/<cid>`，重算 CID；一致才写入自己的 drive 并开始做种，否则换下一把 driveKey。

## 2. 文件 swarm 连接

每条文件 swarm 连接建立后，节点必须依次：

1. 在连接上调用 Corestore 复制（`store.replicate(conn)`）。
2. 在同一 noise 流的 Protomux 上打开 `most-cid-drive/2` 通道（见 §3）。

两者共用一个 Protomux 实例：Hypercore 复制与本通道是同一连接上的两个 Protomux 通道。

- 桌面：`server/src/index.js:676-684`
- 移动：`app/backend/mobile-core.mjs:619-622`

文件 swarm 与聊天 swarm 是两个独立的 Hyperswarm 实例，见 [discovery.md](discovery.md) §2。

## 3. `most-cid-drive/2` 通道

| 字段          | 值                 |
| ------------- | ------------------ |
| Protomux 协议 | `most-cid-drive/2` |
| 通道 id       | 无                 |
| 握手          | 无                 |

消息按注册顺序编号：

| 类型 | 名称   | 编码（compact-encoding） | 载荷                             |
| ---- | ------ | ------------------------ | -------------------------------- |
| 0    | `want` | `fixed32`                | `topic`（32 字节）               |
| 1    | `have` | `fixed64`                | `topic ‖ driveKey`（各 32 字节） |

`fixed32` / `fixed64` 是不带长度前缀的原始字节。

- 桌面：`server/src/core/cidDriveExchange.js:24-49`
- 移动：`app/backend/cid-drive-exchange.mjs:24-49`（与桌面逐行相同）

Protomux 帧本身（通道打开、消息类型前缀、变长整数）遵循上游 Protomux，见 [connection.md](connection.md) §1。

### 3.1 `want`

- 通道打开时，下载者对每个进行中的下载各发一次 `want`。
- 下载等待来源期间，每 2000 ms（`DRIVE_UPDATE_INTERVAL`）向所有已打开通道重发一次。
- 没有列表、通配或其他查询：请求方必须已知 topic（CID 即权限）。

桌面：`server/src/index.js:6270-6272`、`6323-6327`、`server/src/config.js:28`；移动：`app/backend/mobile-core.mjs:3030-3032`、`3081-3085`、`78`。

### 3.2 `have`

收到 `want(topic)` 时，只有同时满足以下条件才回答 `have(topic, driveKey)`，否则**不回答**（没有否定应答）：

1. 本节点已加入该 topic（文件 swarm）；
2. 本节点有该 CID 的 holding 记录；
3. 本节点自己的 CID drive（§4）中 `/<cid>` 可读。

`driveKey` 是该 drive 的 Hypercore 公钥（32 字节）。

桌面：`server/src/index.js:6279-6292`；移动：`app/backend/mobile-core.mjs:3036-3047`。

收到 `have` 时，若本节点当前没有该 topic 的进行中下载，丢弃；否则把 driveKey 加入该 topic 的候选集合（按到达顺序、去重）。

桌面：`server/src/index.js:6260-6265`；移动：`app/backend/mobile-core.mjs:3020-3025`。

### 3.3 示例

假设 topic 为 `11…11`、对端 driveKey 为 `22…22`（各 32 字节）：

```
want 载荷: 1111111111111111111111111111111111111111111111111111111111111111
have 载荷: 1111111111111111111111111111111111111111111111111111111111111111
           2222222222222222222222222222222222222222222222222222222222222222
```

真实 CID 的样本将放在 `vectors/`（待写）。

## 4. 每个节点自己的 CID drive

每个节点为每个 CID 使用一个只有自己能签名的 Hyperdrive：

```
topicHex  = hex(topic)                       // 64 个小写十六进制字符
tag       = hex(HMAC-SHA256(secret, "most-cid-drive-v2:" ‖ topicHex))
driveName = "cid-drive-" ‖ tag
```

drive 在 Corestore 中按 `store.namespace(driveName)` 打开。`secret` 是 32 字节本机私密值，不上线：

- 桌面：节点种子 `nodeSeed`（`server/src/index.js:592-593`）。
- 移动：数据目录下 `cid-drive-secret` 文件，内容为 64 位十六进制，首次启动随机生成（`app/backend/mobile-core.mjs:143-153`）。

派生：桌面 `server/src/core/cidDriveExchange.js:12-17`、`server/src/index.js:5483`；移动 `app/backend/cid-drive-exchange.mjs:12-17`、`app/backend/mobile-core.mjs:3007-3013`。

对端只能通过 `have` 得知 driveKey，无法从 CID 推出。driveName 与 secret 不是互通所需，第二个客户端可用任何方式生成自己 drive 的密钥对，只要满足「只有自己能签名」。

Corestore 主密钥当前为固定公开值（频道复制依赖它），见 `chat.md`（待写）。

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
   - 每 2000 ms 重发 `want`（§3.1）；
   - 取候选集合中第一个未尝试过的 driveKey；
   - 没有候选时，距上次查找满 5000 ms（`TOPIC_LOOKUP_INTERVAL`）就对该 topic 调用 `discovery.refresh()`，然后最多等 500 ms 或下一个 `have` 到达。
3. **读取与校验**：
   - 用只读会话打开对端 drive（`new Hyperdrive(store.session(), driveKey)`），等待 `/<cid>` 条目出现（最长 10 s，`STREAM_READ_TIMEOUT`）。
   - 桌面：若条目声明的 blob 大小超过 `maxFileSizeBytes`，中止。
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

## 8. 待补

- 下载截止时间默认值。
- 向量见 [vectors/](vectors/README.md)（`cid.json`、`file-transfer.json`）。
