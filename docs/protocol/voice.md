# 语音信令

> **0.8.0 起被 v2 取代的部分**：全文 → [v2/voice.md](v2/voice.md)：`channel-voice` 帧签名、`signal` 按会话定向转发；移动核心不实现语音。

本文记录 v1 格式与 WebRTC 客户端约定。`protocol-v2` 分支使用[已签名的 v2 语音信令](v2/voice.md)：加入等状态仍在频道广播，SDP 与 ICE 只发给目标会话。

频道语音由客户端之间的 WebRTC 传输音频；MostBox 节点只转发信令，不中转媒体。本文定义 P2P 上的 `channel-voice` 帧和客户端的信令约定。聊天 swarm 帧与持有证明见 [chat.md](chat.md)。

## 1. 角色

```
浏览器客户端 ──WebSocket──▶ 本机节点 ──channel-voice（聊天 swarm）──▶ 对端节点 ──WebSocket──▶ 对端客户端
       ◀───────────────────────── WebRTC 音频（客户端之间直连，STUN） ─────────────────────────▶
```

- 节点收到本机客户端的语音事件后，规范化、广播给所有已授权该频道的聊天 swarm 连接，并推给本机订阅该频道的 WebSocket 客户端。
- 节点收到 `channel-voice` 帧后，同样规范化并推给本机客户端；**不再转发**给其他连接（只有一跳）。

桌面：`server/src/index.js:337-345`（本地发送）、`7362-7386`（广播）、`7592-7616`（接收）；`server/index.js:255-256`、`374-390`（WebSocket 事件 `channel:voice:<event>` 与推送 `channel:voice`）。

两端差异：嵌入式移动核心（`app/backend/`）不收发 `channel-voice`，按未知帧忽略。移动 App 的语音通过远程桌面节点的 WebSocket（原生聊天协议）收发事件（`app/src/chat/voiceProtocol.ts`）；`app/src` 内没有 `RTCPeerConnection`，即移动 App 不建立 WebRTC 媒体连接。

## 2. `channel-voice` 帧

```json
{
  "type": "channel-voice",
  "peerId": "<文件 swarm 公钥 hex>",
  "channel": "general",
  "channelKey": "general",
  "channelId": "general",
  "event": "signal",
  "sessionId": "voice-1795000000000-k3j9x2ab",
  "sender": {
    "address": "0x…",
    "displayName": "alice#1111",
    "avatar": "",
    "profileUpdatedAt": 1795000000000
  },
  "timestamp": 1795000000000,
  "micMuted": false,
  "targetSessionId": "voice-1795000000001-p0q8r7st",
  "signal": { "type": "offer", "sdp": "v=0…" }
}
```

| 字段              | 说明                                                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------------------------------- |
| `peerId`          | 发送节点的 peerId；等于接收方自己时忽略                                                                               |
| `channel`         | 与 `channelKey` 相同（兼容字段）                                                                                      |
| `channelKey`      | 频道 key；接收方用 `channelId \|\| channelKey` 规范化后查找本地频道                                                   |
| `event`           | `join`、`state`、`heartbeat`、`leave`、`signal` 之一                                                                  |
| `sessionId`       | 发送方客户端的语音会话 ID，匹配 `^[a-zA-Z0-9_-]{3,80}$`                                                               |
| `sender.address`  | 账号地址，必填；`displayName`（≤50 字符，缺省为地址前 10 字符）、`avatar`（≤4096 字符）、`profileUpdatedAt`（>0）可选 |
| `timestamp`       | 毫秒；接收方沿用帧中的值，缺失时取本机时间                                                                            |
| `micMuted`        | 可选布尔                                                                                                              |
| `targetSessionId` | `signal` 必填，其他事件可选；格式同 `sessionId`                                                                       |
| `signal`          | 仅 `signal` 事件，见 §3                                                                                               |

整个规范化后的事件 JSON 不得超过 65536 字节（64 KiB），`signal` 对象本身也不得超过。

接收条件：本机持有该频道、该连接已授权该频道（chat §3）、规范化不报错；否则静默丢弃。

桌面：`server/src/core/channelVoice.js:10-167`、`server/src/core/channelWire.js:27-45`。

## 3. `signal`

| `signal.type`      | 内容                                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| `offer` / `answer` | `{type, sdp}`，`sdp` 非空字符串                                                                           |
| `candidate`        | `{type, candidate: {candidate, sdpMid, sdpMLineIndex, usernameFragment?}}`，即 `RTCIceCandidate.toJSON()` |

桌面：`server/src/core/channelVoice.js:36-87`。

## 4. 客户端约定（Web 前端）

以下是当前 Web 前端的行为，节点不检查，但第二个客户端要与之互通需遵守：

- **会话 ID**：`voice-<Date.now()>-<随机 base36>`，每次打开页面生成一次。
- **加入**：发 `join`（`micMuted: false`）。收到他人 `join` 时，已加入的一方回 `state`，让新来者得知现有成员。
- **静音**：发 `state`（带 `micMuted`）。
- **心跳**：已加入时每 15 秒发 `heartbeat`；45 秒没有收到某会话任何事件即视为离开并关闭连接。
- **离开**：发 `leave`；收到 `leave` 时关闭与该会话的连接。
- **谁发 offer**：两个会话中 `sessionId` 按 JavaScript 字符串比较较小的一方创建 `RTCPeerConnection` 并发 `offer`；另一方收到 `offer` 后回 `answer`。
- **ICE**：每个本地候选以 `candidate` 信令发给对方；在 `setRemoteDescription` 之前收到的候选先缓存。STUN 服务器 `stun:stun.l.google.com:19302`，没有 TURN。
- **定向**：`signal` 广播给频道内所有已授权连接，客户端只处理 `targetSessionId` 等于自己的信令。

Web：`src/hooks/useVoiceRoom.ts:4-8`、`73-75`、`192-254`、`260-385`、`440-560`。移动 App：`app/src/chat/voiceProtocol.ts:64`（会话 ID 形如 `voice-<毫秒>-<随机 base36>`）。

## 5. 隐私与安全（现状）

- 信令（含 SDP 与 ICE 候选里的 IP 地址）发给该频道所有已授权连接，而不只是目标会话；知道频道 ID 的任何人都能看到参与者的网络地址。
- `sender.address` 没有签名，可被冒充（与聊天消息相同，chat §6.3）。
- 没有 TURN：对称 NAT 之间的 WebRTC 可能连不上。

## 6. 待补

- 向量见 [vectors/](vectors/README.md)（`voice.json`）。
