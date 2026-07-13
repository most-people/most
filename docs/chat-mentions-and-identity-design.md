# 聊天身份标签 tag 设计

状态：已实现  
更新时间：2026-07-09  
适用范围：聊天频道用户身份标签、多语言 join 参数、消息展示

## 背景

聊天用户除了昵称和头像，还需要一个可展示的身份标签，例如“有人@我”截图里的身份说明，或第三方接入时传入的“客服”“管理员”“Operator”等标签。

这个标签不能走 presence。presence 只描述当前连接的在线状态和短期会话资料，不适合承载需要持久保存、可随语言切换重新展示的身份标签。

本设计把身份标签作为和昵称同类的用户资料字段：新增 `tag` 字段，由第三方 join 时传入，保存到本地用户身份，加入频道时写入成员资料，发送消息时写入消息作者快照，渲染时按当前语言选择对应文案。

## 成功标准

- 第三方 join 可以传入单语言或多语言 `tag`。
- 本地 `UserIdentity` 能保存 `tag`，刷新或重启后仍可用于后续发消息和加入频道。
- 创建或加入频道时，`tag` 和昵称、头像一样进入频道成员资料。
- 用户更新 `tag` 后，频道成员能看到新的当前标签，历史消息展示也能按当前标签覆盖显示。
- 发送消息时，消息可携带作者标签快照，作为当前成员资料不可用时的兜底。
- 切换前端语言后，同一个 `tag` 多语言对象能重新选择合适展示值。
- presence 类型、presence WebSocket 事件和 presence profile 更新都不新增 `tag`。

## 非目标

- 不把 `tag` 做成权限、认证、角色系统或管理后台身份。
- 不用 `tag` 参与 @ 匹配、未读排序、消息归属判断或在线状态判断。
- 不设计历史消息体迁移。旧消息没有 `authorTag` 时不回填消息体，但如果当前成员资料已有 `tag`，旧消息展示仍可用当前 `tag` 覆盖。
- 不引入服务端翻译。第三方传什么语言版本，客户端就从已有版本中选择。

## 当前实现事实

现有昵称链路大致是：

```text
join invite name
  -> UserIdentity.displayName
  -> getUserChannelProfile(identity).displayName
  -> channel members[].displayName
  -> getUserMessageIdentity(identity).authorName
  -> ChannelMessage.authorName
  -> UI 展示
```

现有 presence 链路是：

```text
UserIdentity displayName/avatar/profileUpdatedAt
  -> channel:presence:join/profile
  -> ChannelPresence
  -> 在线成员状态展示
```

新的 `tag` 应复用昵称所属的“身份资料和消息快照”链路，不进入 presence 链路。

## 核心决策

1. 字段名使用 `tag`。

   在用户身份、join invite、频道成员资料中使用 `tag`。在消息里为了避免和消息正文、附件字段混淆，使用 `authorTag` 表示“发送当时的作者标签快照”。

2. `tag` 是可本地选择语言的结构，不只是字符串。

   内部统一保存为多语言对象。入口可以兼容字符串，字符串会规范化成 `default`。

3. `tag` 和昵称同类，但比昵称多语言。

   昵称仍是当前选中的展示名字符串。`tag` 保存多语言候选值，渲染时按当前 locale 选择。

4. presence 不持有 `tag`。

   不新增 `ChannelPresence.tag`、不在 `channel:presence:join` 或 `channel:presence:profile` 里传 `tag`、不通过在线状态广播标签变化。

5. 当前成员 `tag` 是展示优先级最高的身份标签。

   用户更新 `tag` 后，应覆盖该用户在频道内的当前身份展示。旧消息的底层内容不回写，但旧消息渲染时优先读当前成员 `tag`，因此视觉上会随当前身份标签更新。

6. 消息 `authorTag` 是兜底快照。

   `authorTag` 只在当前成员资料不可用时兜底，例如离线缓存、只加载到历史消息但还没加载到成员资料、旧客户端未同步成员资料事件。UI 切语言时，对当前成员 `tag` 或 `authorTag` 都使用同一个多语言选择函数。

