# 2.2 文件 topic 单向化与 `want` 证明

状态：已确认（2026-11-18）。原语与标签见 [envelope.md](envelope.md) §3。

## 1. 问题（v1 现状）

- 文件 topic = CID 的 multihash 摘要（discovery §3.1）。CID 只是「版本 + codec + 摘要」的编码，DHT 节点看到 topic 后补上 codec（raw 或 dag-pb，两种）即可还原 CID。
- `want(topic)` 不需要任何证明（file-transfer §3.2）：只要拿到 topic，连上做种者、发 `want` 就能得到 driveKey，再读 drive 中的 `/<cid>` 下载全文。
- 因此「CID 即权限」实际退化成「topic 即权限」，而 topic 对所有 DHT 节点公开。

## 2. 目标

- DHT 上看到 topic 的人无法还原 CID。
- 只有知道 CID 的人能拿到 driveKey。
- 不改 `most://` 链接、CID、drive 内路径、下载后校验和做种模型。

## 3. 文件 topic

```
digest = CID.multihash.digest                 // 32 字节
topic  = H("topic/file", digest)              // = SHA-256("most/v2/topic/file" ‖ 0x00 ‖ digest)
```

SHA-256 单向：已知 topic 求 digest 需要原像攻击。知道 CID 的人仍可算出 topic，这是做种发现所必需的。

## 4. `most-cid-drive/3`

### 4.1 通道

| 字段          | 值                                                    |
| ------------- | ----------------------------------------------------- |
| Protomux 协议 | `most-cid-drive/3`                                    |
| handshake     | `fixed32`：本端为这条连接生成的 32 字节随机 challenge |
| 消息 0 `want` | `fixed64`：`topic ‖ proof`                            |
| 消息 1 `have` | `fixed64`：`topic ‖ driveKey`（不变）                 |

Protomux 的 handshake 在通道打开时双方交换（已核实：`node_modules/protomux/index.js` `open(handshake)` / `onopen(handshake)`），无需额外往返。

### 4.2 证明

请求方 A 向应答方 B 证明自己知道 `digest`：

```
wantKey = H("file/want-key", digest)
proof   = MAC(wantKey, "file/want", topic ‖ challenge_B ‖ pk_A ‖ pk_B)
```

- `challenge_B`：B 在 handshake 中发给 A 的随机数。
- `pk_A`、`pk_B`：双方在**文件 swarm** 连接上的 Noise 公钥（`conn.remotePublicKey` 与本端 `swarm.keyPair.publicKey`）。经中继的连接中 Noise 仍端到端，公钥不变。
- 绑定 challenge 与双方公钥：证明不能重放到别的连接，也不能转给第三方使用。

### 4.3 应答规则

B 收到 `want(topic, proof)`：

1. 本机持有该 topic 对应的已校验内容（v1 条件不变：已加入 topic、有 holding、`/<cid>` 可读）；
2. 用本机已知的 `digest` 重算 `proof`，常数时间比较；
3. 都满足才回 `have(topic, driveKey)`；否则不回应。
4. 同一连接上累计 16 次无效证明后关闭该通道（防止把 B 当作验证预言机做在线猜测；猜测本身已是 2^256 空间，此限制只为节省资源）。

### 4.4 请求方

A 在通道打开后、以及等待来源期间每 2000 ms，对每个进行中的下载发 `want`（节奏不变，file-transfer §3.1）。收到 `have` 后的读取、校验、换来源逻辑不变（file-transfer §6）。

## 5. driveKey 与 drive 内容（D8）

问题：只知道 driveKey 的人能否列出 drive 得到 CID？**能**——drive 中的路径就是 `/<cid>`，Hyperdrive 的目录（Hyperbee）可被任何持有 driveKey 的人读取。

评估：

