# 协议测试向量

机器可读的协议样本。桌面与移动端测试读取同一份文件；改动协议时先改这里，再让两端测试通过。

| 文件                 | 内容                                                                        | 规范                                                                                                     |
| -------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `cid.json`           | CID 黄金样本与文件 topic                                                    | [identifiers.md](../identifiers.md) §1、[discovery.md](../discovery.md) §3.1                             |
| `file-transfer.json` | CID drive 名、`want` / `have` 载荷                                          | [file-transfer.md](../file-transfer.md) §3–4                                                             |
| `links.json`         | `most://` 解析与生成（两端一致的用例）                                      | [identifiers.md](../identifiers.md) §2                                                                   |
| `channels.json`      | 三个频道 topic、频道持有证明、随机频道 ID                                   | [discovery.md](../discovery.md) §3.2、[chat.md](../chat.md) §3.2、[identifiers.md](../identifiers.md) §3 |
| `p2p-ping.json`      | P2P Ping topic 与三种帧                                                     | [connection.md](../connection.md) §4                                                                     |
| `node.json`          | 节点种子 → 文件 swarm 公钥（peerId）                                        | [connection.md](../connection.md) §2                                                                     |
| `account.json`       | 用户名 + 密码 → seed、地址、syncKey、syncTopic、账号同步聊天 topic          | [identifiers.md](../identifiers.md) §4、[discovery.md](../discovery.md) §3.3                             |
| `chat.json`          | 聊天帧切分、hello 拆帧、附件、clientMessageId、提及、历史去重与排序（分端） | [chat.md](../chat.md) §2、§4、§6                                                                         |
| `account-sync.json`  | 账号同步信封解密、错误密钥、合并                                            | [chat.md](../chat.md) §8                                                                                 |
| `voice.json`         | `channel-voice` 事件规范化正反例                                            | [voice.md](../voice.md) §2–3                                                                             |

协议 v2 的向量在 `v2/` 子目录，由不依赖本仓库代码的 Python 脚本独立计算（只用标准库；ed25519 为 RFC 8032 参考实现并先通过 RFC 测试向量自检）：`python scripts/protocol-vectors/v2_<名字>.py docs/protocol/vectors/v2/<名字>.json`，再运行 `npm run format`。桌面 `server/tests/unit/protocolV2.test.js` 与移动 `app/backend/protocol-v2.test.mjs` 读取。

## 来源

- CID 由 kubo 0.43.1 独立确认（`npm run test:cid-oracle`）。
- 其余值由桌面实现生成；两端都实现的部分已由移动端独立计算核对一致（2026-11-18）。它们记录的是**当前**行为，不代表设计正确；已知问题见各规范文件。
- `chat.json` 的 `history` 按端分列期望结果（`desktop` / `mobile`），因为两端的去重与排序规则不同（chat §6.7）。
- `account-sync.json` 的信封用随机 nonce 生成一次后固定；`voice.json` 中 `{repeat, count}` 表示把 `repeat` 重复 `count` 次的字符串。

## 读取方

| 端       | 测试                                         | 覆盖                                                                                                            |
| -------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 桌面     | `server/tests/unit/protocolVectors.test.js`  | 全部文件                                                                                                        |
| 移动核心 | `app/backend/protocol-vectors.test.mjs`      | CID、drive 名与 want/have、频道 topic 与证明、随机频道 ID、P2P Ping、聊天帧、hello、附件、clientMessageId、历史 |
| 移动 App | `app/src/mobileCore/protocolVectors.test.ts` | 文件 topic、链接、账号地址与 syncKey                                                                            |

移动端不测的部分及原因：提及、账号同步、语音事件规范化——移动端没有实现；节点种子——移动端文件 swarm 不使用种子。

## 未覆盖

- 两端行为不一致的链接边缘输入（identifiers §2.2 表）。
- 成员资料事件（`channel.member.profile.updated`）的生效规则。
