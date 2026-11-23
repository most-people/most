# 用户签名与账号

原语见 [版本与信封](envelope.md) §3，频道公开 ID 见 [频道密钥](channel-keys.md) §3。

## 1. 信任边界

设备私钥由客户端保管，账号私钥用于签发设备证书。消息、成员资料、在线状态与语音事件均由客户端签名，节点验证后存储或转发，不能代用户签名。多用户节点可为多个账号写入同一节点自己的 writer core。

## 2. 验证层次

Hypercore 签名证明块来自该 writer；设备签名证明正文由证书授权的账号设备签出。授权与签名不加密内容，也不防止节点拒绝服务。当前没有设备撤销机制，泄露风险见 §5。

## 3. 规范化 JSON

签名覆盖的是 `canonical(body)` 的 UTF-8 字节。`canonical` 是 RFC 8785（JCS）在以下取值范围内的子集：

| 类型       | 允许                                                 | 序列化                                          |
| ---------- | ---------------------------------------------------- | ----------------------------------------------- |
| null、布尔 | 是                                                   | `null`、`true`、`false`                         |
| 整数       | `-(2^53-1)` 到 `2^53-1`；不允许小数、`-0`、NaN、无穷 | 十进制，无前导零、无指数、无 `+`                |
| 字符串     | 合法 Unicode（不得含孤立代理项）                     | 与 ECMAScript `JSON.stringify` 相同的转义       |
| 数组       | 是                                                   | `[` 元素以 `,` 分隔 `]`，保持顺序               |
| 对象       | 键不得重复                                           | 键按 UTF-16 代码单元升序；`{"k":v,...}`，无空白 |

超出范围的值：签名方拒绝签名，验证方视为签名无效。

在上述范围内，「键排序后的 `JSON.stringify`」与 JCS 输出相同，两端可用同一段 JavaScript 实现（约 20 行），由向量保证一致。

签名覆盖 `body` 的**全部**字段，包括验证方不认识的字段：以后新增字段时，旧节点仍能验证新消息（envelope §5）。

## 4. 签名条目与帧

### 4.1 writer core 中的条目

```json
{
  "v": 2,
  "type": "signed",
  "ts": 1795000000123,
  "body": { "kind": "message", "...": "..." },
  "device": "<设备公钥，64 位十六进制>",
  "cert": "dc1.<payload>.<signature>",
  "sig": "<base64url，64 字节 ed25519 签名>"
}
```

```
sig = Ed25519.sign(deviceSecretKey, label("chat/" ‖ body.kind) ‖ canonical(body))
```

`ts` 是节点写入时分配的排序时间，**不在签名内**（由写入节点的 writer core 签名保证不被他人篡改，见 §4.4）。

### 4.2 body 种类

公共字段（全部必填）：

| 字段        | 说明                                                                 |
| ----------- | -------------------------------------------------------------------- |
| `kind`      | writer 条目为 `message` 或 `profile`；实时帧为 `presence` 或 `voice` |
| `channelId` | 频道公开 ID（64 hex），把签名绑定到该频道，不能转贴到别的频道        |
| `author`    | 账号地址，小写 `0x` + 40 hex                                         |
| `id`        | UUID v4 小写；`(author, id)` 全局唯一，用于去重                      |
| `createdAt` | 客户端创建时间，非负安全毫秒整数                                     |

`message` 另有 `content`（非空字符串，最多 10000 个 UTF-16 代码单元）与可选 `authorName`、`avatar`、`authorTag`、`attachment`、`mentions`，详见 [聊天](chat.md) §6。

`profile` 另有：`displayName`、`avatar`、`tag`（规则见 [聊天](chat.md) §6.6；缺省字段不修改，`tag: null` 清除标签）；按 `createdAt` 取最新，`createdAt` 超过验证方本机时间 5 分钟的忽略。

### 4.3 聊天 swarm 帧

`channel-presence` 与 `channel-voice`（voice §3）也必须签名，形式相同：

```json
{
  "v": 2,
  "type": "channel-presence",
  "body": {
    "kind": "presence",
    "channelId": "…",
    "author": "0x…",
    "id": "…",
    "createdAt": 1795000000000,
    "status": "online",
    "sessionId": "…",
    "displayName": "…",
    "avatar": "…"
  },
  "device": "…",
  "cert": "…",
  "sig": "…"
}
```

