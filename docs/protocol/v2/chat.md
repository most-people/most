# 聊天与账号同步

本篇按连接建立、频道授权、writer 发现、历史读取的顺序定义聊天。原语与帧版本见 [版本与信封](envelope.md)，完整签名算法见 [用户签名](signatures.md)。

## 1. 模型与边界

每个参与节点在频道内有自己的单写者 Hypercore，可以写入多个账号的已签名内容。频道历史是本机取得的所有 writer 条目合并后的视图，没有全局共识或中心排序者。文件 swarm 复制 core，聊天 swarm 宣告 writer key 和实时状态。

群内只有普通用户；知道加入值即可尝试加入、发言和取得仍有副本的历史。文字历史默认全部同步保存，界面分页不截断本机保留量。当前页数、接口 limit 等不改变复制范围。作者或副本全部离线时，节点只能读取已经同步到本机的块；常在线群成员可以保存文字帮助补齐，但不保证永久在线。完整产品规则见 [群聊模型](../../chat-model.md)。

## 2. 帧与处理

聊天 swarm 的加密流直接传 UTF-8 JSON，以 `\n`（0x0a）分帧。单帧最大 131072 字节，不含换行；未完成缓冲或完整帧超限时关闭连接。逐帧 trim 后解析，空行忽略，解析错误只丢弃该帧。非对象、非 `v: 2` 或未知 `type` 均忽略。

| type                                                  | 是否须先通过频道持有证明     | 定义                           |
| ----------------------------------------------------- | ---------------------------- | ------------------------------ |
| `session`                                             | 否                           | [版本与信封](envelope.md) §4.2 |
| `channel-challenge`、`channel-scope`、`channel-proof` | 否                           | 本篇 §3                        |
| `channel-hello`                                       | 是，逐频道检查               | 本篇 §4                        |
| `channel-presence`                                    | 是，另验设备签名             | 本篇 §7                        |
| `channel-voice`                                       | 是，另验设备签名；仅桌面节点 | [语音](voice.md)               |
| `account-hello`                                       | 否，使用账号密钥加密         | 本篇 §8                        |

连接先发送一次 `session`。接收其他帧不等待 session；`sig1` 始终必选，能力声明缺失不能关闭验签。随后处理账号 hello、scope、challenge、proof 以及已授权内容；双方可交错发送，不要求同步轮次。未知签名 body 字段保留并参与验签。

## 3. 频道持有证明

每条连接按 topic 独立授权。目的不是证明账号身份，而是证明对端知道加入值对应的 `K`，然后才发送该频道 hello、在线状态与语音。

### 3.1 交换步骤

1. 每端为每条连接生成一次 32 字节安全随机 challenge，发送：

   ```json
   { "v": 2, "type": "channel-challenge", "challenge": "<64 hex>" }
   ```

2. 声明与该连接相关且本机持有的聊天 topic，包括 Hyperswarm 提供的相遇 topic；新增 topic 时再次发送 scope，单帧最多 256 个，多则拆帧：

   ```json
   { "v": 2, "type": "channel-scope", "topics": ["<64 hex>"] }
   ```

3. 收到挑战后，对本机持有的相关 topic 与对方 scope 中本机也持有的 topic，发送尚未证明过的项，单帧最多 256 项：

   ```json
   {
     "v": 2,
     "type": "channel-proof",
     "challenge": "<对方 challenge>",
     "proofs": [{ "topic": "<64 hex>", "proof": "<64 hex>" }]
   }
   ```

4. 收到 proof 时，challenge 必须等于本端挑战；只验证相关且本机持有的聊天 topic。通过后记录本连接授权，并立即发该频道 hello 和本机已有的已签名在线状态。

只接受 `chatTopic`，没有候选 topic。挑战或证明格式错误、challenge 不匹配、proof 列表无效或超过 256 项时忽略证明帧；第二个不同的 challenge 忽略。scope 的 `topics` 非数组或超过 256 项会抛出处理错误；当前两端外层逐帧捕获并记录，丢弃该帧而继续连接；合法 scope 中无效、重复或本机未知的 topic 忽略。授权不会扩展到同节点的另一条连接。

### 3.2 计算

