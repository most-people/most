# 协议测试向量

向量是固定字节与回归夹具，不能只看文件名推断协议版本。**实现当前网络请按下面的现行表读取**；旧夹具仍被测试使用，保留原字节，不与现行规则混用。规范入口见 [现行 v2](../v2/README.md)。

## 现行 v2

| 文件                                             | 内容                                      | 规范                                          |
| ------------------------------------------------ | ----------------------------------------- | --------------------------------------------- |
| [v2/envelope.json](v2/envelope.json)             | 域标签、H/MAC/KDF                         | [原语](../v2/envelope.md) §3                  |
| [v2/frames.json](v2/frames.json)                 | 帧版本与未知内容处理                      | [信封](../v2/envelope.md) §4–5                |
| [v2/session.json](v2/session.json)               | 能力声明与交集                            | [信封](../v2/envelope.md) §4.2；sig1 始终必选 |
| [v2/file.json](v2/file.json)                     | 文件 topic、want 证明、drive 名和通道载荷 | [文件访问](../v2/file-privacy.md)             |
| [v2/channel.json](v2/channel.json)               | 加入值、频道派生、证明、writer key        | [频道密钥](../v2/channel-keys.md)             |
| [v2/canonical-json.json](v2/canonical-json.json) | 规范化 JSON 的正反例                      | [用户签名](../v2/signatures.md) §3            |
| [v2/device-cert.json](v2/device-cert.json)       | 设备证书及账号绑定                        | [用户签名](../v2/signatures.md) §5            |
| [v2/signatures.json](v2/signatures.json)         | 签名正文、篡改和身份不匹配                | [用户签名](../v2/signatures.md) §4            |
| [v2/chat-identity.json](v2/chat-identity.json)   | scrypt 身份与同步密钥/topic               | [用户签名](../v2/signatures.md) §7            |
| [v2/presence.json](v2/presence.json)             | 已签名在线状态                            | [聊天](../v2/chat.md) §7                      |
| [v2/voice.json](v2/voice.json)                   | 已签名语音与定向路由                      | [语音](../v2/voice.md)                        |
| [v2/p2p-ping.json](v2/p2p-ping.json)             | 现行 Ping topic 和 version: 3 帧          | [连接](../v2/connection.md) §4                |

v2 派生和签名向量由不依赖生产核心的 Python 脚本生成：`python scripts/protocol-vectors/v2_<名字>.py docs/protocol/vectors/v2/<名字>.json`，使用标准库，Ed25519 使用通过 RFC 8032 自检的参考算法；并非每个夹具都有同名生成脚本，实际以 `scripts/protocol-vectors/` 为准。修改后统一运行格式化及相应两端回归。独立生成向量不等于第三方节点互通验收。

## 基础工具与历史夹具

| 文件                                     | 仍可使用的范围                         | 不能据此实现的部分                         |
| ---------------------------------------- | -------------------------------------- | ------------------------------------------ |
| [cid.json](cid.json)                     | UnixFS CID 黄金样本                    | topic 是旧摘要 topic，当前用 v2/file.json  |
| [links.json](links.json)                 | most:// 解析与生成的共同用例           | 未覆盖两端所有边缘输入差异                 |
| [node.json](node.json)                   | 节点种子到文件 swarm 公钥              | 移动文件 swarm 每次启动随机，不使用该种子  |
| [account-sync.json](account-sync.json)   | ma://1 信封与合并                      | 同步密钥/topic 必须用当前派生              |
| [channels.json](channels.json)           | 旧频道工具回归                         | 三 topic、旧证明不是现行协议               |
| [file-transfer.json](file-transfer.json) | 旧 drive 命名和载荷回归                | 不使用旧 want 或旧 drive 名建立新连接      |
| [p2p-ping.json](p2p-ping.json)           | 旧 Ping 回归                           | 当前 Ping 使用 v2/p2p-ping.json            |
| [account.json](account.json)             | 旧身份/独立钱包派生回归                | 不是当前聊天身份或同步密钥                 |
| [chat.json](chat.json)                   | 切帧、hello 分帧、附件、提及等工具回归 | 未签名条目和分端旧排序期望不是当前历史规则 |
| [voice.json](voice.json)                 | 旧语音规范化工具回归                   | 不是当前已签名帧或定向路由规则             |

历史向量不能作为接受未签名内容、降级协议或恢复旧 topic 的理由。chat.json 的 history 按 desktop/mobile 分列的是旧工具期望；当前历史按签名正文 author/id 去重与统一排序。

## 来源与读取方

CID 曾由 kubo 0.43.1 独立确认（`npm run test:cid-oracle`）。早期根目录夹具来自桌面实现，双端共同部分由移动实现核对；它们只记录行为，不证明设计正确。account-sync.json 的随机 nonce 固定一次后保存；voice.json 的 `{repeat, count}` 表示重复字符串。

| 读取方   | 测试入口                                                                                         |
| -------- | ------------------------------------------------------------------------------------------------ |
| 桌面     | `server/tests/unit/protocolV2.test.js`、`protocolVectors.test.js` 及相关签名、授权、文件交换测试 |
| 移动核心 | `app/backend/protocol-v2.test.mjs`、`protocol-vectors.test.mjs` 及相关签名测试                   |
| 移动 App | `app/src/mobileCore/protocolVectors.test.ts`                                                     |

移动端没有实现的提及、账号日志同步、语音不冒充已覆盖。向量没有覆盖的真实网络、丢块、重启、证书撤销与第三方互通问题，按 [验收指南](../../acceptance.md)和 [验证状态](../../validation-status.md)核对。
