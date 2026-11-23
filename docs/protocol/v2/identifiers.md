# 标识符

本文定义 CID、`most://` 链接、频道 ID 和账号相关标识符。由它们派生的 DHT topic 见 [discovery.md](discovery.md)；文件传输见 [file-transfer.md](file-transfer.md)。

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

桌面：`server/tests/integration/cid.test.js:84-110`；移动：`app/src/mobileCore/cid.test.ts:28-63`。共享样本见 `../vectors/cid.json`，由两端测试读取。

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

移动聊天附件的 `link` 走严格解析：必须是 `most:` 协议、路径为空或 `/`、只允许 `filename`、CID 合法，且与附件的 `cid` 字段一致。规则与字段限制见 [聊天](chat.md) §6.4。桌面附件目前使用宽松解析，差异同节列明。

移动：`app/backend/channel-protocol.mjs:326-389`。

## 3. 频道标识

产品只向用户提供一个 `channelId`，作为群标识与加入值。现行代码把这个输入称为 `handle`；线上 JSON 的 `channelId` 则是 `H("channel/id", K)` 的 64 位小写十六进制字符串，不能用它替代加入值。随机、公开短名和旧输入的完整识别顺序见 [频道密钥](channel-keys.md) §3–4。

用户分享 `<origin>/chat/#<handle>`。群内不设管理员，知道加入值即可尝试加入、读到仍可取得的历史并发言；节点访问控制是另一层，见 [群聊模型](../../chat-model.md)。

## 4. 账号与设备

账号标识是 secp256k1 地址，签名正文中的 `author` 使用小写 `0x` 加 40 位十六进制。设备使用独立 Ed25519 密钥，由账号签发 `dc1` 设备证书；每条用户内容均带可验证的设备签名。格式、证书验证、用户名密码派生与账号同步密钥统一见 [签名与账号](signatures.md)。任意能签发有效证书的 secp256k1 身份均可接入，用户名密码登录不是互通前提。

## 5. 向量与限制

CID 和链接向量见 [向量索引](../vectors/README.md)。§1.4 的 CID 字符串差异、§2.2 的链接边缘差异是已知实现限制；新版本修改时须同步规范与向量，不把现有差异写成已解决。

---

[目录](README.md) · 上一篇：[版本、原语与信封](envelope.md) · 下一篇：[连接](connection.md)
