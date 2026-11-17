# 协议测试向量

机器可读的协议样本。桌面与移动端测试读取同一份文件；改动协议时先改这里，再让两端测试通过。

| 文件                 | 内容                                           | 规范                                                                         |
| -------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------- |
| `cid.json`           | CID 黄金样本与文件 topic                       | [identifiers.md](../identifiers.md) §1、[discovery.md](../discovery.md) §3.1 |
| `file-transfer.json` | CID drive 名、`want` / `have` 载荷             | [file-transfer.md](../file-transfer.md) §3–4                                 |
| `links.json`         | `most://` 解析与生成（两端一致的用例）         | [identifiers.md](../identifiers.md) §2                                       |
| `channels.json`      | 三个频道 topic、频道持有证明                   | [discovery.md](../discovery.md) §3.2、[chat.md](../chat.md) §3.2             |
| `p2p-ping.json`      | P2P Ping topic 与三种帧                        | [connection.md](../connection.md) §4                                         |
| `account.json`       | 用户名 + 密码 → seed、地址、syncKey、syncTopic | [identifiers.md](../identifiers.md) §4                                       |

## 来源

- CID 由 kubo 0.43.1 独立确认（`npm run test:cid-oracle`）。
- 其余值由桌面实现生成，并已由移动端实现独立计算核对一致（2026-11-18）。它们记录的是**当前**行为，不代表设计正确；已知问题见各规范文件。

## 读取方

| 端       | 测试                                         | 覆盖                                      |
| -------- | -------------------------------------------- | ----------------------------------------- |
| 桌面     | `server/tests/unit/protocolVectors.test.js`  | 全部文件                                  |
| 移动核心 | `app/backend/protocol-vectors.test.mjs`      | CID、drive 名与 want/have、频道、P2P Ping |
| 移动 App | `app/src/mobileCore/protocolVectors.test.ts` | 文件 topic、链接、账号地址与 syncKey      |

移动端没有账号同步，因此不测 `syncTopic`。

## 未覆盖

- 两端行为不一致的链接边缘输入（identifiers §2.2 表）。
- hello 拆帧、消息条目、去重键、账号同步信封、语音事件规范化。
