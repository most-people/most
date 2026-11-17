# 发现

本文定义节点如何在 HyperDHT 上找到彼此：用哪些 swarm、加入哪些 topic、topic 怎么算、何时重新查找。连接建立后的握手与帧格式见 `connection.md`（待写）；标识符见 [identifiers.md](identifiers.md)。

## 1. DHT 与引导节点

所有 swarm 都使用 Hyperswarm 4.x（底层 HyperDHT）的公共 DHT，引导节点与 Holepunch 公共网络相同：

```
88.99.3.86@node1.hyperdht.org:49737
142.93.90.113@node2.hyperdht.org:49737
138.68.147.8@node3.hyperdht.org:49737
```

格式为 `[建议 IP@]主机:端口`，有建议 IP 时不做 DNS 查询。

- 桌面：`server/src/config.js:45-49`；节点选项 `bootstrap` 只用于测试网覆盖（`server/src/index.js:297`、`319`）。
- 移动：`app/backend/mobile-core.mjs:89-93`。

topic 是 32 字节。`join(topic, { server: true, client: true })` 表示既在 DHT 上宣告自己（server），又查找其他宣告者并主动连接（client）。

## 2. Swarm 一览

每个节点同时运行两个长期 swarm，外加一个按需创建的诊断 swarm：

| swarm      | 密钥对                           | 用途                                            | 连接上运行的协议                    |
| ---------- | -------------------------------- | ----------------------------------------------- | ----------------------------------- |
| 文件 swarm | 桌面：由节点种子派生；移动：随机 | CID 文件、频道 writer core 复制、账号同步复制   | Corestore 复制 + `most-cid-drive/2` |
| 聊天 swarm | 每次启动随机                     | 频道握手、hello、在线状态、语音信令、账号 hello | 换行分隔 JSON 帧（`chat.md`）       |
| P2P Ping   | 每次会话随机                     | 用户手动发起的连通性诊断                        | Ping 帧（§3.5）                     |

两个长期 swarm 参数相同：`maxPeers: 64`、`firewall: () => false`（接受所有入站连接）、`connectionKeepAlive: 5000`、`randomPunchInterval: 20000`、`handshakeTimeout: 120000`。

- 桌面：`server/src/index.js:651-660`（文件，`seed: nodeSeed`）、`689-697`（聊天）、`702-717`（Ping）；常量 `server/src/config.js:9-16`。
- 移动：`app/backend/mobile-core.mjs:609-617`（文件，无 seed）、`631-639`（聊天）、`652-668`（Ping）；常量 `71-72`。

两端差异：桌面文件 swarm 的公钥在重启后不变；移动端每次启动都变。`most-cid-drive/2` 与频道复制都不依赖对端公钥是否固定。

一个对端可能同时出现在两个长期 swarm 中，此时它与本节点之间有两条独立连接，彼此没有关联。

## 3. Topic

所有 topic 都是 32 字节。下表中 `sha256(s)` 指对 UTF-8 字符串 `s` 求 SHA-256。

| Topic          | 派生                                                              | swarm | 加入时机                  |
| -------------- | ----------------------------------------------------------------- | ----- | ------------------------- |
| 文件           | CID 的 multihash digest（不再哈希）                               | 文件  | 发布、下载、做种恢复      |
| 频道复制       | `sha256("most-box-room-channel:" ‖ channelKey)`                   | 文件  | 加入或恢复频道            |
| 频道聊天       | `sha256("most-box-room-channel:" ‖ channelKey ‖ ":chat")`         | 聊天  | 加入或恢复频道            |
| 频道候选       | `sha256("most-box-room-id:" ‖ channelId ‖ ":candidates")`         | 聊天  | 加入频道；创建/加入前探测 |
| 账号同步复制   | `syncTopic`（32 字节原值）                                        | 文件  | 账号同步启用（仅桌面）    |
| 账号同步 hello | `sha256("0x" ‖ hex(syncTopic) ‖ ":chat")`                         | 聊天  | 同上（仅桌面）            |
| P2P Ping       | `sha256("most-box-p2p-ping-v2" ‖ 0x00 ‖ code ‖ 0x00 ‖ direction)` | Ping  | 诊断会话期间              |

`channelKey` 与 `channelId` 当前相同（规范化后的频道 ID，见 identifiers §3）。

### 3.1 文件 topic

```
topic = CID.multihash.digest      // sha2-256 摘要，32 字节
```

不要额外哈希、截断或加前缀。由于 CID 的 digest 就是根块的 sha256，知道 CID 的人都能算出 topic 并经 DHT 枚举做种者（隐私边界见 `PRIVACY.md`）。

