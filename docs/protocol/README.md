# MostBox 协议规范

状态：**现行协议为 v2（0.8.0 起实现并冻结）**。本目录描述当前代码的线上行为。

阅读规则：本级目录的文件（原 v1 描述）给出基础结构；[v2/](v2/README.md) 中的各文件说明 0.8.0 改了什么。两者冲突时**以 v2 为准**；每个 v1 文件开头列出了被 v2 取代的章节。冻结后只按 [v2/envelope.md](v2/envelope.md) §7 新增，不修改已有含义。

目标读者：不看本仓库代码、要实现第二个兼容客户端的人。

## 文件

| 主题     | 文件                                 | 状态 |
| -------- | ------------------------------------ | ---- |
| 标识符   | [identifiers.md](identifiers.md)     | 初稿 |
| 发现     | [discovery.md](discovery.md)         | 初稿 |
| 连接     | [connection.md](connection.md)       | 初稿 |
| 文件传输 | [file-transfer.md](file-transfer.md) | 初稿 |
| 聊天     | [chat.md](chat.md)                   | 初稿 |
| 语音信令 | [voice.md](voice.md)                 | 初稿 |
| 测试向量 | [vectors/](vectors/README.md)        | 初版 |

协议 v2 见 [v2/](v2/README.md)，0.8.0 起为现行协议。

## 约定

- 每条规范陈述后用「桌面：」「移动：」标出实现位置（路径:行号，写作时的行号）。两端行为不同时单列「两端差异」，不替任何一端取舍。
- 「必须 / 不得」表示不遵守就无法与现有客户端互通或会破坏不变量；「当前」表示现状描述，不是要求。
- 桌面指 `server/src/`（Node daemon，Electron 与 Web 管理台共用）；移动指 `app/backend/`（Bare Worklet）。
- 字节示例用小写十六进制；`‖` 表示字节拼接。