presence 的 `createdAt` 与验证方本机时间相差超过 2 分钟的丢弃（防止重放旧的「在线」）。

节点不替用户发 presence 或语音事件，因为它没有用户私钥（2026-11-18 确定）。客户端异常断开（关闭页面、断网、被系统清理）时，本节点只通知自己的 WebSocket 客户端；其他节点在 45 秒没有心跳后判定离线（voice §4 的超时）。主动离开时，客户端签名发送 presence 的 `status: "offline"` 或语音的 `event: "leave"`。代价：异常断开后，其他节点最多晚 45 秒才看到离线。

### 4.4 验证

共用验签必须满足以下条件；writer 条目的 ts、正文 kind 及各业务字段还须满足本篇与相应章节的限制：

1. `body` 在 §3 取值范围内，且 `body.channelId` 等于本频道公开 ID；
2. `sig` 用 `device` 公钥验证通过；
3. `cert` 解析成功，其 `devicePublicKey === device`，且 EIP-191 签名恢复出的地址（小写）等于 `body.author`；
4. 证书字段与签发时长合法；P2P 不与当前时间比较签发或到期时间（§5）。
5. `message` 的 content 必须是 trim 后非空的字符串，最多 10000 个 UTF-16 代码单元；公共字段须符合 §4.2（`readableBodyError`，两端共享同一规则）。

合法签名文本是否显示按共同的必需字段校验，两端结果必须一致；可选显示字段允许存在明确列出的实现差异。节点接受客户端写入时另要求 `body` 已是规范形式（`content` 已去首尾空白；`authorName`、`avatar`、`authorTag`、`attachment`、`mentions` 规范化后不变），不符合的拒绝写入；读取远端条目时，不符合规范形式的可选字段只是不显示，不影响条目本身。

未通过的条目不显示、不计入去重与时间戳，只计入诊断计数。证书验证结果按 `cert` 字符串缓存。

writer core 本身的 Hypercore 签名证明「这一块由该节点写入」，因此 `ts` 不能被转发者篡改；签名证明「内容由该账号的设备写出」。两者独立：一个节点可以替多个账号写入（多用户节点），也可以转贴他人已签名的消息（会被 §4.5 去重）。

### 4.5 排序与去重（两端统一）

- writer 条目必须有正安全整数 `ts`，否则不进入历史。去重键：`(body.author, body.id)`。同一键出现多次时保留排序最前的一条。
- 排序键：`(ts, writer core key hex, 块序号)` 升序（两端相同）。
- 本机分配 `ts = max(本机时间, 已见最大 ts + 1)`，其中「已见」**只统计 `ts ≤ 本机时间 + 5 分钟` 的条目**：远端未来时间戳仍按其 `ts` 显示，但不再拖动本机时间。

### 4.6 写入路径

1. 客户端构造 `body`，签名，把 `{body, device, cert, sig}` 发给节点（HTTP / WebSocket 的 `signed` 参数，见 [客户端接口](../../native-chat-protocol.md)）。
2. 节点按 §4.4 验证（另要求 `body.author` 等于该请求认证的账号），分配 `ts`，追加到本节点 writer core。
3. 节点**不得**修改 `body`。

## 5. 设备证书与撤销边界

设备公钥为 32 字节 Ed25519 key；签名为 64 字节，`sig` 用无填充 base64url，`device` 用 64 位小写十六进制。设备证书格式为：

```text
dc1.<base64url(UTF8(JSON(payload)))>.<accountSignature>
payload = {address, devicePublicKey, issuedAt, expiresAt}
```

账号使用 secp256k1 的 EIP-191 `signMessage` 签署以下五行 UTF-8 字符串，无末尾换行：

```text
most-box-device-cert-v1
<address>
<devicePublicKey>
<issuedAt>
<expiresAt>
```

签名使用 payload 中地址的原文本；恢复出的地址与 payload 地址、`body.author` 按规范化小写比较。`accountSignature` 是以 `0x` 开头的 EIP-191 签名文本，不是 Ed25519 签名。JSON 编码顺序不决定签名，签名覆盖上述字段组成的五行字符串。

