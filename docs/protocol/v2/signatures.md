# 2.3 聊天签名与账号

状态：已确认（2026-11-18；D3 选 B，D4 不采纳）。原语与标签见 [envelope.md](envelope.md) §3，频道 ID 见 [channel-keys.md](channel-keys.md) §3。

## 1. 问题（v1 现状）

- 消息、成员资料、在线状态、语音事件中的 `author` / `address` 都是自填字段，没有签名（chat §6.3、§7，voice §5）。任何能写入频道的节点都能冒充任何人。
- 设备证书（`dc1.…`）只用于客户端到节点的 HTTP 认证，P2P 上不出现（identifiers §4.3）。
- 节点会以用户名义自动写入系统事件（加入、资料变更），这些事件没有用户参与。
- 远端条目的时间戳没有上限，会拉高本机之后所有消息的时间戳（chat §6.2）。
- 两端去重与排序规则不同（chat §6.7）。
- 账号密钥由用户名 + 密码派生，PBKDF2 50000 次，可离线穷举（identifiers §4.1）。签名生效后，破解密码即可冒充他人。

## 2. 目标

- 每条用户内容（消息、成员资料、在线状态、语音事件）都由该用户的**设备密钥**签名，接收端能验证到账号地址。
- 签名在**客户端**完成。节点不持有用户私钥：设备私钥在 Web 前端（`src/stores/userStore.ts`）、移动 App、原生客户端里，节点只校验和写入。
- 规范化序列化有精确定义，桌面与移动逐字节一致。
- 两端排序、去重一致；远端时间戳不能拖动本机时间。
- 降低弱密码被离线穷举后冒充的风险，并如实写明剩余限制。

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

| 字段        | 说明                                                          |
| ----------- | ------------------------------------------------------------- |
| `kind`      | `message` 或 `profile`                                        |
| `channelId` | 频道公开 ID（64 hex），把签名绑定到该频道，不能转贴到别的频道 |
| `author`    | 账号地址，小写 `0x` + 40 hex                                  |
| `id`        | UUID v4 小写；`(author, id)` 全局唯一，用于去重               |
| `createdAt` | 客户端创建时间，毫秒整数                                      |

`message` 另有：`content`（必填，≤ 10000 字符）、`authorName`、`avatar`、`authorTag`、`attachment`、`mentions`（可选，含义与 v1 相同，chat §6）。移动端上限由 2000 统一为 10000。

`profile` 另有：`displayName`、`avatar`、`tag`（含义与 v1 资料事件相同，chat §6.6）；按 `createdAt` 取最新，`createdAt` 超过验证方本机时间 5 分钟的忽略。

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

### 4.4 验证

条目或帧被接受，当且仅当：

1. `body` 在 §3 取值范围内，且 `body.channelId` 等于本频道公开 ID；
2. `sig` 用 `device` 公钥验证通过；
3. `cert` 解析成功，其 `devicePublicKey === device`，且 EIP-191 签名恢复出的地址（小写）等于 `body.author`；
4. 不检查证书有效期（§5）。

未通过的条目不显示、不计入去重与时间戳，只计入诊断计数。证书验证结果按 `cert` 字符串缓存。

writer core 本身的 Hypercore 签名证明「这一块由该节点写入」，因此 `ts` 不能被转发者篡改；签名证明「内容由该账号的设备写出」。两者独立：一个节点可以替多个账号写入（多用户节点），也可以转贴他人已签名的消息（会被 §4.5 去重）。

### 4.5 排序与去重（两端统一）

- 去重键：`(body.author, body.id)`。同一键出现多次时保留排序最前的一条。
- 排序键：`(ts, writer core key hex, 块序号)` 升序（即 v1 桌面规则，移动端改为一致）。
- 本机分配 `ts = max(本机时间, 已见最大 ts + 1)`，其中「已见」**只统计 `ts ≤ 本机时间 + 5 分钟` 的条目**：远端未来时间戳仍按其 `ts` 显示，但不再拖动本机时间。

### 4.6 写入路径

1. 客户端构造 `body`，签名，把 `{body, device, cert, sig}` 发给节点（HTTP / WebSocket，API 形式实现时定）。
2. 节点按 §4.4 验证（另要求 `body.author` 等于该请求认证的账号），分配 `ts`，追加到本节点 writer core。
3. 节点**不得**修改 `body`。

