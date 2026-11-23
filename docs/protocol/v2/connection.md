# 连接

本文定义节点密钥、连接建立后每类 swarm 连接上跑什么协议，以及 MostBox 自定义的 P2P Ping 帧。swarm 与 topic 见 [discovery.md](discovery.md)。

范围：Holepunch 上游协议（HyperDHT 握手、加密流、Protomux、Hypercore 复制）只写协议名、版本与上游链接，不在本仓库逐字节重述；MostBox 自己定义的格式逐字节写出。

## 1. 上游协议栈

| 层         | 协议                                                               | 桌面版本 | 移动版本 | 上游                                                    |
| ---------- | ------------------------------------------------------------------ | -------- | -------- | ------------------------------------------------------- |
| 发现与打洞 | HyperDHT                                                           | 6.29.6   | 6.32.0   | https://github.com/holepunchto/hyperdht                 |
| 连接握手   | Noise `IK`，曲线 ed25519（`noise-curve-ed`）                       | 4.2.0    | 4.2.0    | https://github.com/holepunchto/noise-handshake          |
| 加密流     | `@hyperswarm/secret-stream`（libsodium secretstream）              | 6.9.1    | 6.9.1    | https://github.com/holepunchto/hyperswarm-secret-stream |
| 连接管理   | Hyperswarm                                                         | 4.17.2   | 4.17.0   | https://github.com/holepunchto/hyperswarm               |
| 通道复用   | Protomux                                                           | 3.10.1   | 3.11.0   | https://github.com/holepunchto/protomux                 |
| 消息编码   | compact-encoding                                                   | 2.19.2   | 3.2.0    | https://github.com/holepunchto/compact-encoding         |
| 复制       | Hypercore（Protomux 协议 `hypercore/alpha`，按 discoveryKey 配对） | 11.37.2  | 11.33.2  | https://github.com/holepunchto/hypercore                |
| 存储与命名 | Corestore                                                          | 7.13.0   | 7.12.0   | https://github.com/holepunchto/corestore                |
| 文件系统   | Hyperdrive                                                         | 13.3.4   | 13.3.3   | https://github.com/holepunchto/hyperdrive               |

版本取自 `node_modules/<包>/package.json` 与 `app/node_modules/<包>/package.json`（2026-11-18）。两端版本不同；桌面引擎 ↔ 移动核心的双向下载由 `npm run test:cross-core`（Node 宿主、本地 DHT testnet）覆盖，见 [验证状态](../../validation-status.md)。本仓库用到的 compact-encoding 编码（`fixed32`、`fixed64`）在 2.x 与 3.x 中都是不带长度前缀的原始字节。

连接建立后，`conn.remotePublicKey` 是对端在该 swarm 中的 32 字节 ed25519 公钥，由 Noise 握手认证。频道持有证明（`chat.md`）把双方的这个公钥绑进 HMAC。

Hyperswarm 4.x 中 `conn` 本身就是加密双工流，直接读写，不调用 `conn.openStream()`。

## 2. 节点密钥与 peerId

### 2.1 文件 swarm 密钥对

```
keyPair = crypto_sign_seed_keypair(seed)      // ed25519，libsodium
```

- 桌面：`seed` 为 32 字节节点种子，保存在数据目录 `node-identity.json`：`{"version": 1, "seed": "<64 位十六进制>"}`，首次启动随机生成并以独占创建 + fsync 写入，之后不变。桌面：`server/src/node/nodeIdentity.js:8-9`、`18-36`、`138-169`；`server/src/index.js:592`、`651-652`。
- 移动：不传 seed，Hyperswarm 每次启动随机生成。移动：`app/backend/mobile-core.mjs:609-617`。

HyperDHT `keyPair(seed)`：`node_modules/hyperdht/index.js` `static keyPair`、`hypercore-crypto` `keyPair`。

节点种子还用作桌面 CID drive 的 `secret`（[file-transfer.md](file-transfer.md) §4）。

### 2.2 聊天 swarm 与 Ping swarm 密钥对

两端都不传 seed，每次创建 swarm 时随机生成。

### 2.3 peerId

```
peerId = hex(文件 swarm 公钥)      // 64 个小写十六进制字符
```

peerId 在 `channel-hello` 中上线，hello 的 `authorName` 为 peerId 前 4 个字符。它标识节点连接，不是用户账号；用户身份由设备证书和内容签名验证。

注意：peerId 是**文件 swarm** 公钥，而它所在的帧走**聊天 swarm**；接收方不能用聊天连接的 `remotePublicKey` 校验 peerId。

- 桌面：`server/src/index.js:903-906`、`7270-7274`。
- 移动：`app/backend/mobile-core.mjs:3599-3605`（取不到时回退为字符串 `android`）、`2170-2174`。

