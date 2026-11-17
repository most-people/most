# 标识符

本文定义 CID、`most://` 链接、频道 ID 和账号相关标识符。由它们派生的 DHT topic 见 `discovery.md`（待写）；文件传输见 [file-transfer.md](file-transfer.md)。

## 1. CID

### 1.1 计算参数

文件内容的身份是 UnixFS CID v1，按下表计算。第二个客户端必须得到逐字节相同的 CID。

| 参数         | 值                                     |
| ------------ | -------------------------------------- |
| CID 版本     | 1                                      |
| 叶子         | raw（codec `0x55`），`rawLeaves: true` |
| 分块         | 定长 262144 字节（256 KiB）            |
| DAG 布局     | balanced，每个节点最多 174 个子节点    |
| 中间节点     | dag-pb（codec `0x70`），UnixFS `file`  |
| 单块文件     | 不包中间节点，CID 即 raw 叶子 CID      |
| 哈希         | sha2-256（multihash `0x12`，32 字节）  |
| 包目录       | 否，`wrapWithDirectory: false`         |
| mtime / mode | 不写                                   |

代码只显式传入 `cidVersion: 1, rawLeaves: true, wrapWithDirectory: false`，其余取 `ipfs-unixfs-importer` 默认值（未设置 `profile`）：分块 `DEFAULT_CHUNK_SIZE_256KIB`、`balanced` 布局 `DEFAULT_MAX_CHILDREN_PER_NODE = 174`、`reduceSingleLeafToSelf: true`。这组参数与 kubo `ipfs add --cid-version=1 --raw-leaves --chunker=size-262144 --max-file-links=174` 一致。

- 桌面：`server/src/core/cid.js:88-147`，importer `17.1.1`
- 移动：`app/backend/mobile-core.mjs:279-340`，importer `17.0.1`
- 外部对照：`scripts/cid-oracle.js`（`npm run test:cid-oracle`，与 kubo 0.43.1 比对 0B 到 10GiB 共 13 个样本）

升级 importer 时，库默认值可能变化（17.1.1 已新增 `unixfs-v1-2025` 配置，默认 1MiB 分块、1024 子节点，当前代码未启用）。规范以上表为准，不以库默认值为准。

### 1.2 黄金样本

| 名称          | 内容                                         | CID                                                           |
| ------------- | -------------------------------------------- | ------------------------------------------------------------- |
| `empty`       | 0 字节                                       | `bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku` |
| `hello-world` | ASCII `hello world`                          | `bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e` |
| `cross-chunk` | 262145 字节，第 i 字节 = `i % 251`           | `bafybeiexg2oqkfnj56l7fcmawswqbijt5shq4b5rg6a546uwpkqqzwjioi` |
| `layer+1`     | 174 × 262144 + 1 字节，第 i 字节 = `i % 251` | `bafybeib4y7ghw2rq7bracc4xwtxrbzo7cfvagdpte2tmrkgwl6dyard3cm` |

桌面：`server/tests/integration/cid.test.js:84-110`；移动：`app/src/mobileCore/cid.test.ts:28-63`。这些样本将移入 `vectors/`（待写），由两端测试共同读取。

### 1.3 目录 CID（仅桌面）

目录集合用同一组参数导入多个文件，路径按 `localeCompare` 排序，根为 UnixFS 目录（dag-pb）。路径必须是相对路径，不得含 `..`，`.` 与空段被丢弃，重复路径报错。若所有路径有共同的第一段，则以它为根目录名。

桌面：`server/src/core/cid.js:31-69`、`149` 起。移动端不生成目录 CID。

### 1.4 字符串形式

当前所有客户端输出的 CID 字符串都是 multibase base32 小写（`b` 前缀，`bafk…` / `bafy…`）。这个字符串同时用作 drive 路径 `/<cid>` 和本地记录的键，因此**同一内容必须使用同一字符串**。

校验规则（两端相同）：能被 `multiformats` `CID.parse` 解析、版本为 1、multihash digest 长度为 32 字节。

桌面：`server/src/core/mostLink.js:63-84`；移动：`app/backend/mobile-core.mjs:239-263`、`app/src/mobileCore/protocol.ts:103-135`。

已知问题：`CID.parse` 也接受 base58btc（`z` 前缀）的 CID v1，两端都不把它转换成 base32，而是原样用于 drive 路径。用 `z…` 形式链接下载 base32 发布的文件时，topic 相同、能连上种子，但 `/<cid>` 路径不同，读不到内容。大写 base32（`B` 前缀）被拒绝。

## 2. `most://` 链接

### 2.1 语法

```
most-link = "most://" cid [ "?filename=" pct-encoded-name ]
```

- `cid`：§1.4 的 base32 字符串。
- `filename`：可选，`encodeURIComponent` 编码；只用于展示与保存路径，不参与内容身份。
- 不允许其他查询参数、路径或片段。

生成：文件名去首尾空白后为空则省略查询部分。桌面 `server/src/core/mostLink.js:139-145`；移动 `app/backend/mobile-core.mjs:265-269`、`app/src/mobileCore/protocol.ts:26-30`。

示例：

```
most://bafkreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e?filename=hello%20world.txt
```

### 2.2 解析（宽松）

下载入口按以下步骤解析，便于粘贴网页地址或裸 CID：

1. 去首尾空白，为空则报错。
2. 取「尾部目标」：
   - 若能解析为 URL 且协议是 `most:`，且路径为空（或有查询且路径只有 `/`），取 `host + search`；
   - 否则（含其他协议的 URL、无法解析为绝对 URL 时以 `https://most.box/` 为基准解析），取路径最后一段（有查询时先去掉末尾 `/`）加 `search`。