## 5. 证书与设备（D5）

- 证书格式不变（`docs/native-chat-protocol.md`）。HTTP 认证仍检查有效期（30 天签发、最长 90 天）。
- **P2P 验证不检查有效期**（推荐）：P2P 没有可信时间，且旧消息必须在证书过期后仍可验证；若检查过期，设备每 30 天换证会让历史消息变成无效。
- 换设备：新设备有新设备密钥和新证书，之后的消息用新证书；旧消息仍用旧证书验证。无需任何迁移。
- **撤销：v2 不提供**。设备私钥泄露后，持有者可以一直以该账号签名。写入已知限制。以后可作为能力新增「账号签名的撤销条目」，但其时间判断同样受 `createdAt` 可伪造的限制。

## 6. 节点自动写入的事件（D6）

| v1 事件                                      | v2                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------ |
| `channel.member.joined`（节点写入）          | **取消**。成员列表由已验证的消息、资料、在线状态与 hello 中的 `memberAddresses` 得出 |
| `channel.member.profile.updated`（节点写入） | 改为客户端签名的 `profile` 条目（§4.2）                                              |

v2 中 writer core 只包含 `type: "signed"` 条目。

## 7. 账号派生（D3、D4）

### 7.1 风险

地址 = PBKDF2-SHA512(password, "/most.box/" ‖ username, 50000) 的确定性函数；`username` 公开（显示名 `name#XXXX`）。攻击者可离线逐个尝试密码，每次只需一次 PBKDF2 与一次地址计算，无需联网，节点无法限速。签名生效后，破解即可冒充。v1 中同一派生还给出钱包私钥。

### 7.2 选项

| 选项          | 内容                                                                                                                                                                                                                                   | 代价                                                            |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| A             | 维持 v1 派生                                                                                                                                                                                                                           | 无迁移；离线穷举成本最低                                        |
| B（**采纳**） | 聊天身份与钱包分离：`chatSeed = scrypt(password, H("identity", username), N, r=8, p=1, 32)`（盐固定 32 字节：libsodium 的接口要求如此），聊天地址由 `chatSeed` 按 v1 方式（BIP-39 → m/44'/60'/0'/0/0）得出；钱包地址仍用 v1 派生，不变 | 所有用户的**聊天地址改变**，需迁移（§7.4）；scrypt 在手机上较慢 |
| C（未采纳）   | 在 B 基础上提供「随机身份」：生成 24 词助记词作为 `chatSeed`，不依赖密码；需要用户自行备份                                                                                                                                             | 多一种登录方式；丢失助记词即丢失身份                            |

scrypt 两端都有现成实现（ethers `scrypt`，已核实桌面 `node_modules/ethers/lib.esm/crypto/scrypt.js` 与移动 `app/node_modules/ethers/lib.esm/crypto/scrypt.js` 都存在）。**`N = 2^17`**（r = 8，p = 1，输出 32 字节；2026-11-18 按下方实测确定）。各端实现：桌面与浏览器用 ethers `scrypt`；手机 App 用 Bare 后端的原生 libsodium（`app/backend/scrypt-native.mjs`），不在 Hermes 里计算。

测量方法（2026-11-18 起可用）：

