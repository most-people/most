# 聊天

本文定义频道在线上如何握手、交换 writer core、存储和排序消息、同步在线状态，以及账号同步帧。topic 见 [discovery.md](discovery.md)，节点密钥与 peerId 见 [connection.md](connection.md)，语音信令见 [voice.md](voice.md)。

## 1. 模型

- 一个频道由若干 **writer core** 组成：每个参与节点在该频道下有自己的单写者 Hypercore，只追加自己的消息。
- 频道历史 = 本机持有的所有 writer core 中已到达的条目，合并、去重、排序。
- writer core 经**文件 swarm** 上的 Corestore 复制传输；节点在**聊天 swarm** 上用 `channel-hello` 告诉对方自己知道哪些 writer core key。
- 聊天 swarm 的帧只在通过**频道持有证明**之后才带频道内容。

没有中心服务器、没有全局顺序、没有消息签名之外的身份认证（见 §6.3）。

## 2. 聊天 swarm 帧

- 加密流上直接传 UTF-8 JSON，每帧以 `\n`（0x0a）结尾，接收方对每帧 `trim()` 后 `JSON.parse`，空行忽略。
- 单帧上限 131072 字节（128 KiB，不含 `\n`）；未结束的缓冲超过上限时，接收方必须关闭连接。
- 单帧解析失败只丢弃该帧。
- 未知 `type` 必须忽略。

桌面：`server/src/core/channelFrames.js:1-50`、`server/src/index.js:7618-7690`；移动：`app/backend/channel-protocol.mjs:245-290`、`app/backend/mobile-core.mjs:2885-2960`。

### 2.1 帧类型

| `type`                    | 方向 | 需要持有证明 | 用途                     | 本文                 |
| ------------------------- | ---- | ------------ | ------------------------ | -------------------- |
| `channel-proof-challenge` | 双向 | 否           | 发出本端挑战             | §3                   |
| `channel-scope`           | 双向 | 否           | 声明本端持有的 topic     | §3                   |
| `channel-proof`           | 双向 | 否           | 对对方挑战的证明         | §3                   |
| `channel-hello`           | 双向 | 是           | 频道元数据与 writer core | §4                   |
| `channel-presence`        | 双向 | 是           | 在线状态                 | §7                   |
| `channel-voice`           | 双向 | 是           | 语音信令（仅桌面）       | [voice.md](voice.md) |
| `account-hello`           | 双向 | 否（加密）   | 账号同步（仅桌面）       | §8                   |

处理顺序：`account-hello` → `channel-scope` → `channel-proof-challenge` → `channel-proof` → `channel-presence` / `channel-voice` / `channel-hello`。

## 3. 频道持有证明

目的：对方必须证明自己知道频道 ID，本端才会发送该频道的 hello、在线状态和语音信令。连接上的每个 topic 单独授权。

### 3.1 流程

连接建立时（以及之后该连接新增 topic 时）每端：

1. 发一次 `channel-proof-challenge`（每条连接只生成一次挑战）：

   ```json
   {
     "type": "channel-proof-challenge",
     "version": 1,
     "challenge": "<32 字节随机数，64 位小写十六进制>"
   }
   ```

2. 发 `channel-scope`，列出**本端已知该连接相关**的 topic（Hyperswarm 记录的、经由哪些 topic 发现该对端，且本端持有对应频道），每帧最多 256 个，多则分帧：

   ```json
   { "type": "channel-scope", "topics": ["<64 位十六进制>", "..."] }
   ```

3. 收到对方挑战后，对「本端已知该连接相关的 topic」与「对方 scope 中本端也持有的 topic」中尚未证明过的每一个，计算证明并发 `channel-proof`（每帧最多 256 项）：

   ```json
   {
     "type": "channel-proof",
     "version": 1,
     "challenge": "<对方的挑战>",
     "proofs": [{ "topic": "<hex>", "proof": "<hex>" }]
   }
   ```

4. 收到 `channel-proof` 时，要求 `version === 1`、`challenge` 等于本端挑战、`proofs` 不超过 256 项；对其中本端也认为相关且尚未授权的 topic，验证通过即授权。有新授权时，立即向该连接发 hello 与当前在线状态。

可接受的 topic 只有本端持有频道的「频道聊天」topic 与「频道候选」topic（discovery §3）。挑战不匹配、`version` 不对或证明错误时静默忽略，不断开连接。收到第二个不同的挑战时忽略。

