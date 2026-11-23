# 发现

本篇定义节点如何通过 HyperDHT 相遇；连接建立后的协议见 [连接](connection.md)。派生原语见 [版本与信封](envelope.md) §3。

## 1. DHT 与引导节点

参考实现使用 Hyperswarm 4.x 和公共 HyperDHT，默认引导地址为：

```text
88.99.3.86@node1.hyperdht.org:49737
142.93.90.113@node2.hyperdht.org:49737
138.68.147.8@node3.hyperdht.org:49737
```

格式为 `[建议 IP@]主机:端口`，有建议 IP 时不做 DNS 查询。桌面配置见 `server/src/config.js`，移动见 `app/backend/mobile-core.mjs`；桌面节点的 `bootstrap` 选项用于测试网覆盖。以上是参考实现的默认入口，不能据此认定第三方已能接替公共引导设施，退出演练见 [验收指南](../../acceptance.md#公共协议独立性验收)。

`join(topic, {server: true, client: true})` 同时宣告自己、查找宣告者并主动连接。topic 一律为 32 字节。

## 2. Swarm

| swarm | 密钥与用途                                                     | 连接内容                            |
| ----- | -------------------------------------------------------------- | ----------------------------------- |
| 文件  | 桌面由持久节点种子派生；移动每次启动随机；用于文件与 core 复制 | Corestore 复制与 `most-cid-drive/3` |
| 聊天  | 每次启动随机；用于频道授权、hello、在线状态、语音和账号 hello  | 换行分隔 JSON                       |
| Ping  | 诊断会话临时创建，按方向分开                                   | 独立 Ping 帧                        |

两个长期 swarm 的本地参数为 `maxPeers: 64`、`firewall: () => false`、`connectionKeepAlive: 5000`、`randomPunchInterval: 20000`、`handshakeTimeout: 120000`。接受连接不等于授予频道权限。同一对端可在两个 swarm 中分别建立连接；文件公钥和聊天公钥不能混用。

## 3. Topic

| 用途       | 派生                                                              | swarm | 加入时机             |
| ---------- | ----------------------------------------------------------------- | ----- | -------------------- |
| 文件       | `H("topic/file", digest)`                                         | 文件  | 发布、下载、做种恢复 |
| 频道复制   | `H("topic/channel-replication", K)`                               | 文件  | 加入或恢复频道       |
| 频道聊天   | `H("topic/channel-chat", K)`                                      | 聊天  | 加入或恢复频道       |
| 账号复制   | `H("topic/account-sync", syncKey)`                                | 文件  | 桌面启用账号同步     |
| 账号 hello | `H("topic/account-sync-chat", syncKey)`                           | 聊天  | 同上                 |
| Ping       | `H("p2p-ping/topic", UTF8(code) ‖ 0x00 ‖ UTF8(direction) ‖ 0x00)` | Ping  | 诊断会话期间         |

### 3.1 文件

`digest` 是 CID 的 32 字节 multihash 摘要；topic 不等于摘要，不截断。以 server/client 双模式加入，暂停或删除时离开。只有知道 CID 的人才可把 topic 对应到文件；知道 CID 仍可经 DHT 查询在线宣告者的 IP。持有证明和其余可见信息见 [文件访问](file-privacy.md)。

### 3.2 频道

`K` 的来源见 [频道密钥](channel-keys.md) §3–4。只加入频道复制与聊天两个 topic，不存在“频道候选”topic 或加入前同名探测。加入就是加入相应 topic；离开频道时退出两者。topic 不能从线上公开 `channelId` 推出。应用层 hello 和在线状态仍须逐连接通过频道持有证明。

### 3.3 账号同步

`syncKey` 是原始 32 字节子密钥，见 [签名与账号](signatures.md) §7。不得对带 `0x` 的字符串另加 `:chat` 求哈希。收到成功解密的 `account-hello` 后，桌面按其中的 `appPublicKey` 在文件 swarm 调用 `joinPeer`，日志格式见 [聊天](chat.md) §8。移动核心未实现账号同步。

### 3.4 向量

现行 topic 向量分别位于 `../vectors/v2/file.json`、`channel.json`、`chat-identity.json`、`p2p-ping.json`。分类与旧夹具限制见 [向量索引](../vectors/README.md)。

### 3.5 Ping

`code` 为六位数字字符串，`direction` 为 `hostToJoin` 或 `joinToHost`。每个方向一端只做 client、另一端只做 server；会话、证明和帧见 [连接](connection.md) §4。

## 4. 重新查找

Hyperswarm 默认每十分钟重新查找已加入的 topic。下载等待来源且没有候选 drive 时，每 5000 ms 对该文件 topic 调用 `discovery.refresh()`，避免后上线的种子要等十分钟才被发现。频道和账号同步没有额外刷新，依赖默认节奏与既有连接。

## 5. 中继

桌面节点配置 `relayPublicKey` 非空时，作为 `relayThrough` 传给 swarm；默认为空，代码不内置运营者地址或公钥。Hyperswarm 在要求强制中继或 NAT 随机端口映射等路径使用它。中继转发加密流，不改变上层帧、证明或 Noise 公钥。

移动后端接受 `relayThrough`，但 App 当前未传入配置，不能宣称移动端已具备可用中继入口。没有可用中继时，对称 NAT 等网络可能无法连接。

盲中继可观察公钥、时间与流量；持有群加入值、保存消息的节点可读取正文，不能把这两种角色混为一谈。详细披露见 [隐私说明](../../../PRIVACY.md)。

## 6. 实现位置

桌面：`server/src/config.js`、`server/src/index.js`、`server/src/node/accountSync.js`、`server/src/node/config.js`。移动：`app/backend/mobile-core.mjs`、`app/backend/channel-keys-v2.mjs`、`app/backend/p2p-ping.mjs`。上游发现与打洞报文按 [连接](connection.md) §1 所列协议实现。

---

[目录](README.md) · 上一篇：[连接](connection.md) · 下一篇：[频道密钥与授权](channel-keys.md)
