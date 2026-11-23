# 频道密钥与授权

原语见 [版本与信封](envelope.md) §3。产品只有一个用户输入的 `channelId`，对应现行实现的 `handle`；线上字段 `channelId` 则是内部公开派生 ID。它们是同一群入口的不同表示，不是两份用户凭证。群内角色、历史权限与附件策略见 [群聊模型](../../chat-model.md)。

## 1. 范围

本篇定义加入值到密钥、公开 ID、topic、持有证明和 writer 密钥的映射。群内只有普通用户，创建者和常在线节点没有额外群权限；节点运维的访问控制独立于群授权。

## 2. 安全边界

随机加入值保密时可用于私密交流；短名或主动公开的加入值供公开讨论。加入值泄露后新建群，旧群及已传播副本仍存在。当前内容不加密，存储节点运营者可读；不能据此承诺端到端加密或对运营者隐藏正文。

## 3. 派生

```
K          = 32 字节 CSPRNG                                  // 频道凭证
channelId  = H("channel/id", K)                              // 32 字节，公开 ID
replTopic  = H("topic/channel-replication", K)               // 文件 swarm
chatTopic  = H("topic/channel-chat", K)                      // 聊天 swarm
```

文本形式：

| 名称        | 编码                                            | 长度    |
| ----------- | ----------------------------------------------- | ------- |
| 频道凭证    | RFC 4648 base32 小写、无填充（字母表 `a-z2-7`） | 52 字符 |
| 频道公开 ID | 64 位小写十六进制                               | 64 字符 |

- 分享与加入只用凭证；凭证不得出现在日志、hello、presence 或消息里。
- `channelId` 由 `K` 单向派生，知道 `channelId` 不能加入频道，也找不到 topic。
- topic 直接由 `K` 派生而非由 `channelId` 派生，使 `channelId` 公开后仍不能用来在 DHT 上找到成员。
- 只有复制与聊天两个 topic，没有频道候选 topic；加入时直接加入两者。

Web 分享地址形式不变：`<origin>/chat/#<频道凭证>`。

### 3.1 加入时的输入识别

用户输入或粘贴的「频道句柄」按以下顺序识别（去首尾空白、转小写后）：

| 输入                                       | 类别   | `K`                         |
| ------------------------------------------ | ------ | --------------------------- |
| 52 字符 base32 凭证（末尾 4 个填充位为 0） | 私有   | 凭证解码                    |
| 26 字符 `[a-z2-7]`（v1 随机频道 ID）       | 旧频道 | `H("channel/legacy", 输入)` |
| 其他符合公开频道名规则的短名               | 公开   | `H("channel/public", 输入)` |
| 其他                                       | 拒绝   | —                           |

句柄用于用户分享及创建/加入的输入；线上 `channelId` 和 API 返回的规范 `channelKey` 是公开 ID。HTTP 路径参数可以接受加入值或已知的规范标识，具体见 [客户端接口](../../native-chat-protocol.md)。26 字符且恰好只含 `a-z2-7` 的自定义短名会被识别为旧频道，而不是公开频道。

实现：`server/src/core/channelKeysV2.js`、`app/backend/channel-keys-v2.mjs` 的 `resolveChannelHandle`。

## 4. 公开频道

公开短名按 `trim().toLowerCase()` 规范化，必须匹配 `^[a-z0-9_-]{3,30}$`，并服从 §3.1 的输入识别优先级：恰好符合旧 26 字符格式的输入优先按旧输入派生。

```text
K_public(name) = H("channel/public", UTF8(normalize(name)))
```

任何人都可从短名算出密钥。界面应如实说明：任何知道名字的人都能加入、阅读和发言。新建频道默认生成随机加入值。第三方接入与 Web 分享均传递这同一个加入值，不增加单独的邀请码。

## 5. 持有证明与 hello

```
proofKey = KDF(K, "channel/proof-key")
proof    = MAC(proofKey, "channel/proof", topic ‖ challenge ‖ pk_prover ‖ pk_verifier)
```

`topic`、`challenge`、`pk_prover` 和 `pk_verifier` 都是原始 32 字节。公钥来自聊天 swarm 的 Noise 连接，按证明方、验证方顺序拼接。使用常数时间比较；只接受本端持有频道的 `chatTopic`，不接受复制 topic。完整交换步骤见 [聊天](chat.md) §3。

`channel-hello` 频道项：