7. 成员资料事件命名必须统一。

   频道消息日志中的事件名固定为 `channel.member.profile.updated`。WebSocket 推送类型固定为 `channel:member-profile`，payload 中的 `event` 字段固定为 `channel.member.profile.updated`。加入频道时也复用同一个成员资料事件，不再单独定义 `channel.member.joined` 的资料 payload。

   如果产品仍需要“某人加入频道”的可见系统提示，可以继续保留 `channel.member.joined`。它只负责 UI 提示，不承载 `tag` 同步，不参与成员资料持久化覆盖判断。

## 数据模型

### 通用类型

```ts
type LocalizedTag = {
  default?: string
  [locale: string]: string | undefined
}

type MemberTag = LocalizedTag | null
```

约定：

- key 可以是 `default` 或 BCP 47 风格 locale，例如 `zh-CN`、`zh-TW`、`en`、`en-US`。
- value 是用户可见短标签，按聊天可见名称规则清洗。
- 没有有效 value 时视为无标签。
- `null` 只用于当前成员资料，统一表示显式清空标签。看到 `tag: null` 时 UI 不显示标签，也不 fallback 到消息 `authorTag`。

### Join Invite

第三方 join payload 新增 `tag`：

```ts
interface ChatJoinInvitePayload {
  uid: string
  name?: string
  avatar?: string
  locale?: Locale
  tag?: string | Record<string, string>
}
```

示例：

```json
{
  "uid": "service-10086",
  "name": "小叶子",
  "locale": "zh-CN",
  "tag": {
    "zh-CN": "客服",
    "zh-TW": "客服",
    "en": "Support"
  }
}
```

单语言简写：

```json
{
  "uid": "operator-01",
  "name": "Mia",
  "tag": "Operator"
}
```

单语言简写会规范化为：

```json
{
  "tag": {
    "default": "Operator"
  }
}
```

接入建议：

- 第三方能提供多语言时，应一次传完整 `tag` map，例如 `zh-CN`、`zh-TW`、`en` 和 `default`。
- 聊天中切换语言时，前端直接从已保存的 `tag` map 选择展示值，不需要重新 join、不需要重新请求第三方。
- 第三方只能提供单语言时，可以传字符串或只传 `default`。这种情况仍可展示，但切换语言后会继续显示同一个兜底标签。
- 不建议第三方只按当前 invite locale 传一个已翻译字符串，因为用户进入聊天后可能切换语言，群成员也可能使用不同语言。

### UserIdentity

本地用户身份新增 `tag`：

```ts
interface UserIdentity {
  username: string
  address: string
  displayName?: string
  avatar?: string
  tag?: LocalizedTag | null
}
```

`normalizeIdentity()` 需要保留并规范化 `tag`。这样第三方 join 后，用户后续进入频道或发送消息都能继续使用同一个标签。用户清空本地标签时，`UserIdentity.tag` 也必须保存为 `null`，避免当前用户展示时从本地旧标签兜底。

### Channel Profile

频道创建、加入和成员资料更新使用的 profile 新增 `tag`：

```ts
interface ChannelProfileInput {
  displayName?: string
  avatar?: string
  tag?: LocalizedTag | null
}
```

为了避免把 `tag` 误传给 presence，前端建议拆出两个 helper：

```ts
function getUserChannelProfile(identity: UserIdentity) {
  return {
    displayName: getUserDisplayName(identity),
    avatar: identity.avatar || '',
    tag: identity.tag,
  }
}

function getUserPresenceProfile(identity: UserIdentity) {
  return {
    displayName: getUserDisplayName(identity),
    avatar: identity.avatar || '',
  }
}
```

调用方如果仍需要 presence profile 的 `profileUpdatedAt`，应在组装 presence payload 时单独附加，避免 `tag` 随 helper 误入 presence。

### Channel Member

频道元数据里的成员资料新增 `tag`：

