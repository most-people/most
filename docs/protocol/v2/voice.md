# 2.5 语音信令

状态：已确认（2026-11-18）。现行格式见 [../voice.md](../voice.md)，签名见 [signatures.md](signatures.md)。

## 1. 问题（v1 现状）

- `channel-voice` 帧无版本、无签名：`sender.address` 可冒充；伪造的 `offer` / `answer` 可替换 DTLS 指纹，冒充他人加入通话（voice §5）。
- `signal`（含 SDP 与 ICE 候选中的 IP 地址）广播给频道所有已授权连接，而不只发给目标会话。
- 节点逐字段校验 `signal`（只认 `offer` / `answer` / `candidate`），以后换音频传输方式必须同时升级所有节点。

## 2. 目标

- 格式纳入 v2 信封，随协议冻结。
- 每个语音事件由发起者设备密钥签名。
- `signal` 只送达目标会话所在的连接。
- 节点不解析 `signal` 内容，换传输方式只需客户端升级。

范围：按 2026-11-16 决定，语音只做 Web 与桌面端；移动核心继续忽略语音帧。

## 3. 帧

```json
{
  "v": 2,
  "type": "channel-voice",
  "body": {
    "kind": "voice",
    "channelId": "<64 hex>",
    "author": "0x…",
    "id": "<uuid v4>",
    "createdAt": 1795000000000,
    "event": "signal",
    "sessionId": "voice-1795000000000-k3j9x2ab",
    "targetSessionId": "voice-1795000000001-p0q8r7st",
    "transport": "webrtc1",
    "signal": { "type": "offer", "sdp": "v=0…" },
    "micMuted": false,
    "displayName": "alice#1111",
    "avatar": ""
  },
  "device": "<64 hex>",
  "cert": "dc1.…",
  "sig": "<base64url>"
}
```

```
sig = Ed25519.sign(deviceSecretKey, label("chat/voice") ‖ canonical(body))
```

| 字段              | 规则                                                                           |
| ----------------- | ------------------------------------------------------------------------------ |
| `event`           | `join`、`state`、`heartbeat`、`leave`、`signal`；以后只增不改                  |
| `sessionId`       | `^[a-zA-Z0-9_-]{3,80}$`（不变）                                                |
| `targetSessionId` | `signal` 必填                                                                  |
| `transport`       | `signal` 必填；当前唯一值 `webrtc1`。客户端忽略不认识的 transport              |
| `signal`          | 对象，节点**不解析**，只限制整帧 ≤ 64 KiB；`webrtc1` 下的格式同 v1（voice §3） |
| `createdAt`       | 与验证方本机时间相差超过 2 分钟则丢弃（防重放）                                |

验证同 signatures §4.4。节点不再「规范化」语音事件（v1 会改写 `displayName` 等字段），签名覆盖的 `body` 原样转发。

## 4. 转发

节点收到本机客户端或对端的已验证语音帧后：

1. 记录 `(channelId, sessionId) → 来源`：来源是某条聊天 swarm 连接，或本机的 WebSocket 客户端。记录随 `leave`、45 秒无事件或连接关闭清除。
2. `event !== "signal"`：与 v1 相同，发给本频道所有已授权连接与本机订阅者（一跳，不再转发）。
3. `event === "signal"`：只发给 `targetSessionId` 的记录来源；没有记录时丢弃，不广播。

客户端流程保证目标会话在收到 `signal` 前已发过 `join` 或 `state`（voice §4），因此丢弃未知目标不影响建立连接。

## 5. 客户端约定（冻结）

voice §4 的会话 ID 形式、`join` → 对方回 `state`、15 秒心跳、45 秒超时、`sessionId` 较小者发 `offer`、ICE 候选缓存，作为 `webrtc1` 的约定写入规范并冻结。STUN/TURN 配置不属于协议（长期方案阶段 3 处理）。

## 6. 剩余可见信息

- `join` / `state` / `heartbeat` / `leave` 仍对频道所有成员可见（谁在通话、何时）。
- `signal` 只对目标会话的节点与客户端可见；目标客户端从 ICE 候选中能看到发起方的 IP（WebRTC 固有）。

## 7. 测试向量

`vectors/v2/voice.json`：给定设备密钥与证书的各事件签名样例；篡改、过期 `createdAt`、证书地址不符的反例；转发表用例（已知目标只发一处、未知目标丢弃）。
