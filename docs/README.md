# 文档入口

当前目标：先开发全功能版，再适配海外和中国大陆 APP 商店版。中国大陆 Android 包名为 `most.red`；目标与现有构建配置的差异见[开发与发行路线](roadmap.md)。

| 内容                           | 文档                                                           |
| ------------------------------ | -------------------------------------------------------------- |
| 产品范围、三个发行版本和下一步 | [开发与发行路线](roadmap.md)                                   |
| 开发命令、部署和发版           | [项目 README](../README.md)、[移动端 README](../app/README.md) |
| 聊天、文件和三节点接力回归     | [验收指南](acceptance.md)                                      |
| Android 真机与后台验收         | [Android 验收](mobile-android-alpha.md)                        |
| iOS 构建、真机与恢复验收       | [iOS 验收](mobile-ios-feasibility.md)                          |
| 已有验证结论、证据位置与限制   | [验证状态](validation-status.md)                               |
| HTTP/WebSocket 聊天契约        | [原生聊天协议](native-chat-protocol.md)                        |
| 身份标签与成员资料契约         | [聊天身份标签](chat-mentions-and-identity-design.md)           |
| 第三方邀请接入                 | [ST 邀请集成](st-chat-join-integration.md)                     |
| MCP 接口                       | [MCP](mcp.md)                                                  |
| 产品风险边界                   | [P2P 风险红线](p2p-risk-boundaries.md)                         |

阶段流水账、旧 V0.5.0 封版资料和过期商店表单已删除；历史可通过 Git 查询。当前验证摘要保留真实失败和未覆盖项，避免把历史单次通过当作当前版本保证。