```ts
interface ChannelMember {
  address: string
  displayName?: string
  avatar?: string
  tag?: LocalizedTag | null
  profileUpdatedAt?: number
  joinedAt: string
}
```

服务端 `#upsertChannelMember()` 负责保存 `tag`。这和现有 `displayName`、`avatar` 的持久化位置一致。

成员资料里的 `tag` 必须保存完整 `LocalizedTag` 对象，不能保存某个 locale 下已经选好的展示字符串。成员列表、@ 候选项、消息历史覆盖展示都在渲染时按当前语言调用 `selectLocalizedTag(member.tag, currentLocale)`。

如果成员资料保存 `tag: null`，表示该成员已显式清空标签。前端必须展示为无标签，并禁止回退到历史消息里的 `authorTag`。

成员资料事件必须持久化到本地频道元数据。engine 收到合法的成员资料事件后，需要调用成员资料 upsert 逻辑并保存到本地 `members[]`，不能只更新前端内存状态或 presence 状态。

`address` 是成员资料更新的约束键。任何成员资料更新都只能修改同一个 `address` 对应的成员资料，不能替其他地址写入或覆盖标签。

`profileUpdatedAt` 是成员资料覆盖判断的持久化时间。新写入或更新的成员资料必须保存该字段；历史成员缺失该字段时按 `0` 处理。

### Channel Message

消息请求和消息响应新增作者标签快照：

```ts
interface SendChannelMessageInput {
  author: string
  authorName?: string
  avatar?: string
  authorTag?: LocalizedTag
}

interface ChannelMessage {
  id: string
  author: string
  authorName?: string
  avatar?: string
  authorTag?: LocalizedTag
  content: string
  timestamp: string
}
```

服务端发送消息时：

- 如果请求带 `authorTag`，规范化后写入消息。
- 如果请求没有 `authorTag`，但频道成员资料里有 `tag`，服务端可以在发送当下用成员 `tag` 生成本条消息的 `authorTag` 快照并持久化。
- 读取历史消息时，消息响应只返回消息自身的 `authorTag` 快照，不返回当前成员 `tag` 派生出的展示信息。
- 当前成员 `tag` 通过 `GET /api/channels/:name/member-profiles` 获取，统一由前端 `selectLocalizedTag()` 渲染。
- 持久化到 Hypercore 的消息应保存发送时的 `authorTag` 快照，当前标签覆盖通过成员资料完成。

### Member Profile Event

成员资料事件是频道消息日志里的系统消息，必须包含可校验字段：

```ts
interface ChannelMemberProfileEvent {
  type: 'system'
  event: 'channel.member.profile.updated'
  content: 'channel.member.profile.updated'
  author: string
  authorName?: string
  avatar?: string
  timestamp: number
  member: {
    address: string
    displayName?: string
    avatar?: string
    tag?: LocalizedTag | null
    profileUpdatedAt: number
  }
}
```

校验规则：

- `author` 必须是合法 address。
- `member.address` 必须是合法 address。
- `normalizeAddress(author)` 必须等于 `normalizeAddress(member.address)`。
- `content` 必须等于 `channel.member.profile.updated`，用于兼容现有频道系统消息的必填正文。
- `member.profileUpdatedAt` 必须通过时间验证。
- `member.tag` 缺失表示不更新标签；`member.tag: null` 表示清空标签；`member.tag` 为对象时必须通过多语言标签规范化。

## 规范化规则

新增一个通用工具，例如 `normalizeLocalizedTag(input)`：

```ts
type LocalizedTagInput = string | Record<string, unknown> | undefined

function normalizeLocalizedTag(
  input: LocalizedTagInput
): LocalizedTag | undefined
```

规则：

- `undefined`、空字符串、空对象返回 `undefined`。
- 字符串使用现有聊天可见名称规则清洗，成功后保存为 `{ default: value }`。
- 对象只保留 key 为 `default` 或合法 locale 的条目。
- 每个 value 使用现有聊天可见名称规则清洗。
- 清洗后为空的 value 丢弃。
- locale key 做 trim，但不改变大小写含义。展示选择时再做大小写兼容。
- 为避免滥用，最多保留 16 个语言条目。
- 单个标签建议复用 `normalizeVisibleChatLabel()` 的 50 code points 限制。