```text
proofKey = KDF(K, "channel/proof-key")
proof = hex(MAC(proofKey, "channel/proof",
                topic ‖ challenge ‖ proverPublicKey ‖ verifierPublicKey))
```

四个拼接字段各 32 字节，从十六进制解码。双方公钥是这条**聊天** Noise 连接的公钥，按证明方、验证方排序，不是 hello 的文件 peerId。验证使用常数时间比较。密钥派生与向量见 [频道密钥](channel-keys.md) §3、§5；证明不能跨连接重放。

## 4. `channel-hello`

```json
{
  "v": 2,
  "type": "channel-hello",
  "peerId": "<文件 swarm 公钥 hex>",
  "authorName": "<peerId 前四字符>",
  "channels": [
    {
      "channelId": "<64 位小写 hex 的公开 ID>",
      "createdAt": "2026-11-18T00:00:00.000Z",
      "lastMessageAt": "2026-11-18T01:02:03.000Z",
      "memberAddresses": ["0x…"],
      "writerCoreKeys": ["<64 hex>"]
    }
  ]
}
```

只发送已授权的频道，没有授权就不发；不携带加入值或旧 `channelKey`、`type` 字段。`writerCoreKeys` 包含本机已知 key，每频道最多接收 256 个，每项须为 64 位十六进制。按频道拆分为不超过 128 KiB 的帧；单频道项过大则报错，不发送超限帧。

接收方忽略空或自身 peerId、未授权或本机未持有的频道。新的 writer key 加入本地记录并只读打开。两端学到新 key 后重发 hello，帮助多跳相识；连接建立、新 topic、新授权、writer 或成员资料变化也会触发发送。hello 只是元数据提示，`memberAddresses` 与 peerId 不证明用户身份。

## 5. Writer core 与历史复制

### 5.1 本地位置与密钥

参考实现 namespace 为 `store.namespace("channel-" ‖ channelId)`，其中 `channelId` 为公开 ID 的小写 hex。writer 私钥从本地节点 secret、解码后的公开 ID 和 generation 派生，并显式使用 `manifestVersion: 1`；完整公式见 [频道密钥](channel-keys.md) §6。不得按公开 Corestore 主密钥和可猜 writerId 生成私钥。

参考实现仍以 ASCII `most-box-global-shared-seed-v1` 循环填满 32 字节作为 Corestore 主密钥；它是公开的本地命名参数，不是权限。远端 core key 是 Hypercore manifest key，不是 Ed25519 公钥。

### 5.2 复制

双方经频道复制 topic 在文件 swarm 相遇。在同一频道 namespace 打开相同 core key，Corestore 在连接上复制该 core；应用层 hello 本身不传消息正文。节点得知的多个 writer 汇成历史，单个节点不是全群唯一写入者。

### 5.3 非阻塞读取

远端 key 以只读方式打开，并调用 `core.download({start: 0, end: -1})` 请求全部块及之后追加内容。历史读取、启动重放、发送前索引扫描只用 `core.get(i, {wait: false})`；缺块时停止该 core 的本次扫描，之后续读，不等离线作者。

append 监听通过 `lastCoreLength` 只处理新增内容。全量同步是尽力取得全部可达文字历史，不是“已复制完成”的保证；不以分页 100 条或默认最新页替代全部 core 复制。缺失或无在线副本应如实显示状态。

## 6. 消息与资料

### 6.1 唯一线上条目

每块使用 Hypercore `valueEncoding: "json"`，即 UTF-8 JSON。当前写入格式为：

```json
{
  "v": 2,
  "type": "signed",
  "ts": 1795000000123,
  "body": {
    "kind": "message",
    "channelId": "<64 hex>",
    "author": "<小写 0x 地址>",
    "id": "0b9a3c1e-2f4d-4a6b-8c7d-9e0f1a2b3c4d",
    "createdAt": 1795000000000,
    "content": "hi"
  },
  "device": "<设备公钥 64 hex>",
  "cert": "dc1.<payload>.<accountSignature>",
  "sig": "<64 字节签名的 base64url>"
}
```

