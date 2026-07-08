# 聊天 @ 功能说明

本说明记录当前聊天 @ 功能的保留范围，以及本轮不再保留的身份标签和 scoped `channel-hello` 行为。

## 保留范围

- 输入框支持输入 `@` 后展示成员候选。
- 候选成员来自当前频道的历史消息作者和在线 presence。
- 发送消息时写入结构化 `mentions`，格式为 `{ address, label, start, end }`。
- 消息展示时保留 mention 结构，但正文里的 `@成员` 视觉上继承普通消息文字，不加内联特殊样式。
- 非当前频道收到提到当前用户的消息时，频道列表展示 `@` 未读徽标。
- 打开对应频道后清除该频道的 `@` 未读状态。

## 后端接口

HTTP `/api/channels/{name}/messages` 接收并透传 `mentions` 字段。

OpenAPI 保留：

- `ChannelMention { address, label, start, end }`
- `ChannelMessage.mentions?: ChannelMention[]`
- `SendChannelMessageInput.mentions?: ChannelMention[]`

发送端仍会校验 mention：

- `address` 必须是有效成员地址格式。
- `label` 使用聊天可见标签规则归一化。
- `start` / `end` 必须指向消息正文里的精确 `@label` 区间。
- 附件消息不携带 mentions。

## 不保留范围

身份标签不是本轮 @ 功能的一部分，当前不在聊天消息、presence、频道成员、用户 profile 或 OpenAPI 中传播：

- `ChannelMessage.authorIdentity`
- `ChannelMember.identity`
- `ChannelPresence.identity`
- `ChannelProfileInput.identity`
- profile identity timestamp 相关请求字段

聊天 UI 也不展示身份标签样式，例如 `.chat-identity-tag`。

## P2P 同步口径

频道 P2P 同步以 main 的基础行为为准：

- `#channelStreams` 使用 `Set` 记录连接。
- `channel-hello` 广播本地频道基础信息、`memberAddresses` 和 writer core keys。
- 不做 scoped `channel-hello`、stream scope 过滤或基于 channel ID 的 hello 作用域。

这样可以保证已有 peer 连接建立后，新建同名频道仍能继续交换 writer core，并同步后续消息。

## 回归重点

- 既有 peer 连接后新建同名频道，双方仍能交换 writer core。
- 发送 `@成员` 后消息携带结构化 `mentions`。
- 消息正文里的 `@成员` 不使用额外颜色、背景、圆角或 padding。
- 非当前频道收到提到自己的消息时出现 `@` 未读徽标，打开频道后清除。