### 3.2 证明

```
proofKey = sha256("most-box-channel-proof-key-v1" ‖ 0x00 ‖ channelId)
proof    = hex(HMAC-SHA256(proofKey,
             "most-box-channel-proof-response-v1" ‖ 0x00
             ‖ topic(32 字节) ‖ challenge(32 字节)
             ‖ proverPublicKey(32 字节) ‖ verifierPublicKey(32 字节)))
```

- `channelId` 为规范化后的频道 ID（UTF-8）。
- `topic`、`challenge` 由十六进制解码为字节。
- `proverPublicKey` 是证明方、`verifierPublicKey` 是验证方在**聊天 swarm**中的连接公钥（即对端看到的 `remotePublicKey`），使证明不能转发到别的连接。
- 比较使用常数时间比较。

示例（两端实现结果一致）：

```
channelId          general
topic              ebd4418a7b9077c92cb9e6066e0d1b9f8f47ba243a74bee33b8069e43a419b4c   (频道聊天 topic)
challenge          1111…11（32 字节）
proverPublicKey    2222…22（32 字节）
verifierPublicKey  3333…33（32 字节）
proof              ce2f7d7a28ad522db1409094db8e3c95debc995f28635acb538f47514728af09
```

桌面：`server/src/core/channelHello.js:9-150`、`server/src/index.js:7016-7130`、`7388-7478`；移动：`app/backend/channel-protocol.mjs:21-196`、`app/backend/mobile-core.mjs:2002-2140`、`2668-2756`。

安全性说明：知道频道 ID 即可算出证明，这与「频道 ID 即权限」一致；证明只防止不知道频道 ID 的人仅凭 DHT 上看到的 topic 获得频道内容。

## 4. `channel-hello`

```json
{
  "type": "channel-hello",
  "peerId": "<文件 swarm 公钥 hex>",
  "authorName": "<peerId 前 4 字符>",
  "channels": [
    {
      "channelId": "general",
      "channelKey": "general",
      "type": "personal",
      "createdAt": "2026-11-18T00:00:00.000Z",
      "lastMessageAt": "2026-11-18T01:02:03.000Z",
      "memberAddresses": ["0x…"],
      "writerCoreKeys": ["<64 位十六进制>", "..."]
    }
  ]
}
```

- `channels` 只包含该连接上**已授权**的频道。没有授权频道时不发 hello。
- 一帧超过 128 KiB 时按频道拆成多帧；单个频道项本身超限时报错不发。
- `writerCoreKeys` 包含本机已知的全部 writer core key（含自己的）。
- 接收方：忽略 `peerId` 为空或等于自己的 hello；忽略未授权频道；对本机也持有的频道，把新的 writer core key 加入频道并打开（§5.3）；不持有的频道作为候选缓存 30 秒（discovery §3.2）。

发送时机：连接建立、连接新增 topic、新授权、本机 writer core 变化、成员资料变化；桌面在从 hello 学到新 writer key 后也会向所有连接重发。

桌面：`server/src/core/channelHello.js:152-192`、`server/src/index.js:7251-7330`、`7479-7590`；移动：`app/backend/channel-protocol.mjs:197-243`、`app/backend/mobile-core.mjs:2152-2230`、`2814-2883`。

两端差异：

- 移动 hello 不带 `memberAddresses`，接收时也忽略它。
- 移动从 hello 学到新 writer key 后不重发 hello；只经过移动节点相连的两端要等下一次其他触发才能互相得知对方的 writer core。
- `type` 默认值：桌面 `personal`，移动 `public`；接收方缺省按 `public`。
- writer core key 两端都不校验格式与数量上限，无效 key 在打开时失败并被忽略。

## 5. Writer core

### 5.1 位置与密钥

```
namespace = store.namespace("channel-" ‖ channelKey)
core      = namespace.get({ name: "messages-" ‖ writerId, valueEncoding: "json" })
```

Corestore 主密钥是固定公开值：32 字节，用 ASCII 字符串 `most-box-global-shared-seed-v1` 循环填满（`b4a.alloc(32).fill(...)`）。Corestore 由 `(primaryKey, namespace, name)` 确定性派生 core 的密钥对，因此 **writer core 私钥的保密性完全取决于 `writerId`**：

