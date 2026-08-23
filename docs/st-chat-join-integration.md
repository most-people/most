# ST 后端接入 MostBox 聊天邀请

更新日期：2026-08-24

ST 后端只需要生成一个链接，不需要调用 MostBox API，也不需要收件人的公钥。

## 接入步骤

1. 安装依赖：

   ```bash
   npm install tweetnacl
   ```

2. 把下面的函数放进 ST 后端：

   ```ts
   import nacl from 'tweetnacl'

   interface STInvitePayload {
     expires_at: number
     uid: string
     channels: Array<{ id: string; name?: string }>
     [key: string]: unknown
   }

   export function createMostBoxInviteLink(payload: STInvitePayload) {
     if (!payload.uid.trim()) throw new Error('uid is required')
     if (!payload.channels.length) throw new Error('channels is required')
     if (
       !Number.isSafeInteger(payload.expires_at) ||
       payload.expires_at <= Date.now()
     ) {
       throw new Error('expires_at must be a future Unix millisecond timestamp')
     }

     const key = nacl.randomBytes(32)
     const nonce = nacl.randomBytes(24)
     const plaintext = new TextEncoder().encode(JSON.stringify(payload))
     const ciphertext = nacl.secretbox(plaintext, nonce, key)
     const token = Buffer.concat([
       Buffer.from(key),
       Buffer.from(nonce),
       Buffer.from(ciphertext),
     ]).toString('base64url')

     return `https://most.box/chat/join#${token}`
   }
   ```

3. 调用函数并把返回的完整链接发给用户：

   ```ts
   const link = createMostBoxInviteLink({
     expires_at: Date.now() + 24 * 60 * 60 * 1000,
     uid: 'demo-user',
     name: 'Demo User',
     locale: 'zh-CN',
     theme: 'st',
     channels: [{ id: 'chatjoin_support', name: 'Chat Join Demo' }],
   })
   ```

   返回格式：

   ```text
   https://most.box/chat/join#<token>
   ```

## 字段

必填：

- `expires_at`：过期时间，Unix 毫秒时间戳，必须晚于当前时间。
- `uid`：ST 用户 ID。
- `channels`：至少一个频道；频道 `id` 使用 3-30 位字母、数字、下划线或连字符。

可选：`name`、`avatar`、`locale`、`node_url`、`node_invite`、`theme: 'st'`、`appearance`、`logo`、`logo_dark`、`tag`、`data`。

MostBox 会按 `uid` 创建或切换本地身份，并用邀请中提供的昵称、头像、Logo、主题和标签覆盖该身份资料。

## 联调

在 [MostBox 邀请 Demo](https://most.box/chat/join/demo/) 粘贴后端生成的链接，确认能解析 payload 并进入第一个频道。

## 注意

- 每次生成链接都必须使用新的随机 key 和 nonce。
- 只生成 `/chat/join#<token>`，不要使用旧的 `?token=...&pub=...` 格式。
- 完整链接就是加入凭证，不要把链接或 token 写入日志、统计系统或客服工单。
- 需要让泄露的邀请强制失效时，轮换 `node_invite` 和频道 ID。

非 Node.js 后端按同一格式实现：`Base64URL(key[32] + nonce[24] + secretbox(JSON))`，不保留 `=` 填充。