两端差异：桌面 peerId 跨重启不变；移动每次启动都变。

## 3. 各 swarm 连接上的协议

| swarm      | 连接上的内容                                                                                                     | 定义                                                 |
| ---------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 文件 swarm | Protomux：`hypercore/alpha`（Corestore 复制，含 CID drive、频道 writer core、账号同步 core）+ `most-cid-drive/3` | [file-transfer.md](file-transfer.md) §2–3、`chat.md` |
| 聊天 swarm | 不用 Protomux：加密流上直接传换行分隔的 UTF-8 JSON 帧，单帧上限 128 KiB                                          | `chat.md`                                            |
| Ping swarm | 不用 Protomux：换行分隔的 UTF-8 JSON 帧，缓冲上限 4096 字节                                                      | §4                                                   |

文件 swarm：桌面 `server/src/index.js:676-686`，移动 `app/backend/mobile-core.mjs:619-624`。
聊天 swarm：桌面 `server/src/index.js:689-697`、`735` 起，移动 `app/backend/mobile-core.mjs:631-645`、`2885` 起。

## 4. P2P Ping

用户手动发起的双向连通性诊断，与文件和聊天无关；两端实现相同（桌面 `server/src/core/p2pPing.js`，移动 `app/backend/p2p-ping.mjs`，仅方法顺序不同）。

### 4.1 会话

1. 一方（host）生成 6 位十进制 `code`：取 4 字节随机数按大端读为无符号整数，≥ 4294000000 时重抽，再对 1000000 取模并左补 0。code 经带外渠道告诉另一方（join）。
2. 双方各为两个方向开一个临时 swarm，加入 topic（discovery §3.5）：

   ```
   topic = H("p2p-ping/topic", UTF8(code) ‖ 0x00 ‖ UTF8(direction) ‖ 0x00)
   ```

   | direction    | 发起方（client） | 应答方（server） |
   | ------------ | ---------------- | ---------------- |
   | `hostToJoin` | host             | join             |
   | `joinToHost` | join             | host             |

3. host 会话 2 分钟过期，join 等待 45 秒。

桌面：`server/src/core/p2pPing.js:9-20`、`124-157`、`227-277`、`350-356`。

### 4.2 帧

每帧是一行 JSON 加 `\n`：

```json
{
  "type": "p2p-ping",
  "version": 3,
  "direction": "hostToJoin",
  "nonce": "<32 位十六进制>",
  "proof": "<64 位十六进制>"
}
```

```
proofKey = H("p2p-ping/proof-key", UTF8(code) ‖ 0x00)
proof    = hex(MAC(proofKey, "p2p-ping/proof",
               UTF8(direction) ‖ 0x00 ‖ UTF8(type) ‖ 0x00 ‖ UTF8(nonce) ‖ 0x00))
```

`code`、`direction`、`type`、`nonce` 都按 UTF-8 字符串参与哈希（`nonce` 是十六进制字符串本身，不是解码后的字节）。

交换（每条连接）：

1. 发起方连上后生成 16 字节随机 `nonce`（32 位小写十六进制），发 `p2p-ping`。
2. 应答方校验 `direction` 与本方向一致、`nonce` 匹配 `^[0-9a-f]{32}$`、`version === 3`、`proof` 正确，回 `p2p-pong`（同一 nonce）。
3. 发起方校验 `p2p-pong` 后发 `p2p-ack`，该方向成功。
4. 应答方校验 `p2p-ack` 后该方向成功。

任何不符合预期的帧、空行、超过 4096 字节的缓冲或 JSON 错误都会关闭该连接，继续等待其他连接。一个方向成功后关闭该方向的其他候选连接。

桌面：`server/src/core/p2pPing.js:67-107`（证明与校验）、`159-190`（编解码）、`410-560`（交换）。

### 4.3 向量

`code = "123456"`、`direction = "hostToJoin"` 时，topic 为：

```text
797182b27b933fc78fa74dd3e6ed440adce67cc2779cbf4acab28c6c56fefb1c
```

固定 nonce 的完整三帧、证明密钥及两个方向的 topic 见 [Ping 向量](../vectors/v2/p2p-ping.json)。发送方 JSON 键顺序为 `type, version, direction, nonce, proof`；接收方不依赖键顺序。

## 5. 互通检查

原语见 [版本与信封](envelope.md) §3。节点种子向量是 `../vectors/node.json`，现行 Ping 向量是 `../vectors/v2/p2p-ping.json`；旧 Ping 向量不用于新连接。上游版本表是 2026-11-18 的核对快照，不代表以后安装的版本已通过同样验证。

---

[目录](README.md) · 上一篇：[标识符与链接](identifiers.md) · 下一篇：[发现](discovery.md)