| 端   | `writerId`                                                | 熵                          |
| ---- | --------------------------------------------------------- | --------------------------- |
| 桌面 | 8 字节 CSPRNG，16 位十六进制                              | 64 位                       |
| 移动 | `Math.random()` 的 8 位十六进制 ‖ `Date.now()` 的十六进制 | 约 32 位非密码学随机 + 时间 |

`writerId` 不上线，但移动端的取值空间小到可以离线穷举：猜中后即可为该 writer core 签名，冒充其写入消息。这是现状记录，修复属于阶段 2（Corestore 主密钥）。

桌面：`server/src/index.js:594-596`、`server/src/config.js:13`、`4569-4590`、`4679-4740`、`server/src/core/channelIdentity.js:8`、`27-29`；移动：`app/backend/mobile-core.mjs:70`、`602-606`、`1600-1612`、`app/backend/channel-protocol.mjs:433-435`；Corestore：`node_modules/corestore/index.js` `deriveSeed`、`createKeyPair`。

### 5.2 复制

所有节点在同一 namespace 下打开同一个 key，因此 Hypercore discoveryKey 相同；双方在文件 swarm 上通过「频道复制」topic 相遇，`store.replicate(conn)` 自动复制双方都打开的 core。

### 5.3 打开远端 core

按 hello 中的 key 在同一 namespace 下只读打开，并请求全部块：`core.download({ start: 0, end: -1 })`（包括之后追加的块）。

读历史、启动重放、发送前扫描都只读本地已有块：`core.get(i, { wait: false })`，遇到缺块即停止该 core 的扫描，下次再继续。否则作者离线时读取会挂起。

桌面：`server/src/index.js:7201-7250`、`4237-4280`、`5380-5423`；移动：`app/backend/mobile-core.mjs:1963-1990`、`1849-1873`。

## 6. 消息

### 6.1 条目格式

每个块是一个 JSON 对象（Hypercore `valueEncoding: json`，即 UTF-8 JSON 字节）：

| 字段              | 类型   | 说明                                                                             |
| ----------------- | ------ | -------------------------------------------------------------------------------- |
| `type`            | 字符串 | `message` 或 `system`；其他值不属于历史                                          |
| `author`          | 字符串 | 账号地址（`0x` + 40 位十六进制）；诊断消息用 `0x000…001`                         |
| `authorName`      | 字符串 | 显示名，最多 50 字符，空时为地址前 10 字符                                       |
| `content`         | 字符串 | 去首尾空白后非空；桌面最多 10000、移动最多 2000 字符（UTF-16 长度）              |
| `timestamp`       | 数字   | 毫秒，见 §6.2                                                                    |
| `clientMessageId` | 字符串 | 可选，UUID v4 小写                                                               |
| `authorTag`       | 对象   | 可选，本地化标签：键为语言标签或 `default`，值为不超过 50 码点的文本，最多 16 项 |
| `avatar`          | 字符串 | 可选，最多 4096 字符                                                             |
| `attachment`      | 对象   | 可选，§6.4                                                                       |
| `mentions`        | 数组   | 可选，§6.5；有附件时不得有提及                                                   |
| `event`           | 字符串 | `system` 条目的事件名，§6.6                                                      |
| `member`          | 对象   | `channel.member.profile.updated` 的资料，§6.6                                    |

示例：

```json
{
  "type": "message",
  "author": "0x1111111111111111111111111111111111111111",
  "authorName": "alice#1111",
  "content": "hi",
  "timestamp": 1795000000000,
  "clientMessageId": "0b9a3c1e-2f4d-4a6b-8c7d-9e0f1a2b3c4d"
}
```

桌面：`server/src/index.js:4318-4460`、`server/src/core/channelMessage.js`、`server/src/core/shared.js:12-21`、`server/src/utils/chatLabels.js:1-52`、`server/src/config.js:56`；移动：`app/backend/channel-protocol.mjs:561-607`、`app/backend/mobile-core.mjs:997-1060`。

两端差异：移动发送只写 `type/author/authorName/content/timestamp/clientMessageId/attachment`，不写 `authorTag`、`avatar`、`mentions`、`system` 条目；读历史时只取 `type === "message"`，忽略 `system` 条目。

### 6.2 时间戳

```
timestamp = max(本机当前毫秒, 本频道已见条目的最大 timestamp + 1)
```