公共字段、规范化与签名全部按 [用户签名](signatures.md) §3–5；未知版本、未知条目类型或无效签名不进入历史。正文 `content` 最多 10000 个 UTF-16 代码单元。客户端提交必须已去首尾空白且非空；读取已签名远端文本要求 trim 后非空，不能为了规范化而修改已签名正文。

### 6.2 时间与投影

`createdAt` 是客户端签名时间，`ts` 是节点分配的排序时间，不能相互替代。`ts` 必须为正安全整数；本地 `ts = max(now, 已见最大 ts + 1)`，已见仅计不超过 `now + 5 分钟` 的条目。极未来条目保留其排序位置，但不拉动后续本地时钟。

API 可将 `body.id` 投影成 `clientMessageId`、`ts` 投影成 `timestamp`；这不是另一种可写入的线上格式。

### 6.3 可选显示字段

`authorName` 最多 50 个 UTF-16 代码单元，空时显示地址前十字符；`avatar` 最多 4096 字符。`authorTag` 是最多 16 个语言标签或 `default` 到文本的映射，每项最多 50 个 Unicode 码点。

节点接受客户端写入时要求可选字段已是规范形式且 author 等于认证账号。读取远端合法签名文本时，不合规范的可选字段只隐藏，不拒绝整个文本；未知字段保留用于验签，不参与显示。移动未实现的 mentions 不参与显示，不能因此丢弃合法消息。

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

`kind` 为 `image`、`video`、`audio`、`text` 或 `file`。CID 合法，link 解析出的 CID 和清洗后的文件名须分别匹配 `cid`、`fileName`；发送方按二者重新生成链接。有附件时 `content` 等于 link。mimeType 可选且最多 100 字符；size 可选、非负并取整。附件 metadata 不代表内容已下载或可信，只有下载后重算 CID 才能保存并做种。

当前实现差异：桌面对未知 kind 报错、使用宽松链接解析；移动未知 kind 归为 file、使用严格链接解析，并限制 CID 最多 128 字符、link 最多 2048 字符。具体解析见 [标识符](identifiers.md) §2。差异影响附件字段显示，不能改变签名文本的身份、去重和排序。

P2P 文字复制只传递附件引用，不包含附件内容。产品要求进入频道、同步历史和预览均不自动拉取完整附件，用户点击后下载；全端触发行为及清理入口仍按 [群聊模型](../../chat-model.md)验收，不能由本篇推定已全部完成。校验下载成功后默认继续做种；清理附件不等于删除文字历史、附件引用或其他节点副本。

### 6.5 提及

桌面 mentions 最多 20 项，每项 `{address, label, start, end}`。start/end 是 UTF-16 下标，必须满足 `content.slice(start, end) === "@" + label`，递增且不重叠；label 为 NFC、去控制和格式字符后最多 50 码点。有附件时不得有提及。写入要求规范形式，远端不合法可选字段不显示。移动不发送也不解析提及。

### 6.6 资料与系统事件

`kind: "profile"` 使用同样的签名公共字段，另含可选 displayName、avatar、tag。缺省字段不修改；`tag: null` 清除。按 createdAt 取最新，超过本机未来五分钟不生效；可选字段校验规则与消息一致。

节点不写未签名的“成员加入”或“资料变更”条目。API 内部可以把已签名 profile 投影为 `system` 事件应用资料，这不允许把旧 system 对象追加为新 writer 条目。版本特定的旧只读文本快照按 [频道密钥](channel-keys.md) §7 处理，不与签名历史混淆。

### 6.7 排序、去重与重试

