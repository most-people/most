# 版本、原语与信封

本文定义现行 v2 的共用字节规则。`‖` 表示字节拼接；字符串按 UTF-8 编码，除非公式明确写成 ASCII。固定长度十六进制字段参与计算前先解码，公式另有说明的除外。

## 1. 范围

MostBox 自定义派生、聊天帧和 writer 条目使用本篇规则；上游连接与复制协议见 [连接](connection.md)。现行协议不因本次文档整合改变线上字节。

## 2. 版本边界

聊天帧与 writer 条目使用 `v: 2`；文件通道名是 `most-cid-drive/3`；Ping 帧使用 `version: 3`；账号同步加密信封内部使用 `ma://1`。这些是不同对象的版本，不可相互替代。

## 3. 域分隔

### 3.1 规则

所有哈希、HMAC 与密钥派生的输入都以**标签**开头：

```
label(purpose) = ASCII("most/v2/" ‖ purpose) ‖ 0x00
```

`purpose` 必须匹配 `^[a-z0-9/-]+$`。标签自带末尾零字节；其后严格按各公式拼接输入，不隐式添加分隔符。32 字节密钥、摘要和公钥使用原始字节；Ping 的变长字符串按 §6 显式补零，而 identity、公开频道名等按其公式直接使用 UTF-8。

### 3.2 三个原语

```
H(purpose, data...)        = SHA-256(label(purpose) ‖ data...)
MAC(key, purpose, data...) = HMAC-SHA256(key, label(purpose) ‖ data...)
KDF(key, purpose)          = HMAC-SHA256(key, label(purpose))          // 32 字节子密钥
```

这些原语输出均为 32 字节。topic 的具体用途标签按 §3.3 登记；Ping 使用 `p2p-ping/topic`。变长字段是否以零字节结尾以各用途公式为准，不得自行增加分隔符。

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

换行分隔的 UTF-8 JSON，单帧上限 128 KiB，切帧与错误处理见 [聊天](chat.md) §2。每帧必须有：

```json
{ "v": 2, "type": "<类型>", ... }
```

接收规则：

- `v !== 2`：丢弃该帧，不断开。
- 未知 `type`：丢弃该帧，不断开。
- 已知 `type` 中的未知字段不作业务解释；签名 `body` 中的未知字段必须原样保留并参与验签。
- 帧超过上限：断开。

### 4.2 会话帧与能力协商

每条聊天 swarm 连接建立后，双方**先**发且只发一次：

```json
{ "v": 2, "type": "session", "features": ["sig1"] }
```

- `features` 是能力字符串数组，最多 64 项，每项不超过 32 字符，匹配 `^[a-z0-9-]+[0-9]+$`。
- 接收方只记录第一份 `session`；无效能力列表视为空列表。未收到 `session` 时到达的其他帧照常处理。
- 可选能力只有双方都列出才启用。当前唯一声明的 `sig1` 是 v2 的必选签名能力：即使对方没有发有效 `session`，或未列出 `sig1`，仍必须发送并验证签名，不能降级为未签名内容。
- 当前没有已启用的频道加密能力。新增能力及版本边界按 §7 管理。

### 4.3 v2 帧类型

| `type`                                                | 作用与定义                              |
| ----------------------------------------------------- | --------------------------------------- |
| `session`                                             | 能力声明，本篇 §4.2                     |
| `channel-challenge`、`channel-scope`、`channel-proof` | 频道授权，[聊天](chat.md) §3            |
| `channel-hello`                                       | 元数据与 writer key，[聊天](chat.md) §4 |
| `channel-presence`                                    | 已签名在线状态，[聊天](chat.md) §7      |
| `channel-voice`                                       | 已签名语音事件，[语音](voice.md)        |
| `account-hello`                                       | 加密账号同步入口，[聊天](chat.md) §8    |

## 5. Writer core 条目

每个块是一个 JSON 对象：

```json
{ "v": 2, "type": "<类型>", ... }
```

- 读历史时：`v !== 2` 或未知 `type` 的条目跳过；已知类型的未知字段保留（参与签名验证，signatures §3），不显示。
- 条目类型与签名见 signatures §4。

## 6. 其他 v2 版本号

| 对象               | 现行值                                                |
| ------------------ | ----------------------------------------------------- |
| 文件 Protomux 协议 | `most-cid-drive/3`，见 [文件访问](file-privacy.md) §4 |
| 账号同步信封       | `ma://1`，内部 `v: 1`，见 [聊天](chat.md) §8          |
| P2P Ping           | `version: 3`，独立诊断流，见 [连接](connection.md) §4 |

P2P Ping 的派生（按 §3.1，变长字段各以 `0x00` 结尾；`code` 为 6 位数字字符串，`direction` 为 `hostToJoin` / `joinToHost`，`type` 为 `p2p-ping` / `p2p-pong` / `p2p-ack`，`nonce` 为 32 位十六进制字符串）：

```
topic    = H("p2p-ping/topic", code ‖ 0x00 ‖ direction ‖ 0x00)
proofKey = H("p2p-ping/proof-key", code ‖ 0x00)
proof    = hex(MAC(proofKey, "p2p-ping/proof", direction ‖ 0x00 ‖ type ‖ 0x00 ‖ nonce ‖ 0x00))
```

帧仍是 `{ type, version: 3, direction, nonce, proof }`（Ping swarm 不走聊天信封）。向量见 `../vectors/v2/p2p-ping.json`。

当前 Protomux 接收器忽略未注册的消息类型（上游 `_recv`）。这不替代版本设计；新增字段或消息须按 §7 明确双方支持范围。

## 7. 协议演进规则

2026-11-21 更新，取代此前永久冻结与强制新旧并存的约定。长期策略见[早期协议兼容策略](../../decentralization-plan.md#早期协议兼容策略)。

1. 允许按需求调整帧、派生、签名格式与条目格式。每次不兼容变更明确新版本或标签/topic 边界，更新规范、向量、实现和支持范围；不得让旧数据被误解释为新数据。
2. 不默认保留旧协议实现、双写、新旧网络并存或历史数据迁移。发布说明写清升级、重建或不支持的范围；不以不兼容为由自动删除用户数据。
3. 当前 v2 的可选能力仍使用 `features` 协商，必选签名和当前版本的安全校验保持有效；放弃向后兼容不等于接受未签名或无授权内容。
4. 同版本互通与独立实现验收绑定明确的规范、测试向量和程序版本。未来何时承诺稳定兼容另行确认。

## 8. 测试向量

`../vectors/v2/envelope.json` 提供标签与 `H`、`MAC`、`KDF` 样例；`frames.json` 提供帧接收规则正反例；`session.json` 提供能力声明与交集用例。完整分类见 [向量索引](../vectors/README.md)。

---

[目录](README.md) · 下一篇：[标识符与链接](identifiers.md)
