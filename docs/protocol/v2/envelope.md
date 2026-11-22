# 2.1 版本与信封

状态：已确认（2026-11-18）。

演进策略于 2026-11-21 更新：项目早期不承担历史版本兼容，撤销 v2 永久冻结的决定；本篇其余部分仍描述当前已实现的 v2 字节与行为，具体规则见 §7。

## 1. 问题（v1 现状）

- 域分隔不统一：有的带 `-v1` 后缀（频道证明、账号同步），有的没有（频道 topic `most-box-room-…`、CID topic 直接等于摘要），分隔符有 `:`、`\0`、无分隔三种（discovery §3、chat §3.2）。
- 聊天 swarm 的帧只有部分带 `version`（证明帧），hello、presence、voice 没有；writer core 的条目没有版本（chat §2、§6）。
- 没有能力协商：一端新增帧类型，另一端只能靠「未知类型忽略」被动兼容，发送方无法知道对方是否支持。

## 2. 目标

- 所有派生与帧都带版本和用途标签，跨用途不可能碰撞。
- 版本支持范围明确，早期可以发布整体不兼容的新协议版本，不承诺 v2 为最终协议。
- 同版本可选能力（例如加密）通过能力列表协商，按连接逐个启用；该机制不构成历史版本互通承诺。

## 3. 域分隔

### 3.1 规则

所有哈希、HMAC 与密钥派生的输入都以**标签**开头：

```
label(purpose) = ASCII("most/v2/" ‖ purpose) ‖ 0x00
```

`purpose` 只含 `[a-z0-9/-]`。标签之后的各字段若长度不固定，按「字段 ‖ 0x00」拼接；固定长度的字节串（32 字节密钥、摘要、公钥）直接拼接。

### 3.2 三个原语

```
H(purpose, data...)        = SHA-256(label(purpose) ‖ data...)
MAC(key, purpose, data...) = HMAC-SHA256(key, label(purpose) ‖ data...)
KDF(key, purpose)          = HMAC-SHA256(key, label(purpose))          // 32 字节子密钥
```

只用 SHA-256 与 HMAC-SHA256，两端已有实现，不新增依赖。所有 topic 都是 `H("topic/<名字>", ...)`，32 字节。

### 3.3 v2 用到的全部标签

| 标签 `purpose`                                           | 用途                               | 定义处          |
| -------------------------------------------------------- | ---------------------------------- | --------------- |
| `topic/file`                                             | 文件 topic                         | file-privacy §3 |
| `file/want-key`                                          | `want` 证明密钥                    | file-privacy §4 |
| `file/want`                                              | `want` 证明                        | file-privacy §4 |
| `cid-drive/name`                                         | 本节点 CID drive 名                | file-privacy §6 |
| `channel/id`                                             | 频道公开 ID                        | channel-keys §3 |
| `channel/public`                                         | 公开频道凭证（由名字派生）         | channel-keys §4 |
| `channel/legacy`                                         | v1 频道迁移凭证                    | channel-keys §7 |
| `topic/channel-replication`                              | 频道复制 topic（文件 swarm）       | channel-keys §3 |
| `topic/channel-chat`                                     | 频道聊天 topic（聊天 swarm）       | channel-keys §3 |
| `channel/proof-key`                                      | 持有证明密钥                       | channel-keys §5 |
| `channel/proof`                                          | 持有证明                           | channel-keys §5 |
| `channel/writer`                                         | 本节点 writer core 密钥种子        | channel-keys §6 |
| `channel/encryption`                                     | 预留：频道加密密钥                 | channel-keys §6 |
| `chat/message`                                           | 消息签名                           | signatures §4   |
| `chat/profile`                                           | 成员资料签名                       | signatures §4   |
| `chat/presence`                                          | 在线状态签名                       | signatures §4   |
| `chat/voice`                                             | 语音事件签名                       | voice §3        |
| `identity`                                               | 聊天身份 scrypt 盐（H）            | signatures §7   |
| `password`                                               | 聊天身份 scrypt 密码输入前缀       | signatures §7   |
| `account/sync-key`                                       | 账号同步子密钥                     | signatures §7   |
| `topic/account-sync`                                     | 账号同步 topic（文件 swarm）       | signatures §7   |
| `topic/account-sync-chat`                                | 账号同步 hello topic（聊天 swarm） | signatures §7   |
| `p2p-ping/topic`、`p2p-ping/proof-key`、`p2p-ping/proof` | P2P Ping                           | 本文 §6         |

以后新增用途只能加新标签，不得复用。

## 4. 聊天 swarm 帧

### 4.1 帧格式

仍是换行分隔的 UTF-8 JSON，单帧上限 128 KiB（chat §2 不变）。每帧必须有：

```json
{ "v": 2, "type": "<类型>", ... }
```

接收规则：

