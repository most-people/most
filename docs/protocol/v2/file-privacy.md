# 文件发现与访问证明

原语见 [版本与信封](envelope.md) §3。内容身份与传输流程分别见 [标识符](identifiers.md)、[文件传输](file-transfer.md)。

## 1. 权限模型

知道 CID 即可尝试下载；链接泄露不算协议漏洞。仅观察到 DHT topic 不应使观察者获得 CID 或 driveKey。每个种子只签名自己的 drive，下载者仍必须独立重算 CID，不信任 Hypercore 签名代表内容正确。

## 2. 范围

本篇定义文件 topic、带连接绑定的 `want` 证明、应答条件和本地 drive 命名。当前不加密文件内容，也不承诺匿名、永久存储或仅凭 topic 隐藏节点 IP。

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
| 消息 1 `have` | `fixed64`：`topic ‖ driveKey`                         |

通道无 id。Protomux 在打开通道时交换 handshake；`fixed32`、`fixed64` 均是不带长度前缀的原始字节。消息编号由上表注册顺序确定。

### 4.2 证明

请求方 A 向应答方 B 证明自己知道 `digest`：

```
wantKey = H("file/want-key", digest)
proof   = MAC(wantKey, "file/want", topic ‖ challenge_B ‖ pk_A ‖ pk_B)
```

- `challenge_B`：B 在 handshake 中发给 A 的随机数。
- `pk_A`、`pk_B`：双方在**文件 swarm** 连接上的 Noise 公钥（读取 `conn.noiseStream || conn` 上的 `publicKey` 与 `remotePublicKey`）。经中继的连接中 Noise 仍端到端，公钥不变。
- 绑定 challenge 与双方公钥：证明不能重放到别的连接，也不能转给第三方使用。

### 4.3 应答规则

B 收到 `want(topic, proof)`：

1. 本机持有该 topic 对应的已校验内容（已加入 topic、有 holding、`/<cid>` 可读）；
2. 用本机已知的 `digest` 重算 `proof`，常数时间比较；
3. 都满足才回 `have(topic, driveKey)`；否则不回应。
4. 对调用方交给通道验证的已知种子 topic，同一连接累计 16 次无效证明后关闭该通道。未知 topic 通常被调用方忽略，不应把这条限制描述为所有未知请求都会累计。

### 4.4 请求方

A 在通道打开后、以及等待来源期间每 2000 ms，对每个进行中的下载发 `want`；发现刷新与等待节奏见 [文件传输](file-transfer.md) §6–7。收到 `have` 后只接受进行中下载的候选，读取、校验与换来源见 [文件传输](file-transfer.md) §6。

## 5. driveKey 与内容可见性

driveKey 是读取 Hyperdrive 元数据的 key。持有者可列出 `/<cid>`，获得 CID，并读取内容。正常协议只向证明知道 CID 摘要的请求方返回它；这不意味着 driveKey 从日志、接口或其他渠道泄露没有风险。

当前 drive 内容不加密，不定义额外文件加密能力。不得把“需要证明才能取得 key”写成“运营者看不到内容”，也不得把 key 的保密性当作 CID 校验的替代。

## 6. 本节点 CID drive 名

```
driveName = "cid-drive-" ‖ hex(MAC(secret, "cid-drive/name", topic))
```

`topic` 为原始 32 字节，不是十六进制字符串。`secret` 为桌面节点种子或移动 `node-secret`；drive 在对应 Corestore namespace 中打开。这是参考实现的本地命名约定，不上线，第三方须保证自己 drive 的签名私钥不与其他种子共享。

## 7. DHT 与对端可见的信息

当前可见信息与 [隐私说明](../../../PRIVACY.md) 对照：

| 谁能看到                          | 看到什么                                                                                                                                                                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 任何 DHT 节点                     | 文件 topic（无法还原 CID）；宣告该 topic 的节点的 IP、端口、文件 swarm 公钥；宣告者数量                                                                                                                                                                       |
| 知道 CID 的人                     | 以上全部，且能把 topic 对应到 CID：**仍可枚举该文件所有在线做种者与下载者的 IP**（不可避免，v1 已实测）                                                                                                                                                       |
| 与本节点建立文件 swarm 连接的对端 | 本节点所有已打开 core（CID drive、频道 writer core、账号同步 core）的 discoveryKey（已核实：`node_modules/corestore/index.js` `replicate` 对每条连接挂载全部已打开 core）。discoveryKey 不能还原 core key、读不到内容，但可用于把同一个 core 在不同节点间关联 |
| 中继                              | 连接双方公钥、时间与流量（`PRIVACY.md` 已披露）                                                                                                                                                                                                               |

discoveryKey 的关联风险当前仍存在；本规范没有定义按连接隔离 core 的额外能力。

## 8. 旧版升级边界

参考实现已移除 0.5.x 共享 drive 的一次性迁移，不再打开旧 drive 或搬运旧块；只读取本节点自有 CID drive 中的内容。原有用户数据不由此删除，但仅存于旧 drive 的文件须通过当前版本重新发布或下载。已完成迁移的文件不受影响。

本次清理不改变现行文件 topic、drive 名、证明或线上报文字节，也不改变旧聊天历史归档的读取规则。

## 9. 攻击与接力检查

| 用例                                          | 期望                                                       |
| --------------------------------------------- | ---------------------------------------------------------- |
| 只知道 topic，发 `want(topic, 随机 proof)`    | 已知种子 topic 收不到 `have`；无效证明累计 16 次后关闭通道 |
| 截获 A↔B 的有效 `want`，在 C↔B 连接上重放     | 收不到 `have`（公钥与 challenge 不同）                     |
| 知道 CID 的正常下载者                         | 照常下载并校验                                             |
| 只知道 topic，经 Corestore 复制尝试打开 drive | 没有 driveKey，无法请求块                                  |
| 三节点接力（发布者退出）                      | 发布者退出后新下载者仍完成下载与 CID 校验                  |

上述用例是检查目标，不代表每条已通过真实网络验收。既有失败与覆盖范围见 [验证状态](../../validation-status.md)。

## 10. 测试向量

`../vectors/v2/file.json`：CID → v2 topic；`wantKey`；给定 challenge 与双方公钥的 `proof`；给定 secret 的 drive 名；`want` / `have` 载荷。

---

[目录](README.md) · 上一篇：[聊天与账号同步](chat.md) · 下一篇：[文件传输](file-transfer.md)