「已见」包含远端 writer core 的条目。因此本节点自己的消息时间戳严格递增，且排在它发送时已见的所有消息之后。

时间戳没有未来上限：远端一条 `timestamp` 极大的条目会让本机此后所有消息的时间戳跟着变大（成员资料事件另有 5 分钟上限，§6.6）。

桌面：`server/src/index.js:5425-5428`；移动：`app/backend/mobile-core.mjs:1849-1873`。

### 6.3 作者身份

`author` 只是字段，没有签名。能证明的只有「这一块由该 writer core 的私钥写入」。同一账号可在不同设备上有多个 writer core，接收方无法确认某个 writer core 属于哪个账号。

### 6.4 附件

```json
{
  "kind": "file",
  "cid": "<CID>",
  "fileName": "a.txt",
  "link": "most://<CID>?filename=a.txt",
  "mimeType": "text/plain",
  "size": 3
}
```

- `kind` ∈ `image`、`video`、`audio`、`text`、`file`。
- `cid` 合法（identifiers §1.4）；`link` 能解析，CID 与 `cid` 相同，文件名清洗后与 `fileName` 相同；发送方按 `cid` 与 `fileName` 重新生成 `link`。
- `mimeType` 可选，≤100 字符；`size` 可选，非负，取整。
- 有附件时 `content` 必须等于 `link`。

桌面：`server/src/core/channelAttachment.js`；移动：`app/backend/channel-protocol.mjs:310-431`。

两端差异：未知 `kind` 桌面报错，移动改为 `file`；附件链接解析桌面用宽松解析（identifiers §2.2），移动用严格解析（identifiers §2.3）；移动的 CID 长度 ≤128、链接长度 ≤2048。

### 6.5 提及

`mentions` 最多 20 项，每项 `{address, label, start, end}`：`content.slice(start, end) === "@" + label`，`start`/`end` 为 UTF-16 下标，各项按位置递增不重叠，`label` 为 NFC、去掉控制与格式字符后不超过 50 个码点。不合法的项在读取时丢弃。

桌面：`server/src/core/channelMessage.js:33-80`、`server/src/utils/chatLabels.js`。移动不发送也不解析提及。

### 6.6 系统事件（仅桌面）

| `event`                          | `content`                        | 用途                                                                             |
| -------------------------------- | -------------------------------- | -------------------------------------------------------------------------------- |
| `channel.member.joined`          | `channel.member.joined`          | 成员首次加入时写入                                                               |
| `channel.member.profile.updated` | `channel.member.profile.updated` | 成员资料变更；`member = {address, displayName, profileUpdatedAt, avatar?, tag?}` |

资料事件只在 `author === member.address` 且 `profileUpdatedAt` 不超过本机时间 5 分钟时生效，按 `profileUpdatedAt` 取最新；资料事件不出现在历史列表中。

桌面：`server/src/core/channelMessage.js:5-10`、`93-122`、`server/src/index.js:5080-5235`。

### 6.7 排序与去重

桌面排序键：`(timestamp, writer core key 十六进制字符串, 块序号)`，升序。去重键：

- 资料事件：`system:<event>:<member.address>:<profileUpdatedAt>`；
- 加入事件：`system:<event>:<author 小写>:<content>`；
- 其他：`<coreKey>:<type>:<event>:<author>:<timestamp>:<content>`。

带 `clientMessageId` 的消息，桌面在**发送前**检查本频道所有 core 中是否已有同一 `author + clientMessageId`：内容一致则返回已有消息，不一致则报冲突；读历史时不再按 `clientMessageId` 去重。

移动排序只按 `timestamp`（相同时保持读取顺序）。去重键：有 `clientMessageId` 时为 `client:<author 小写>:<clientMessageId>`；否则 `<coreKey>:<author>:<timestamp>:<content>:<attachment.link>`。发送前只检查本机自己的 writer core。

桌面：`server/src/core/channelHistory.js:7-21`、`server/src/core/channelMessage.js:103-122`、`server/src/index.js:4237-4280`、`4355-4385`；移动：`app/backend/channel-protocol.mjs:609-641`、`app/backend/mobile-core.mjs:1030-1048`。

两端差异的后果：时间戳相同的消息两端显示顺序可能不同；同一 `clientMessageId` 出现在两个 core 中时（例如换了 writer core 后重试），桌面显示两条，移动显示一条。