两端按 `(ts, writer core key 的 hex 文本, 块序号)` 升序，按 `(body.author, body.id)` 去重，保留排序最前的一条。无效条目不影响去重或本地排序时钟。相同逻辑消息重试使用同一小写 UUID v4，节点的重复写入与冲突处理见 [客户端接口](../../native-chat-protocol.md#sending-and-retrying)。这不建立跨节点共识，也不构成收到回执。

## 7. 已签名在线状态

```json
{
  "v": 2,
  "type": "channel-presence",
  "body": {
    "kind": "presence",
    "channelId": "<64 hex>",
    "author": "<小写 0x 地址>",
    "id": "<uuid v4>",
    "createdAt": 1795000000000,
    "status": "online",
    "sessionId": "<客户端会话 ID>"
  },
  "device": "<64 hex>",
  "cert": "dc1.…",
  "sig": "<base64url>"
}
```

status 为 online、heartbeat、profile、offline；sessionId 必须是非空且已 trim 的字符串，最多 120 个 UTF-16 代码单元。createdAt 与本机相差超过两分钟则丢弃。displayName、avatar、profileUpdatedAt 可作为签名正文附带资料。会话按账号、sessionId 与来源区分，只向已授权连接发送，只接受已授权频道事件。

客户端每 15 秒签发新 heartbeat，45 秒无更新过期；任一有效会话存在即在线。正常离开签发 offline。客户端异常断开时，节点仅清理其本地会话，不能伪造远端 offline，其他节点等待过期。在线状态不写入历史，不表示对方收到某条消息；收到回执当前不开发。

## 8. 账号同步（仅桌面）

同一账号的多台设备同步个人资料、文件列表与频道列表。移动端没有实现；收到 `account-hello` 时按未知类型忽略。

### 8.1 信封

```
envelope = "ma://1" ‖ "." ‖ base64(nonce) ‖ "." ‖ base64(secretbox(JSON(entry), nonce, syncKey))
```

- `nonce` 24 字节随机；`secretbox` 为 NaCl XSalsa20-Poly1305；`syncKey` 见 [签名与账号](signatures.md) §7；base64 为标准字母表带填充。
- `entry = {v: 1, kind, id, deviceId, updatedAt, deleted, data}`；`deleted` 为 true 时 `data` 为 `null`（墓碑）。
- 解密或解析失败、`v !== 1` 时忽略。

桌面：`server/src/utils/accountSync.js:10-90`。

### 8.2 日志 core

每台设备在 `namespace("account-sync-" ‖ 账号地址小写)` 下用 `name = "log-" ‖ 16 字节随机十六进制` 打开自己的 core（`valueEncoding: json`），每块是一个信封字符串。`deviceId` 为该 core 公钥十六进制。经文件 swarm 的账号同步 topic 复制。

合并：按 `kind:id` 取最新，比较 `(updatedAt, deviceId, JSON(data))`。`updatedAt = max(本机时间, 已见最大 + 1)`。当前 `kind`：`profile`（id `self`）、`file`（id 为 CID）、`channel`（id 为频道公开 `channelId`）。每个账号最多 64 个 writer core。

桌面：`server/src/node/accountSync.js:21`、`178-190`、`308-330`；`server/src/index.js:2700-2790`。

### 8.3 `account-hello`

```json
{ "v": 2, "type": "account-hello", "envelope": "ma://1.<nonce>.<ciphertext>" }
```

信封内 `entry = {kind: "hello", id: "writers", data: {writerCoreKeys: [...], appPublicKey: "<文件 swarm 公钥 hex>"}}`。

- 在每条聊天 swarm 连接建立时、为本机每个启用同步的账号各发一次，不经持有证明；没有 `syncKey` 的一方无法解密，也看不出属于哪个账号。
- 接收方逐个账号尝试解密；成功则按 `appPublicKey` 在文件 swarm 上 `joinPeer` 拨号（[发现](discovery.md) §3.3），打开新的 writer core；学到新 core 时向所有连接重发 hello。

桌面：`server/src/node/accountSync.js:16`、`192-225`、`233-247`、`410-440`。

## 9. 实现与验证

桌面：`server/src/index.js`、`server/src/core/channelFrames.js`、`channelSession.js`、`channelSignedEntry.js`、`channelSignedPresence.js`、`server/src/node/accountSync.js`。移动：`app/backend/mobile-core.mjs`、`channel-protocol.mjs`、`channel-session.mjs`、`channel-signed-entry.mjs`。

现行向量分类见 [向量索引](../vectors/README.md)。C1–C5、分区恢复与量化门槛见 [验收指南](../../acceptance.md)，已有通过、失败及尚未覆盖项见 [验证状态](../../validation-status.md)；双端测试不能代替第三方独立实现与真实网络验收。

---

[目录](README.md) · 上一篇：[用户签名与账号](signatures.md) · 下一篇：[文件发现与访问证明](file-privacy.md)