成员资料更新接口需要单独使用 patch 规范化，明确区分字段缺失、`null` 和有效标签：

```ts
type MemberTagPatch =
  | { action: 'unchanged' }
  | { action: 'clear'; tag: null }
  | { action: 'set'; tag: LocalizedTag }
```

- `tag` 字段缺失表示不更新当前成员标签。
- `tag: null` 统一表示显式清空当前成员标签，并持久化 `null`。
- `tag` 为字符串或对象时按上面的规则规范化后保存。
- `tag` 为字符串或对象但规范化后没有有效 value 时，应返回参数错误；不能把它隐式当成清空。清空必须显式传 `tag: null`。

合法 locale 建议：

```text
default
^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$
```

## 展示选择规则

新增一个纯函数，例如 `selectLocalizedTag(tag, locale)`：

```ts
function selectLocalizedTag(
  tag: LocalizedTag | undefined | null,
  locale: Locale
): string
```

候选顺序：

1. 当前 locale 精确匹配，例如 `zh-CN`。
2. 当前 locale 的语言部分，例如 `zh`。
3. 当前 locale 的常用别名，例如 `zh-CN` 可尝试 `zh-Hans`，`zh-TW` 可尝试 `zh-Hant`。
4. `default`。
5. 英文兜底 `en`。
6. 第一个有效值，按 key 字母序稳定选择。

注意：

- UI 不保存选择后的字符串，只在渲染时选择。
- `tag: null` 直接选择为空字符串，并阻断 `authorTag` 兜底。
- 切换语言后，消息列表、成员列表、@ 候选项应重新 render 并选择新语言值。
- 语言切换的丝滑程度取决于 `tag` 是否包含目标语言。第三方传完整多语言 map 时可以无网络、无闪烁地切换；只有 `default` 时只能稳定兜底。
- 如果选择结果为空字符串，UI 不展示标签占位。

## 数据流

```text
third party join payload tag
  -> normalizeChatJoinInvitePayload()
  -> UserIdentity.tag
  -> getUserChannelProfile(identity).tag
  -> create/join channel members[].tag
  -> channel.member.profile.updated event
  -> other peers update memberProfileByAddress[address].tag
  -> UI selectLocalizedTag(currentMember.tag, currentLocale)
```

进入或切换频道时的当前资料加载：

```text
open channel
  -> GET /api/channels/:name/member-profiles
  -> memberProfileByAddress[address].tag
  -> UI selectLocalizedTag(currentMember.tag, currentLocale)
```

消息快照兜底链路：

```text
UserIdentity.tag
  -> getUserMessageIdentity(identity).authorTag
  -> send message request authorTag
  -> ChannelMessage.authorTag
  -> UI fallback selectLocalizedTag(authorTag, currentLocale)
```

presence 仍然保持：

```text
UserIdentity displayName/avatar/profileUpdatedAt
  -> getUserPresenceProfile(identity)
  -> channel:presence:join/profile
  -> ChannelPresence
```

这条链路不包含 `tag`。

## API 与事件契约

### HTTP

需要更新：

- `POST /api/channels`
  - 请求体新增 `tag`。
  - 写入频道成员资料。
- `POST /api/channels/:name/messages`
  - 请求体新增 `authorTag`。
  - 写入消息作者标签兜底快照。
- `GET /api/channels/:name/messages`
  - 响应消息新增 `authorTag`。
- `GET /api/channels/:name/member-profiles`
  - 返回当前频道成员资料，包含 `address`、`displayName`、`avatar`、`tag`、`profileUpdatedAt`。
  - `tag` 返回完整 `LocalizedTag` 对象，由前端按当前语言选择展示值。
  - 前端进入频道时先加载一次，用于保证切群或刷新后也能立刻看到成员当前标签。