## 7. 在线状态 `channel-presence`

```json
{
  "type": "channel-presence",
  "peerId": "<文件 swarm 公钥 hex>",
  "channelId": "general",
  "channelKey": "general",
  "address": "0x…",
  "status": "online",
  "displayName": "alice#1111",
  "avatar": "",
  "profileUpdatedAt": 1795000000000,
  "lastSeen": 1795000000000,
  "sessionId": "default"
}
```

- `status` ∈ `online`、`heartbeat`、`profile`、`offline`；其他值忽略。
- 会话键为 `(address, sessionId, 来源)`；`sessionId` 截断到 120 字符，空为 `default`；远端来源为 `peer:<peerId>`。
- `heartbeat` 由本机界面定期调用节点心跳接口后广播（节点不自带定时器；常量 `CHANNEL_PRESENCE_HEARTBEAT_MS` 为 15 秒）；45 秒（`CHANNEL_PRESENCE_TIMEOUT_MS`）没有更新的会话过期。
- 只发给、只接受已授权频道；忽略 `peerId` 等于自己的帧。
- 连接关闭时清除该连接对端 peerId 来源的所有会话。

桌面：`server/src/core/channelWire.js:4-77`、`server/src/core/channelPresence.js:8-9`、`server/src/index.js:363-380`、`7330-7360`、`7568-7590`；移动：`app/backend/channel-protocol.mjs:19-20`、`app/backend/mobile-core.mjs:1083-1100`、`2232-2262`、`2758-2812`。

## 8. 账号同步（仅桌面）

同一账号的多台设备同步个人资料、文件列表与频道列表。移动端没有实现；收到 `account-hello` 时按未知类型忽略。

### 8.1 信封

```
envelope = "ma://1" ‖ "." ‖ base64(nonce) ‖ "." ‖ base64(secretbox(JSON(entry), nonce, syncKey))
```

- `nonce` 24 字节随机；`secretbox` 为 NaCl XSalsa20-Poly1305；`syncKey` 见 identifiers §4.4；base64 为标准字母表带填充。
- `entry = {v: 1, kind, id, deviceId, updatedAt, deleted, data}`；`deleted` 为 true 时 `data` 为 `null`（墓碑）。
- 解密或解析失败、`v !== 1` 时忽略。

桌面：`server/src/utils/accountSync.js:10-90`。

### 8.2 日志 core

每台设备在 `namespace("account-sync-" ‖ 账号地址小写)` 下用 `name = "log-" ‖ 16 字节随机十六进制` 打开自己的 core（`valueEncoding: json`），每块是一个信封字符串。`deviceId` 为该 core 公钥十六进制。经文件 swarm 的账号同步 topic 复制。

合并：按 `kind:id` 取最新，比较 `(updatedAt, deviceId, JSON(data))`。`updatedAt = max(本机时间, 已见最大 + 1)`。当前 `kind`：`profile`（id `self`）、`file`（id 为 CID）、`channel`（id 为 channelKey）。每个账号最多 64 个 writer core。

桌面：`server/src/node/accountSync.js:21`、`178-190`、`308-330`；`server/src/index.js:2700-2790`。

### 8.3 `account-hello`

```json
{ "type": "account-hello", "envelope": "ma://1.<nonce>.<ciphertext>" }
```

信封内 `entry = {kind: "hello", id: "writers", data: {writerCoreKeys: [...], appPublicKey: "<文件 swarm 公钥 hex>"}}`。

- 在每条聊天 swarm 连接建立时、为本机每个启用同步的账号各发一次，不经持有证明；没有 `syncKey` 的一方无法解密，也看不出属于哪个账号。
- 接收方逐个账号尝试解密；成功则按 `appPublicKey` 在文件 swarm 上 `joinPeer` 拨号（discovery §3.3），打开新的 writer core；学到新 core 时向所有连接重发 hello。

桌面：`server/src/node/accountSync.js:16`、`192-225`、`233-247`、`410-440`。

## 9. 待补

- 向量：持有证明、hello 拆帧、消息条目、去重键、账号同步信封（给定 nonce）。
- 已知问题汇总（移动 writerId 熵、时间戳无未来上限、`author` 无签名、两端排序与去重差异）留给阶段 2 统一处理。