- `v !== 2`：丢弃该帧，不断开。
- 未知 `type`：丢弃该帧，不断开。
- 已知 `type` 中的未知字段：忽略，不报错。
- 帧超过上限：断开（不变）。

### 4.2 会话帧与能力协商

每条聊天 swarm 连接建立后，双方**先**发且只发一次：

```json
{ "v": 2, "type": "session", "features": ["sig1"] }
```

- `features`：本端支持的可选能力，字符串数组，最多 64 项，每项 ≤ 32 字符，匹配 `^[a-z0-9-]+[0-9]+$`（名字加版本号）。
- 本端只在**对方也列出**某能力时，才向该连接发送依赖该能力的帧或字段。
- v2 发布时的能力：`sig1`（signatures，所有 v2 节点必须支持，列出只为以后可以弃用）。预留：`e2ee1`（channel-keys §6）。
- 在收到对方 `session` 之前收到的其他帧照常处理（不要求严格顺序，避免死锁）。

### 4.3 v2 帧类型

| `type`              | 变化                                                             |
| ------------------- | ---------------------------------------------------------------- |
| `session`           | 新增                                                             |
| `channel-challenge` | 原 `channel-proof-challenge`，去掉 `version` 字段（由 `v` 代替） |
| `channel-scope`     | 不变（加 `v`）                                                   |
| `channel-proof`     | 证明算法改为 channel-keys §5，去掉 `version` 字段（由 `v` 代替） |
| `channel-hello`     | 频道项去掉 `channelKey`、`type`，见 channel-keys §5              |
| `channel-presence`  | 必须签名，见 signatures §4                                       |
| `channel-voice`     | 必须签名，`signal` 定向转发，见 voice                            |
| `account-hello`     | 不变（加 `v`），topic 派生见 signatures §7                       |

## 5. Writer core 条目

每个块是一个 JSON 对象：

```json
{ "v": 2, "type": "<类型>", ... }
```

- 读历史时：`v !== 2` 或未知 `type` 的条目跳过；已知类型的未知字段保留（参与签名验证，signatures §3），不显示。
- 条目类型与签名见 signatures §4。

## 6. 其他 v2 版本号

| 对象               | v1                        | v2                                                          |
| ------------------ | ------------------------- | ----------------------------------------------------------- |
| 文件 Protomux 协议 | `most-cid-drive/2`        | `most-cid-drive/3`（file-privacy §4）                       |
| 账号同步信封       | `ma://1`，`v: 1`          | 不变：内部格式已有版本，且只在自己设备间使用                |
| P2P Ping           | `most-box-p2p-ping-v2` 等 | 换成 `p2p-ping/*` 标签，帧 `version: 3`；诊断工具，只为统一 |

P2P Ping 的派生（按 §3.1，变长字段各以 `0x00` 结尾；`code` 为 6 位数字字符串，`direction` 为 `hostToJoin` / `joinToHost`，`type` 为 `p2p-ping` / `p2p-pong` / `p2p-ack`，`nonce` 为 32 位十六进制字符串）：

```
topic    = H("p2p-ping/topic", code ‖ 0x00 ‖ direction ‖ 0x00)
proofKey = H("p2p-ping/proof-key", code ‖ 0x00)
proof    = hex(MAC(proofKey, "p2p-ping/proof", direction ‖ 0x00 ‖ type ‖ 0x00 ‖ nonce ‖ 0x00))
```

帧仍是 `{ type, version: 3, direction, nonce, proof }`（Ping swarm 不走聊天信封）。向量见 `vectors/v2/p2p-ping.json`。

Protomux 已核实：收到未注册的消息类型时忽略（`node_modules/protomux/index.js` `_recv`），因此 `most-cid-drive/3` 以后可以只增消息类型。

## 7. 协议演进规则

2026-11-21 更新，取代此前永久冻结与强制新旧并存的约定。长期策略见[早期协议兼容策略](../../decentralization-plan.md#早期协议兼容策略)。

1. 允许按需求调整帧、派生、签名格式与条目格式。每次不兼容变更明确新版本或标签/topic 边界，更新规范、向量、实现和支持范围；不得让旧数据被误解释为新数据。
2. 不默认保留旧协议实现、双写、新旧网络并存或历史数据迁移。发布说明写清升级、重建或不支持的范围；不以不兼容为由自动删除用户数据。
3. 当前 v2 的可选能力仍使用 `features` 协商，必选签名和当前版本的安全校验保持有效；放弃向后兼容不等于接受未签名或无授权内容。
4. 同版本互通与独立实现验收绑定明确的规范、测试向量和程序版本。未来何时承诺稳定兼容另行确认。

## 8. 测试向量

`vectors/v2/envelope.json`：每个标签的 `H`、`MAC`、`KDF` 样例；帧接收规则正反例（`v` 错、未知类型、未知字段）。