3. 以第一个 `?` 分开 CID 与查询串。
4. 查询串中只允许 `filename`；出现其他键即报错。多次出现取第一个。`+` 解码为空格。
5. 校验 CID（§1.4）。
6. `filename` 为空时以 CID 作为文件名。

因此 `bafk…`、`most://bafk…`、`https://任意站点/任意路径/bafk…?filename=x` 都会被接受为同一个 CID。

桌面：`server/src/core/mostLink.js:41-61`、`91-137`；移动：`app/backend/mobile-core.mjs:171-237`（下载）、`app/src/mobileCore/protocol.ts:74-135`（界面）。

两端差异（边缘输入）：

| 输入                       | 桌面             | 移动 `mobile-core.mjs`            | 移动 `protocol.ts` |
| -------------------------- | ---------------- | --------------------------------- | ------------------ |
| `most://<cid>?&`           | 报错（空参数）   | 接受                              | 接受               |
| `filename` 含非法 `%` 序列 | 接受，按字节替换 | 报错（`decodeURIComponent` 抛出） | 接受，保留原文     |

这些差异只影响文件名或是否接受链接，不影响 CID。

### 2.3 聊天附件链接（严格）

聊天消息中附件的 `link` 走严格解析：必须是 `most:` 协议、路径为空或 `/`、只允许 `filename`、CID 合法，且与附件的 `cid` 字段一致。规则与字段限制在 `chat.md`（待写）描述。

移动：`app/backend/channel-protocol.mjs:326-389`。

## 3. 频道 ID 与频道 key

- 频道 ID：用户可见、可分享的频道名。规范化为「去首尾空白 + 转小写」。
- 手动创建时必须满足：只含 `[a-z0-9_-]`，长度 3–30，不得含 `.`（点号保留给系统频道）。
- 随机频道 ID：16 字节安全随机数，按 RFC 4648 base32 小写字母表 `a-z2-7` 编码、无填充，得 26 个字符。
- 频道 key：当前等于规范化后的频道 ID。所有 topic 与 Corestore namespace 都由频道 key 派生（见 `discovery.md`、`chat.md`）。
- 知道频道 ID 即可加入频道（与「CID 即权限」相同）。

桌面：`server/src/config.js:51-53`、`server/src/core/channelIdentity.js:21-37`、`server/src/index.js:3862-3878`；前端随机 ID `src/lib/chatRoom.js:32-43`。移动：`app/backend/channel-protocol.mjs:122-133`、`437-457`、`app/backend/protocol.mjs:23-27`。

分享地址（Web）：`<origin>/chat/#<encodeURIComponent(频道 ID)>`，解析时只接受路径 `/chat`。`src/lib/chatRoom.js:45-83`。

两端差异：新建频道的默认 `type`，桌面为 `personal`，移动为 `public`。`type` 在 hello 中上线（`chat.md`）。

## 4. 账号

### 4.1 用户名 + 密码派生

账号是一个 secp256k1 以太坊地址，由用户名和密码确定性派生：

```
kdf     = PBKDF2-HMAC-SHA512(password, "/most.box/" ‖ username, 50000 次, 32 字节)
seed    = SHA-256(kdf)                        // 32 字节，代码中称 danger
phrase  = BIP-39 助记词(entropy = seed)       // 24 词
wallet  = HDNodeWallet.fromPhrase(phrase)     // ethers 默认路径 m/44'/60'/0'/0/0
address = wallet.address                      // EIP-55 校验和格式
```

字符串均按 UTF-8 编码。显示名为 `<username>#<地址末 4 位大写>`。

桌面：`server/src/utils/mostWallet.js:14-52`、`server/src/utils/userIdentity.js:6-14`；移动：`app/src/remoteNode/identity.ts:16-72`。

这是客户端约定，不是协议要求：任何 secp256k1 身份都能签发设备证书（`docs/native-chat-protocol.md`）。

### 4.2 P2P 上的作者身份

聊天消息的 `author` 字段是账号地址，**不带签名**。P2P 上不传递设备证书，对端无法验证 `author` 是否属于发送者；能证明的只有「这条消息由某个 writer core 的私钥写入」。见 `chat.md`。

桌面：`server/src/index.js:4412-4440`（消息字段，无签名）。

### 4.3 设备证书（仅客户端 ↔ 节点 HTTP）

设备证书 `dc1.<base64url(payload)>.<EIP-191 签名>` 用于远程客户端向节点的 HTTP/WebSocket 请求认证，不在 P2P 上出现。格式、有效期（签发 30 天，节点接受最长 90 天）与请求签名见 [原生聊天协议](../native-chat-protocol.md)。

桌面：`server/src/utils/auth.js:7-10`、`84-106`、`131` 起；移动：`app/src/remoteNode/identity.ts:74-109`。

两端差异（本地）：桌面设备密钥随机生成；移动由 `HMAC-SHA256(seed, "most-box-device-key-v1:" ‖ label)` 派生。不影响互通。

### 4.4 账号同步密钥

```
syncKey   = HMAC-SHA256(key = seed, msg = "most-box-account-sync-key-v1")
syncTopic = HMAC-SHA256(key = syncKey, msg = "most-box-account-sync-topic-v1")
```

节点只保存 `syncKey`，不保存 `seed`。`syncTopic` 不含公开地址，外人无法由地址推出。同步条目格式（`ma://1` 信封）与线上用法在 `chat.md` 描述。

桌面：`server/src/utils/accountSync.js:10-31`；移动：`app/src/remoteNode/identity.ts:23`、`104`（只派生 `syncKey`）。

## 5. 待补

- 向量见 [vectors/](vectors/README.md)（`cid.json`、`links.json`、`channels.json`、`account.json`）。
- 是否把 CID 字符串规范为 base32（§1.4 已知问题）：属于协议变更，留给阶段 2 决定。