- 真机：安装开发版（`npx expo run:android`），打开「节点 → 诊断详情」，点「scrypt 基准测试」。依次测 N=2^14 至 2^17，每档两次，取中位数；单次超过 15 秒或出错（例如内存不足）即停止加档。结果可选中复制。
- 桌面基线：在 `app/` 下运行 `npm run benchmark:scrypt`。2026-11-18 在 i5-12490F、Node 26 上：2^14 约 45 ms，2^15 约 81 ms，2^16 约 165 ms，2^17 约 325 ms。ethers 的 scrypt 是纯 JS，手机上的 Hermes 会慢很多，所以只能参考，不能用来定参数。
- 2026-11-18 真机实测（小米 MIX 2S，骁龙 845，6 GB，Android 10；release 构建、Hermes、ethers 纯 JS scrypt）：2^14 约 4.7 s，2^15 约 9.4 s，2^16 约 18.6 s；2^16 超过 15 秒后停止，2^17 未测。**没有任何一档能在 3 秒内完成**，比桌面慢约 100 倍。另外，计算期间 JS 线程被占满，界面完全不刷新、不响应点击。
- 结论：手机上不能在 Hermes 里用纯 JS 派生。可行方向是交给 Bare 后端里的原生 libsodium（`sodium-native` 5.1.0 提供 `crypto_pwhash_scryptsalsa208sha256`），【待核实】其输出与标准 scrypt(N, r=8, p=1) 一致，以及在该机上的耗时；或改用 Argon2id。待负责人决定。
- 2026-11-18 同一台手机改用 Bare 后端里的原生 libsodium（选项 A）：2^14 约 72 ms，2^15 约 123 ms，2^16 约 251 ms，2^17 约 524 ms，2^18 约 1078 ms（每档两次，中位数）。比 Hermes 纯 JS 快约 35 倍；计算在 Bare 线程里进行，界面不卡。
- libsodium 高层接口 `crypto_pwhash_scryptsalsa208sha256` 取 `opslimit = 32·N`、`memlimit = 2048·N` 时，结果与标准 scrypt(N, r=8, p=1) 逐字节一致（桌面 Node 上对 2^13–2^18 逐档比对，`opslimit` 少 1 即降一档），实现见 `app/backend/scrypt-native.mjs` 及其测试。
- 同一台手机的浏览器（Web 版的实际路径：ethers 纯 JS，由 `app/scripts/scrypt-benchmark-web.mjs` 打包同一测量模块，手机经 `adb reverse` 访问）：Chrome 151 为 2^14 约 168 ms、2^15 约 262 ms、2^16 约 511 ms、2^17 约 1033 ms；MIUI 浏览器 20.29（Chromium 135）为 180 / 256 / 532 / 1076 ms。V8 有 JIT，比 Hermes 快约 18 倍。计算期间页面不响应约 1 秒。
- 取值：**N = 2^17**。最慢的路径（手机浏览器）约 1.1 s、128 MiB，在 3 秒目标内并为更弱的手机留出余量；2^18 在手机 App 原生路径约 1.1 s，但浏览器预计约 2.1 s、要 256 MiB，余量不足。
- 实现：`app/src/devtools/scryptBenchmark.ts`（测量逻辑，手机与桌面共用）、`app/src/devtools/ScryptBenchmarkPanel.tsx`（仅 `__DEV__` 构建显示）。

### 7.3 密码强度（D4）

决定：**不强制**最低密码强度，维持现状——少于 18 个字符时只提示、不拦截（`app/src/remoteNode/identity.ts` `isPasswordShort`）。

剩余限制（写入文档与界面）：任何由密码派生的密钥都可被离线穷举，弱密码的账号可被冒充；scrypt（§7.2 B）只提高每次尝试的成本，不能代替强密码。

### 7.4 账号同步与迁移

- `syncKey = KDF(chatSeed, "account/sync-key")`；`syncTopic = H("topic/account-sync", syncKey)`；hello topic `H("topic/account-sync-chat", syncKey)`（取代 v1 中对带 `0x` 字符串求哈希的写法，discovery §3.3）。
- 本地数据迁移：节点上按地址保存的记录（`published-files.json` 的 owner、频道成员、账号同步）需要从旧地址迁到新地址。用户用密码登录时客户端能同时算出旧、新两个身份，向节点同时证明两者（两份设备证书），节点据此一次性迁移。
- 第三方接入（ST 邀请、原生客户端）使用的地址随之改变，实现时同步 `docs/native-chat-protocol.md`。

## 8. 测试向量

`vectors/v2/signatures.json`：

- 规范化：键排序（含非 ASCII 键）、字符串转义（控制字符、U+2028、emoji）、整数边界、非法值（小数、`-0`、孤立代理项）。
- 给定设备私钥与证书的 `message`、`profile`、`presence` 条目，含 `sig`；篡改 `body` 任一字段、换频道、证书地址不符的反例。
- 去重与排序：跨 core 同 `(author, id)`、未来 `ts` 不拖动本机时间。
- 账号：给定用户名与密码（及确定后的 `N`）的 `chatSeed`、聊天地址、`syncKey`、两个 topic。
