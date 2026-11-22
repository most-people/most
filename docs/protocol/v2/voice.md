# 语音信令

语音只在 Web 与桌面端提供，客户端以 WebRTC 传输音频；节点存取并转发已签名信令，不中转媒体。频道授权见 [聊天](chat.md) §3，签名见 [用户签名](signatures.md)。

## 1. 路径

```text
客户端 ──WebSocket── 节点 ──聊天 swarm── 对端节点 ──WebSocket── 对端客户端
客户端 ◀──────────────── WebRTC 音频 ──────────────────▶ 对端客户端
```

## 2. 范围

每个事件必须由发起者设备签名。加入等状态按频道广播一跳，signal 仅按目标会话转发；节点不解析 signal 的媒体协议字段，客户端用 transport 识别。移动核心忽略语音帧，移动 App 不发起或加入通话。

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

| 字段              | 规则                                                                      |
| ----------------- | ------------------------------------------------------------------------- |
| `event`           | 当前为 `join`、`state`、`heartbeat`、`leave`、`signal`                    |
| `sessionId`       | `^[a-zA-Z0-9_-]{3,80}$`                                                   |
| `targetSessionId` | `signal` 必填                                                             |
| `transport`       | `signal` 必填非空字符串；当前客户端使用 `webrtc1`，忽略不认识的 transport |
| `signal`          | 非数组对象，节点不解析内部字段；整帧 ≤ 64 KiB，客户端格式见 §5            |
| `createdAt`       | 与验证方本机时间相差超过 2 分钟则丢弃（防重放）                           |

验证同 signatures §4.4。节点不得改写签名覆盖的 body。非 signal 事件不得携带 signal 字段；targetSessionId 使用与 sessionId 相同的格式。

## 4. 转发

节点收到本机客户端或对端的已验证语音帧后：

1. 记录 `(channelId, sessionId) → 来源`：来源是某条聊天 swarm 连接，或本机的 WebSocket 客户端。记录随 leave、45 秒无事件或来源连接关闭清除。活动会话只能由原来源连接、同一账号和同一签名设备更新，不能被另一条连接或设备抢占。
2. `event !== "signal"`：本机客户端发起时送给本频道已授权连接和本机订阅者；来自 peer 时只送本机订阅者，不继续转给其他 peer。
3. `event === "signal"`：只发给 `targetSessionId` 的记录来源；没有记录时丢弃，不广播。

客户端先交换 join/state，让目标路由可知，再建立媒体连接。

移动核心收到 channel-voice 时不记录来源、不回应，也不影响同一连接上的其他帧。

## 5. `webrtc1` 客户端约定

| signal.type    | 对象                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------- |
| offer / answer | `{type, sdp}`，sdp 为非空字符串                                                                         |
| candidate      | `{type, candidate: {candidate, sdpMid, sdpMLineIndex, usernameFragment?}}`，即 RTCIceCandidate.toJSON() |

以上由客户端校验，节点只验完整签名、路由条件与大小，不逐字段校验 SDP/ICE。

- 会话 ID 为 `voice-<毫秒>-<随机 base36>`，当前 Web 页面创建时生成。
- 发 join 加入，micMuted 初始为 false；已加入者收到他人 join 后回 state。静音变化发送 state。
- 每 15 秒 heartbeat；45 秒无事件则视为离开并关闭媒体连接。主动离开签发 leave。
- 两个 sessionId 按 JavaScript 字符串比较，较小者创建 offer，另一方收到后回 answer。
- 每个本地 ICE 候选定向发给对端；setRemoteDescription 之前收到的候选先缓存。
- 当前 Web 使用 `stun:stun.l.google.com:19302`，没有 TURN；这是客户端配置，不是协议必需。对称 NAT 之间媒体可能失败，不能用聊天连通代替语音可用性验收。

客户端见 `src/hooks/useVoiceRoom.ts`；节点验签与路由见 `server/src/core/channelSignedVoice.js`。HTTP/WebSocket 输出可以采用 UI 投影，聊天 swarm 始终传原签名 body。

## 6. 剩余可见信息

- `join` / `state` / `heartbeat` / `leave` 仍对频道所有成员可见（谁在通话、何时）。
- signal 的客户端与经手源端、目标端节点均可见正文；目标客户端可从 ICE 候选看到发起方 IP。盲中继只转加密连接，不能与这些节点混同。

## 7. 测试向量

`../vectors/v2/voice.json`：给定设备密钥与证书的各事件签名样例；篡改、过期 `createdAt`、证书地址不符的反例；转发表用例（已知目标只发一处、未知目标丢弃）。

---

[目录](README.md) · 上一篇：[文件传输](file-transfer.md)
