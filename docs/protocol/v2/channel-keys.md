# 2.4 频道密钥

状态：已确认（2026-11-18）。原语与标签见 [envelope.md](envelope.md) §3。

## 1. 问题（v1 现状）

- 频道凭证就是频道 ID：随机 ID 为 128 位（26 字符 base32），但也允许用户自定义 3–30 字符的短名，可被猜测和枚举（identifiers §3）。
- 三个频道 topic 与持有证明都直接由频道 ID 派生（discovery §3.2、chat §3.2）。
- Writer core 的密钥由公开的 Corestore 主密钥 + `"messages-" ‖ writerId` 派生；移动端 `writerId` 熵约 32 位且非密码学随机，可离线穷举后冒充写入（chat §5.1）。
- 聊天内容在 core 中为明文。

## 2. 目标

- 频道凭证 = 32 字节随机密钥 `K`；所有 topic 与证明由 `K` 派生。
- 频道有一个**不是凭证**的公开 ID，用于本地记录、签名绑定和日志。
- Writer core 密钥只由本节点私密密钥派生，与公开主密钥无关。
- 把加密密钥的派生定死，使端到端加密以后可以作为新增能力加入。

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
- v1 的「频道候选」topic 取消：v1 用它在加入前探测同名频道是否已存在；v2 凭证即频道，加入就是直接加入聊天 topic。

Web 分享地址形式不变：`<origin>/chat/#<频道凭证>`。

### 3.1 加入时的输入识别

用户输入或粘贴的「频道句柄」按以下顺序识别（去首尾空白、转小写后）：

| 输入                                  | 类别   | `K`                         |
| ------------------------------------- | ------ | --------------------------- |
| 52 字符 base32 凭证（尾部填充位为 0） | 私有   | 凭证解码                    |
| 26 字符 `[a-z2-7]`（v1 随机频道 ID）  | 旧频道 | `H("channel/legacy", 输入)` |
| 其他符合公开频道名规则的短名          | 公开   | `H("channel/public", 输入)` |
| 其他                                  | 拒绝   | —                           |

句柄是用户分享和本地显示用的；线上与 API 中的频道标识一律是公开 ID（`channelId`）。26 字符且恰好只含 `a-z2-7` 的自定义短名会被识别为旧频道，而不是公开频道。

实现：`server/src/core/channelKeysV2.js`、`app/backend/channel-keys-v2.mjs` 的 `resolveChannelHandle`。

## 4. 公开频道（D1）

有名字、任何人都应能加入的频道（例如社区大厅、第三方邀请里的固定频道）：

```
K_public(name) = H("channel/public", normalize(name))
```

`normalize` 沿用 v1 规则（去首尾空白、小写、`[a-z0-9_-]`、3–30 字符）。任何人都能由名字算出 `K`，因此**这类频道没有访问控制**，界面必须明确标注「公开频道：任何知道名字的人都能加入和阅读」。

| 选项                          | 后果                                                                                                 |
| ----------------------------- | ---------------------------------------------------------------------------------------------------- |
| A. 保留为公开频道（**推荐**） | 第三方邀请（`docs/st-chat-join-integration.md`，频道 `id` 为 3–30 字符短名）可继续工作；风险如实标注 |
| B. 取消自定义短名             | 只有随机凭证；第三方邀请必须改为携带 52 字符凭证                                                     |

无论选哪个，新建频道默认都是随机凭证；第三方邀请格式建议同时支持 `channels[].key`（随机凭证），短名 `id` 只用于公开频道。

## 5. 持有证明与 hello

```
proofKey = KDF(K, "channel/proof-key")
proof    = MAC(proofKey, "channel/proof", topic ‖ challenge ‖ pk_prover ‖ pk_verifier)
```

结构与 v1 相同（chat §3），只换派生与标签。可证明的 topic 只有 `chatTopic`。

`channel-hello` 频道项：

```json
{
  "channelId": "<64 hex>",
  "createdAt": "…",
  "lastMessageAt": "…",
  "memberAddresses": ["0x…"],
  "writerCoreKeys": ["<64 hex>"]
}
```

- 去掉 `channelKey`（v2 中与凭证同义，不得上线）与 `type`（v1 两端默认值不一致，且无人使用）。
- `memberAddresses` 两端都发送（v1 移动端不发）。
- 两端在从 hello 学到新 writer core key 后都向所有连接重发 hello（v1 只有桌面这样做，chat §4）。
- `writerCoreKeys` 每项必须是 64 位十六进制，每频道最多接受 256 个（v1 不校验）。