- v2 中 driveKey 只经 `have` 发出，而 `have` 只发给已证明知道 `digest` 的请求方；知道 `digest` 即可还原 CID。所以拿到 driveKey 的人本来就知道 CID，列目录不泄露新信息。
- 剩余风险是 driveKey 从别处泄露（日志、API 返回、截图）。v1 的 API 与日志会输出 driveKey 前缀或全文，实现时改为不输出全文。
- 用摘要派生的密钥加密 drive 内容（Hyperdrive/Hypercore 有块加密选项）能进一步降低该风险，但要改存储格式和迁移，且收益只针对 driveKey 泄露。

**推荐：不加密 drive 内容**，只收紧 driveKey 的输出。若负责人要求加密，加密密钥定为 `KDF(digest, "cid-drive/encryption")`，作为后续可选项另行设计。

## 6. 本节点 CID drive 名

```
driveName = "cid-drive-" ‖ hex(MAC(secret, "cid-drive/name", topic))
```

只是换成统一标签（v1 为 `HMAC(secret, "most-cid-drive-v2:" ‖ topicHex)`）；`topic` 改为 v2 文件 topic，因此 drive 名与 driveKey 全部变化，需要迁移（§8）。

## 7. 改动后 DHT 与对端仍可见的信息

写入 `PRIVACY.md`（实现时同步）：

| 谁能看到                          | 看到什么                                                                                                                                                                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 任何 DHT 节点                     | 文件 topic（无法还原 CID）；宣告该 topic 的节点的 IP、端口、文件 swarm 公钥；宣告者数量                                                                                                                                                                       |
| 知道 CID 的人                     | 以上全部，且能把 topic 对应到 CID：**仍可枚举该文件所有在线做种者与下载者的 IP**（不可避免，v1 已实测）                                                                                                                                                       |
| 与本节点建立文件 swarm 连接的对端 | 本节点所有已打开 core（CID drive、频道 writer core、账号同步 core）的 discoveryKey（已核实：`node_modules/corestore/index.js` `replicate` 对每条连接挂载全部已打开 core）。discoveryKey 不能还原 core key、读不到内容，但可用于把同一个 core 在不同节点间关联 |
| 中继                              | 连接双方公钥、时间与流量（`PRIVACY.md` 已披露）                                                                                                                                                                                                               |

最后一行 discoveryKey 关联不在本次范围；如需处理，后续可按连接所属 topic 只挂载相关 core。

## 8. 迁移

只支持 0.5.x → 0.8.0 一条升级路径（生产节点停在 0.5.x；0.6.0 / 0.7.0 只在测试环境运行过，其 `cid-drive-<HMAC("most-cid-drive-v2:"…)>` drive 不迁移）。沿用 `docs/cid-drive-protocol.md` §5 的一次性迁移：

- 启动恢复 holding 时，若本节点新 drive 中没有 `/<cid>`，从 0.5.x 的共享 drive `drive-<digestHex>` 读出、重算 CID、写入新 drive，成功后清除旧块；失败按「本地内容缺失」处理。
- 不再加入摘要 topic，只加入 v2 文件 topic。
- `published-files.json` / `node-holdings.json` 中的 `topic`、`driveName` 字段改为现算，不再信任记录值。
- 迁移代码在 0.8.0 之后、确认生产节点已升级后再删除。

## 9. 攻击测试（实现时补）

| 用例                                          | 期望                                   |
| --------------------------------------------- | -------------------------------------- |
| 只知道 topic，发 `want(topic, 随机 proof)`    | 收不到 `have`；16 次后通道被关闭       |
| 截获 A↔B 的有效 `want`，在 C↔B 连接上重放     | 收不到 `have`（公钥与 challenge 不同） |
| 知道 CID 的正常下载者                         | 照常下载并校验                         |
| 只知道 topic，经 Corestore 复制尝试打开 drive | 没有 driveKey，无法请求块              |
| 三节点接力（发布者退出）                      | `npm run test:protocol` 通过           |

## 10. 测试向量

`vectors/v2/file.json`：CID → v2 topic；`wantKey`；给定 challenge 与双方公钥的 `proof`；给定 secret 的 drive 名；`want` / `have` 载荷。
