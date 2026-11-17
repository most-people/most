# MostBox 协议规范

状态：编写中（[长期方案](../decentralization-plan.md)阶段 1）。本目录如实描述**当前代码**的线上行为，不夹带改动；要改协议，先改代码，再同步这里。

目标读者：不看本仓库代码、要实现第二个兼容客户端的人。

## 文件

| 主题     | 文件                                 | 状态   |
| -------- | ------------------------------------ | ------ |
| 标识符   | [identifiers.md](identifiers.md)     | 初稿   |
| 发现     | [discovery.md](discovery.md)         | 初稿   |
| 连接     | [connection.md](connection.md)       | 初稿   |
| 文件传输 | [file-transfer.md](file-transfer.md) | 初稿   |
| 聊天     | [chat.md](chat.md)                   | 初稿   |
| 语音信令 | [voice.md](voice.md)                 | 初稿   |
| 测试向量 | `vectors/`                           | 未开始 |

## 约定

- 每条规范陈述后用「桌面：」「移动：」标出实现位置（路径:行号，写作时的行号）。两端行为不同时单列「两端差异」，不替任何一端取舍。
- 「必须 / 不得」表示不遵守就无法与现有客户端互通或会破坏不变量；「当前」表示现状描述，不是要求。
- 桌面指 `server/src/`（Node daemon，Electron 与 Web 管理台共用）；移动指 `app/backend/`（Bare Worklet）。
- 字节示例用小写十六进制；`‖` 表示字节拼接。