## 6. Writer core 与加密

### 6.1 Writer core 密钥

```
seed    = MAC(nodeSecret, "channel/writer", channelId ‖ u32be(generation))
keyPair = ed25519_seed_keypair(seed)
core    = store.get({ keyPair, valueEncoding: "json" })
```

- `nodeSecret`：桌面为节点种子（`node-identity.json`），移动为数据目录中的 32 字节随机密钥（现名 `cid-drive-secret`，实现时改名 `node-secret` 并迁移）。256 位，不上线。
- `generation`：从 0 开始；本地 writer core 损坏或不可写（v1 的 `#reopenChannelLocalWriter` 场景）时加 1 换新 core，旧 key 仍在 `writerCoreKeys` 中供读取。`generation` 记在本地频道记录里，丢失时从 0 起逐个尝试已知 key 即可恢复。
- 已核实：Corestore 支持以显式 `keyPair` 打开 core（`node_modules/corestore/index.js` `_auth`：无 `name` 时使用 `opts.keyPair`）。
- 已实验确认（2026-11-18）：writer core 的 key **不等于** `keyPair.publicKey`，而是 `Hypercore.key({ version: manifestVersion, signers: [{ publicKey }] })`；以 `{ keyPair }` 打开、写入、重启后以同一 `keyPair` 或以 core key 重开，均得到同一个可写 core 与原有数据。
- 因此实现时打开 writer core 必须显式传 `manifestVersion: 1`（当前两端 Corestore 默认值均为 1），使 core key 不随库默认值变化；hello 中交换的是 core key，不是公钥。
- 由此 writer core 不再依赖 Corestore 主密钥。主密钥保持现值不变：改它需要整体迁移存储（Corestore 拒绝打开主密钥不同的存储，`server/src/index.js` 约 610 行），而 v2 后已没有任何需要保密的 core 依赖它（CID drive 名含 256 位节点密钥，账号同步 core 名含 128 位随机数）。

### 6.2 加密（D2）

预留派生，**本次不实现**（推荐）：

```
encryptionKey = KDF(K, "channel/encryption")
```

评估：

- v2 中 writer core key 只经 hello 发给已证明持有 `K` 的对端，而 Hypercore 复制要求请求方知道 core key；非成员拿不到块。明文实际只暴露给持有 `K` 的人和他们的设备磁盘。
- 加密的价值出现在：非成员节点代为存储或转发频道 core（长期方案中「替别人转发字节」的常驻节点），或 core key 泄露。
- 实现需要选定块加密方式（Corestore/Hypercore 有 `encryption` 选项，格式与密钥轮换【待核实】）并处理与签名的先后（先签名后加密）。

以后作为能力 `e2ee1` 新增：双方 `session.features` 都含 `e2ee1` 时才写入加密条目；这要求条目层面能同时容纳明文与密文（envelope §5 未知类型跳过，可新增 `type: "sealed"`）。

## 7. 迁移（D7）

v1 频道 ID `L` 按 §3.1 的规则确定性映射：26 字符 v1 随机 ID 映射为 `K = H("channel/legacy", L)`；其他 v1 短名映射为公开频道 `K = H("channel/public", L)`，与之后按名字加入的新成员相遇。

- 所有成员各自升级后算出同一个 `K`，无需协调即可在 v2 topic 上重新相遇。
- v1 随机 ID（128 位）映射后的 `K` 安全性与 v1 相同，旧邀请链接中的 26 字符 ID 在 v2 中仍可直接加入；v1 自定义短名本来就可被猜出，迁移为公开频道并在界面标注。
- v1 历史：从 v1 直接升级时，将本节点已持有的旧 writer 文本保存为只读快照，按普通消息样式显示（仅作者名与纯文本）。不下载缺块，不公布旧 writer key，不把这些文本写入 v2 writer，也不将旧条目解释为可操作的附件或成员资料。桌面节点只向升级时已有的成员（含其迁移后的账号）提供旧文本。已经用早期 v2 候选改写过频道元数据的目录，不能从混合 writer 列表推断哪些是可信的本地旧记录；需要使用升级前备份重演。
- 迁移代码在之后的版本删除；新建频道不走此派生。

## 8. 测试向量

`vectors/v2/channel.json`：给定 `K` 的凭证文本、`channelId`、两个 topic、`proofKey` 与 `proof`；给定名字的公开频道 `K`；给定 v1 ID 的迁移 `K`；给定 `nodeSecret`、`channelId`、`generation` 的 writer 公钥。