以 `server: true, client: true` 加入。暂停或删除时离开。

桌面：`server/src/core/cidTopic.js:14-45`、`server/src/index.js:6148-6190`、`6234`；移动：`app/backend/mobile-core.mjs:84-87`、`239-263`、`3246`、`3330`。

### 3.2 频道 topic

加入频道时三个 topic 都以 `server: true, client: true` 加入；删除频道时全部离开。

创建或加入频道前，节点可单独加入「频道候选」topic 探测已有同名频道：等待 600 ms（`CHANNEL_DISCOVERY_TIMEOUT`），收集期间经 hello 得到的候选（候选在 30 s 内有效，`CHANNEL_CANDIDATE_TTL`）；探测结束后若本机并未持有该频道，离开该 topic。

桌面：`server/src/index.js:6947-6972`（派生）、`4766-4791`（加入）、`4805-4841`（探测）、`4044-4078`（离开）、`server/src/core/channelIdentity.js:4-6`（常量）。
移动：`app/backend/channel-protocol.mjs:459-478`（派生）、`17-18`（常量）、`app/backend/mobile-core.mjs:1662-1697`（加入）、`1705-1742`（探测）。

为什么要两个聊天 topic：「频道聊天」只给已持有频道的节点相遇；「频道候选」让尚未持有频道的节点也能连上，在持有证明通过后拿到 hello（`chat.md`）。

### 3.3 账号同步 topic（仅桌面）

`syncTopic` 的派生见 identifiers §4.4。代码中 `syncTopic` 以 `0x` 前缀小写十六进制字符串保存，聊天 swarm 的 topic 对这个**带 `0x` 的字符串**加 `:chat` 后求 SHA-256。

收到同账号设备的 `account-hello`（经聊天 swarm）后，桌面直接按对方文件 swarm 公钥调用 `swarm.joinPeer(publicKey)` 拨号，以免等待文件 swarm 自行发现。

桌面：`server/src/node/accountSync.js:48-50`、`347-352`、`233-247`。移动端没有账号同步。

### 3.4 示例

```
CID  bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e   ("hello world")
文件 topic  b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9

频道 ID / channelKey  general
频道复制  e6afb000137fb0dea402657db5d88a98ffe2b940c1e75609178d385d10403942
频道聊天  ebd4418a7b9077c92cb9e6066e0d1b9f8f47ba243a74bee33b8069e43a419b4c
频道候选  b253166d54283e7a1977a41bb11caa4229243bc04ec9c764b04b9fbebf3bbdf1
```

这些值将移入 `vectors/`（待写）。

### 3.5 P2P Ping topic

用户手动发起的诊断：一方生成 6 位数字 `code`，双方各开一个临时 swarm，按方向 `hostToJoin` / `joinToHost` 加入不同 topic，一端只做 server、另一端只做 client。帧格式与证明在 `connection.md`（待写）描述。

桌面：`server/src/core/p2pPing.js:10-20`；移动：`app/backend/p2p-ping.mjs:10-17`、`147-157`、`350-356`。

## 4. 重新查找

Hyperswarm 对已加入的 topic 每 10 分钟才重新查找一次。下载等待来源且没有候选 drive 时，节点每 5000 ms（`TOPIC_LOOKUP_INTERVAL`）对该文件 topic 调用 `discovery.refresh()`，否则在首次查找之后才宣告的种子要等 10 分钟才会被发现（见 file-transfer §6）。

频道与账号同步 topic 没有额外刷新，依赖 Hyperswarm 默认节奏和已建立的连接。

## 5. 中继

节点配置 `relayPublicKey`（32 字节公钥，十六进制）非空时，作为 Hyperswarm `relayThrough` 传给所有 swarm；为空则不使用中继。代码中没有默认中继。

Hyperswarm 只在以下情况经中继连接：HyperDHT 要求强制中继（打洞失败），或本机 NAT 为随机端口映射（`dht.randomized`）。中继只转发已加密的流，不改变上层协议。

- 桌面：`server/src/node/config.js:34`、`61-76`；`server/index.js:459-460`；`server/src/index.js:659`、`696`、`714`。
- 移动：`app/backend/mobile-core.mjs:551`、`616`、`638`、`659` 接受 `relayThrough`，但应用没有传入，移动端当前不使用中继。
- Hyperswarm 行为：`node_modules/hyperswarm/index.js` `toRelayFunction`。

隐私披露见 `PRIVACY.md`。

## 6. 待补

- Hyperswarm/HyperDHT 自身的宣告、查找与打洞报文：引用上游规范还是在本仓库描述，待定（`connection.md`）。
- 向量：文件 topic、三个频道 topic、账号同步两个 topic、Ping topic。
