const USER_AVATAR =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"%3E%3Crect width="64" height="64" rx="16" fill="%232f7dd1"/%3E%3Ccircle cx="32" cy="25" r="11" fill="%23f8fbff"/%3E%3Cpath d="M14 56c3-12 12-18 18-18s15 6 18 18" fill="%23f8fbff"/%3E%3C/svg%3E'

const SERVICE_AVATAR =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"%3E%3Crect width="64" height="64" rx="16" fill="%230f9f7a"/%3E%3Cpath d="M18 20h28v22H18z" rx="6" fill="%23f7fff9"/%3E%3Ccircle cx="27" cy="31" r="3" fill="%230f9f7a"/%3E%3Ccircle cx="37" cy="31" r="3" fill="%230f9f7a"/%3E%3Cpath d="M29 39h6" stroke="%230f9f7a" stroke-width="4" stroke-linecap="round"/%3E%3Cpath d="M32 12v8" stroke="%23f7fff9" stroke-width="5" stroke-linecap="round"/%3E%3C/svg%3E'

export const CHAT_JOIN_TEST_CHANNEL = Object.freeze({
  id: 'chatjoin_support',
  name: 'User / Service 测试频道',
})

export const CHAT_JOIN_TEST_ACCOUNTS = Object.freeze([
  Object.freeze({
    uid: 'user',
    theme: 'sparkbit',
    name: '测试用户',
    avatar: USER_AVATAR,
  }),
  Object.freeze({
    uid: 'service',
    name: '测试客服',
    avatar: SERVICE_AVATAR,
  }),
])

export const CHAT_JOIN_TEST_INVITES = Object.freeze(
  CHAT_JOIN_TEST_ACCOUNTS.map(account =>
    Object.freeze({
      locale: 'zh-CN',
      uid: account.uid,
      theme: account.theme,
      avatar: account.avatar,
      name: account.name,
      channels: [CHAT_JOIN_TEST_CHANNEL],
    })
  )
)

export function getChatJoinTestInvite(fixture) {
  const id = String(fixture || '').trim()
  return CHAT_JOIN_TEST_INVITES.find(invite => invite.uid === id) || null
}