- 成员资料更新入口
  - 需要新增非 presence 的成员资料更新能力，例如 `POST /api/channels/:name/member-profile`。
  - 请求体包含 `author`、`displayName`、`avatar`、`tag`。
  - HTTP 请求体不传 `member.address`。服务端使用 `author` 生成事件里的 `member.address`。
  - `author` 必须等于当前登录用户地址；生成事件后，`member.address` 必须等于 `author`。
  - `profileUpdatedAt` 不接受客户端指定，由本机 engine 在处理更新时生成。
  - 服务端更新 `members[].tag`，并向频道消息日志追加成员资料事件，让其他群成员同步当前标签。
  - 本机也必须立即持久化更新后的 `members[]`，保证刷新、切群、重启后当前标签不丢失。

不需要更新：

- presence 相关 WebSocket 请求体。
- `ChannelPresence` OpenAPI schema。

### WebSocket

消息事件天然跟随 `ChannelMessage`：

```json
{
  "type": "channel:message",
  "message": {
    "authorName": "小叶子",
    "authorTag": {
      "zh-CN": "客服",
      "en": "Support"
    }
  }
}
```

成员资料更新事件用于同步当前标签：

```json
{
  "type": "channel:member-profile",
  "event": "channel.member.profile.updated",
  "content": "channel.member.profile.updated",
  "author": "0xabc",
  "timestamp": 1783526400001,
  "member": {
    "address": "0xabc",
    "displayName": "小叶子",
    "tag": {
      "zh-CN": "客服",
      "en": "Support"
    },
    "profileUpdatedAt": 1783526400000
  }
}
```

presence 事件保持无 `tag`：

```json
{
  "type": "channel:presence",
  "presence": {
    "displayName": "小叶子",
    "avatar": "..."
  }
}
```

## 前端展示位置

第一阶段建议只在已有身份展示旁追加标签，不改变列表结构：

- 消息气泡作者名旁。
- @ 候选项用户名称旁。
- 频道成员或在线成员展示处，如果当前数据源有 `authorTag` 或本地成员 `tag`。

消息气泡展示优先级：

1. 当前频道成员资料 `tag`。如果值为 `null`，直接无标签，不 fallback。
2. 本地当前用户 `UserIdentity.tag`，仅限消息作者是当前用户。
3. 消息自身 `authorTag`。
4. 无标签。

成员和 @ 候选项展示优先级：

1. 频道成员资料 `tag`。如果值为 `null`，直接无标签，不 fallback。
2. 本地当前用户 `UserIdentity.tag`，仅限该成员是当前用户。
3. 从消息列表推导出的该用户最近一次 `authorTag`。
4. 无标签。

不从 presence 读取标签。

## 成员资料事件

当前成员资料事件只有一个日志事件名：

```text
channel.member.profile.updated
```

WebSocket 转发时只有一个推送类型：

```text
channel:member-profile
```

`channel:member-profile` payload 必须携带 `event: "channel.member.profile.updated"`，用于和频道消息日志事件对齐。

当前频道加入时也复用同一个成员资料事件。为了让别人即使还没收到该用户普通消息，也能看到标签，join 后应追加一条 `channel.member.profile.updated`：

```json
{
  "type": "system",
  "event": "channel.member.profile.updated",
  "content": "channel.member.profile.updated",
  "author": "0xabc",
  "authorName": "小叶子",
  "timestamp": 1783526400001,
  "member": {
    "address": "0xabc",
    "displayName": "小叶子",
    "tag": {
      "zh-CN": "客服",
      "en": "Support"
    },
    "profileUpdatedAt": 1783526400000
  }
}
```

如果还需要展示“某人加入频道”的系统提示，可以另外追加或保留 `channel.member.joined` 消息。该消息只用于人可见提示，不作为成员资料同步来源。

用户后续更新标签时，再追加一条成员资料更新事件：