`issuedAt`、`expiresAt` 必须是安全整数，`expiresAt > issuedAt`，时长不超过 90 天；设备 key 必须合法且与 `device` 相等。P2P 使用 `checkTime: false`，跳过“当前是否过期”和“是否未来签发”两项时间判断，使历史在证书过期后仍可验证；不能跳过字段、时长和账号签名验证。HTTP 认证仍检查有效期及未来签发窗口，默认签发 30 天，客户端还可选更短时长，接口详见 [客户端协议](../../native-chat-protocol.md)。

换设备使用新 key 和新证书，旧消息仍用原证书验证。**v2 没有撤销机制**：设备私钥泄露后，持有者可持续签出 P2P 消息；证书到期只限制访问实行到期检查的节点接口，不能撤销 P2P 签名资格。

## 6. 资料与系统事件

writer core 只写入 `type: "signed"` 的消息和资料条目。节点不自动写“成员加入”事件；资料变更必须来自客户端签名的 `profile`。成员信息可从已验证消息、资料和在线状态取得；hello 的 `memberAddresses` 只是未签名提示，不能替代身份证明。HTTP/UI 的 system 投影不构成额外线上条目类型。

## 7. 账号派生与同步密钥

### 7.1 适用范围

用户名密码派生是参考客户端的登录约定；任意 secp256k1 身份均可签发有效设备证书。显示名为 `<username>#<地址末四位大写>`。字符串按 UTF-8 编码，不自行增加 trim、大小写转换或 Unicode 规范化。

### 7.2 当前派生

```text
chatSeed = scrypt(label("password") ‖ UTF8(password), H("identity", UTF8(username)),
                  N=2^17, r=8, p=1, dkLen=32)
phrase   = BIP39(entropy=chatSeed)
account  = HDNodeWallet.fromPhrase(phrase)   // m/44'/60'/0'/0/0
syncKey  = KDF(chatSeed, "account/sync-key")
```

邀请身份可使用空密码，域标签确保 scrypt 密码输入非空。桌面与浏览器使用 ethers scrypt；移动 App 使用 Bare 后端原生 libsodium，`opslimit = 32*N`、`memlimit = 2048*N`，与上述标准 scrypt 参数逐字节相同，不在 Hermes JS 线程计算。

Web3 独立工具箱仍用原钱包派生：`PBKDF2-HMAC-SHA512(UTF8(password), UTF8("/most.box/" ‖ username), 50000, 32)` 后再 SHA-256，按相同 BIP39/HD 路径得到钱包。它不是聊天身份派生，也不是聊天和文件的前置条件。

手机 Hermes 纯 JS 曾出现 4.7–18.6 秒耗时与 UI 阻塞；改用 Bare 的结果及 N=2^17 的测量依据保存在 [验证状态](../../validation-status.md#2026-11-18-scrypt-参数测量记录)。本篇只定义已选择的参数。

### 7.3 密码强度

不强制最低强度；少于 18 字符时提示而不拦截。密码派生身份可被离线穷举，弱密码被破解后可冒充账号；scrypt 只增加尝试成本，不能替代强密码和恢复材料保管。

### 7.4 账号同步

```text
syncTopic      = H("topic/account-sync", syncKey)
syncHelloTopic = H("topic/account-sync-chat", syncKey)
```

两者以原始 32 字节 `syncKey` 参与计算；同步日志及信封见 [聊天](chat.md) §8。

参考实现不再提供旧账号向当前聊天身份的数据迁移接口，也不再尝试用旧钱包种子解密账号备份；使用当前聊天身份导出和恢复备份。旧身份与新身份不能混作同一签名账号；第三方接入使用当前聊天地址。

## 8. 测试向量

`../vectors/v2/signatures.json` 包含给定设备密钥与证书的消息、资料、在线状态签名，以及篡改、换频道和身份不符的反例。

同目录 `canonical-json.json` 覆盖规范化正反例，`device-cert.json` 覆盖证书，`presence.json` 覆盖在线状态，`chat-identity.json` 覆盖账号派生。排序、跨 core 去重与未来时间戳还需相应历史/签名集成测试，不能只凭签名向量认定通过；见 [向量索引](../vectors/README.md)。

---

[目录](README.md) · 上一篇：[频道密钥与授权](channel-keys.md) · 下一篇：[聊天与账号同步](chat.md)