```json
{
  "channelId": "<64 hex>",
  "createdAt": "2026-11-18T00:00:00.000Z",
  "lastMessageAt": "2026-11-18T01:02:03.000Z",
  "memberAddresses": ["0x…"],
  "writerCoreKeys": ["<64 hex>"]
}
```

- 线上项不含加入值、`channelKey` 或旧的 `type` 字段。
- 两端都发送 `memberAddresses`；该列表是成员提示，不是账号身份或签名证明。
- 两端学到新 writer core key 后向连接重发 hello。
- `writerCoreKeys` 每项是 64 位十六进制，每频道最多接受 256 个；hello 分帧见 [聊天](chat.md) §4。

## 6. Writer core 与加密

### 6.1 Writer core 密钥

```
seed    = MAC(nodeSecret, "channel/writer", hexDecode(channelId) ‖ u32be(generation))
keyPair = ed25519_seed_keypair(seed)
core    = namespace.get({ keyPair, manifestVersion: 1, valueEncoding: "json" })
```

- namespace 是 `store.namespace("channel-" ‖ channelId)`；`channelId` 在 namespace 名中使用小写十六进制文本，在 seed 公式中必须解码为 32 字节。
- `nodeSecret`：桌面为 `node-identity.json` 的 32 字节节点种子，移动为数据目录的随机 32 字节 `node-secret`，持久保存且不上线。
- `generation` 是从 0 开始的 uint32；本地 writer 损坏或不可写时加一换代，旧 key 保留供读取。它记在本地频道记录中，恢复需保存同一节点密钥和换代记录。
- 必须显式指定 `manifestVersion: 1`。Hypercore key 由 manifest 计算，**不等于** `keyPair.publicKey`；hello 交换的是 core key。重开时不得把设备公钥或 writer 公钥当成 core key。
- 参考实现 Corestore 的固定主密钥继续使用原值，但 writer 私钥依赖本节点的私密 seed，不依赖公开主密钥的保密性。具体 API 不是第三方实现的强制要求，单写者和线上 core 格式才是互通边界。

### 6.2 预留的加密派生

```text
encryptionKey = KDF(K, "channel/encryption")
```

这只是已登记的派生，当前没有加密条目、`sealed` 格式或已启用的 `e2ee1` 能力。writer core key 在授权 hello 中交换，不能由此保证 key 永不泄露；持有 key 的人可复制明文。对节点运营者隐藏正文的提案已撤回，不列入当前实现目标。

## 7. 迁移（D7）

v1 频道 ID `L` 按 §3.1 的规则确定性映射：26 字符 v1 随机 ID 映射为 `K = H("channel/legacy", L)`；其他 v1 短名映射为公开频道 `K = H("channel/public", L)`，与之后按名字加入的新成员相遇。

- 所有成员各自升级后算出同一个 `K`，无需协调即可在 v2 topic 上重新相遇。
- v1 随机 ID（128 位）映射后的 `K` 安全性与 v1 相同，旧邀请链接中的 26 字符 ID 在 v2 中仍可直接加入；v1 自定义短名本来就可被猜出，迁移为公开频道并在界面标注。
- v1 历史：从 v1 直接升级时，将本节点已持有的旧 writer 文本保存为只读快照，按普通气泡显示作者名与纯文本，每条在时间旁（移动端在作者名旁）带小号「未签名」标记，签名消息不带任何标记。不下载缺块，不公布旧 writer key，不把这些文本写入 v2 writer，也不将旧条目解释为可操作的附件或成员资料。桌面节点只向升级时已有的成员（含其迁移后的账号）提供旧文本。已经用早期 v2 候选改写过频道元数据的目录，不能从混合 writer 列表推断哪些是可信的本地旧记录；需要使用升级前备份重演。
- 以上是已实现升级路径的边界，不要求以后每次协议变更都保留迁移。不得仅因早期不兼容策略删除用户数据；新建随机频道不走旧输入派生。

## 8. 测试向量

`../vectors/v2/channel.json`：给定 `K` 的凭证文本、`channelId`、两个 topic、`proofKey` 与 `proof`；给定名字的公开频道 `K`；给定 v1 ID 的迁移 `K`；给定 `nodeSecret`、`channelId`、`generation` 的 writer 公钥。

---

[目录](README.md) · 上一篇：[发现](discovery.md) · 下一篇：[用户签名与账号](signatures.md)