```json
{
  "type": "system",
  "event": "channel.member.profile.updated",
  "content": "channel.member.profile.updated",
  "author": "0xabc",
  "timestamp": 1783526500001,
  "member": {
    "address": "0xabc",
    "tag": {
      "zh-CN": "管理员",
      "en": "Admin"
    },
    "profileUpdatedAt": 1783526500000
  }
}
```

其他群成员收到事件后更新本地 `memberProfileByAddress[address].tag`。消息列表重新渲染时，历史消息会优先使用这个当前成员标签展示。

其他群成员的 engine 收到成员资料事件后，也必须把该成员资料持久化到本地频道元数据：

```text
channel.member.profile.updated
  -> validate message.type is system
  -> validate message.event is channel.member.profile.updated
  -> validate message.content is channel.member.profile.updated
  -> validate message.author address matches member.address
  -> validate member.profileUpdatedAt
  -> #upsertChannelMember(channel, member)
  -> #saveChannelsMetadata()
  -> GET /api/channels/:name/member-profiles
```

前端的 `memberProfileByAddress` 只是渲染缓存，不能作为唯一存储来源。

历史回放和重启恢复也必须执行同一套成员资料事件处理逻辑：

```text
start/open channel
  -> load local channels metadata
  -> open each channel writer core
  -> replay channel history entries
  -> find channel.member.profile.updated
  -> validate author/address/time
  -> apply newer member profile to members[]
  -> #saveChannelsMetadata()
```

要求：

- 实时收到成员资料事件时要落盘。
- 离线期间错过事件，之后通过 Hypercore 历史同步拿到事件时也要落盘。
- 应用重启后回放本地已有历史事件时也要落盘或重建本地 `members[]`。
- `GET /api/channels/:name/member-profiles` 必须从本地持久化后的最新 `members[]` 读取。
- 如果本地 `members[]` 和历史事件不一致，且历史事件通过校验并更新，应该以更新的历史事件结果为准。

同一成员多次更新时，用经过验证的 `profileUpdatedAt` 做 last-write-wins。只有远端 `profileUpdatedAt` 严格大于本地已知成员资料时间时才覆盖；小于或等于本地时间都不覆盖。

如果成员资料事件的作者地址和 `member.address` 不一致，engine 必须忽略该事件，不持久化、不更新前端缓存。

`profileUpdatedAt` 的时间验证规则：

- 本机 HTTP 更新不接受客户端传入 `profileUpdatedAt`，统一由本机 engine 生成当前时间。
- 远端成员资料事件必须携带数字类型 `profileUpdatedAt`。
- 本地已知成员资料缺少 `profileUpdatedAt` 时按 `0` 比较。
- 远端 `profileUpdatedAt` 不能明显晚于本机当前时间。建议允许小窗口时钟漂移，例如最多晚于本机 5 分钟。
- 远端 `profileUpdatedAt` 非数字、为负数、过大或明显未来时间时，engine 必须忽略该事件，不持久化、不更新前端缓存。
- 只有地址校验通过、时间校验通过，且 `profileUpdatedAt` 严格大于本地已知成员资料时间时，才允许覆盖本地 `members[].tag`。
- `profileUpdatedAt` 等于本地已知成员资料时间时不覆盖，不再做额外 tie-breaker。

## 兼容性

- 旧客户端不会发送 `tag` 或 `authorTag`，新客户端按无标签处理。
- 新客户端向旧服务端发送 `tag` 时，旧服务端可能忽略字段。前端不能依赖旧服务端返回标签。
- 旧消息没有 `authorTag`，不补历史数据。
- 用户切换语言只影响本地显示选择，不改变消息存储内容。

## 安全与信任边界

- `tag` 是用户可见展示资料，不是可信认证身份。
- 第三方 join 传入的 `tag` 可被本地用户或其他客户端伪造。
- UI 不应用 `tag` 表达系统认证、管理员权限或安全状态。
- 如果将来需要可信身份标签，应另行设计签名声明或服务端认证字段，不复用当前 `tag`。

## 建议实施顺序

1. 新增 `normalizeLocalizedTag()`、`selectLocalizedTag()` 及单元测试。
2. 扩展 join invite 解析，保存 `UserIdentity.tag`。
3. 拆分前端 profile helper，确保 channel profile 带 `tag`，presence profile 不带 `tag`。
4. 服务端 `#upsertChannelMember()` 保存 `tag`，频道元数据备份和恢复保留 `tag`。
5. 新增非 presence 的成员资料更新入口和频道成员资料事件，群成员收到后更新当前 `tag`。
6. engine 消费成员资料事件并持久化到本地 `members[]`，`GET /member-profiles` 从本地持久化成员资料读取。
7. 启动、打开频道和历史同步时回放 `channel.member.profile.updated`，重建并持久化最新 `members[]`。
8. 统一成员资料事件命名：日志事件 `channel.member.profile.updated`，WebSocket 类型 `channel:member-profile`。
9. 消息发送请求、消息持久化、消息响应增加 `authorTag` 兜底快照。
10. 频道加入后追加 `channel.member.profile.updated`，携带当前成员 `tag`。
11. 前端消息、@ 候选项、成员展示使用 `selectLocalizedTag()`，并优先读取当前成员 `tag`。
12. 更新 OpenAPI schema 和测试 fixture。

## 验收用例

- join payload 传：

  ```json
  {
    "name": "小叶子",
    "tag": {
      "zh-CN": "客服",
      "en": "Support"
    }
  }
  ```

  进入聊天后中文界面显示“客服”，英文界面显示“Support”。

- join payload 传 `"tag": "Operator"`，任意语言都可展示 “Operator”。
- 切换语言后，不重新 join、不重新发消息，已有消息上的标签展示随语言变化。
- 发送消息的存储内容包含 `authorTag`，presence 事件中没有 `tag`。
- 用户后来把标签从“客服”改成“管理员”，群成员收到成员资料更新事件后，旧消息展示也改成“管理员”。
- 用户把标签清空时，成员资料保存 `tag: null`；群成员收到更新后，成员列表、@ 候选项和旧消息展示都不显示标签，也不回退到旧 `authorTag`。
- 切换频道或刷新页面后，前端通过当前成员资料接口恢复 `tag`，群成员仍能看到最新标签。
- 收到远端成员资料事件后，本地 engine 持久化 `members[].tag`；应用重启后仍可通过 `GET /api/channels/:name/member-profiles` 读到该成员最新标签。
- 应用离线期间错过成员资料事件，重新连上后通过历史同步拿到事件，本地 engine 回放并持久化，刷新和重启后仍读到最新标签。
- A 用户尝试发送 `member.address` 为 B 的资料更新事件时，接收方因事件作者地址不匹配而忽略，不更新 B 的标签。
- 远端成员资料事件携带明显未来的 `profileUpdatedAt` 时，接收方忽略该事件，后续正常时间的更新不会被锁死。
- 远端成员资料事件的 `profileUpdatedAt` 等于本地已知时间时，接收方不覆盖本地标签。
- 群成员资料里的 `tag` 支持多语言对象，切换界面语言后，成员列表、@ 候选项和消息历史覆盖展示都同步切换标签语言。
- 如果只加载到历史消息但还没加载到当前成员资料，UI 使用消息自己的 `authorTag` 兜底展示。
- `ChannelPresence` 类型、OpenAPI schema 和 WebSocket presence payload 都没有 `tag`。
- 非法 locale key、空字符串、过长标签被规范化或丢弃。

## 已确认决策

1. 消息字段是否接受 `authorTag` 这个命名？

   已确认使用 `authorTag`，因为消息里这是作者快照；其他位置继续使用 `tag`。

2. locale key 是否允许所有 BCP 47 风格 key？

   已确认允许 BCP 47 风格 key，并支持 `default`，这样第三方多语言接入不需要随前端 locale 列表频繁改协议。

3. 标签是否在频道列表预览中展示？

   第一阶段不展示，先限制在消息作者、@ 候选项和成员资料里，减少频道列表信息噪声。
