import { createLoginIdentity } from '~server/src/utils/userIdentity.js'
import type { ChatJoinInvitePayload } from '~/lib/chatJoinInvite'

export function createChatJoinInviteIdentity(invite: ChatJoinInvitePayload) {
  const identity = createLoginIdentity(invite.uid, '')
  return {
    ...identity,
    theme: invite.theme,
    displayName: invite.name || identity.displayName,
    logo: invite.logo,
    logo_dark: invite.logo_dark,
    data: invite.data,
    avatar: invite.avatar,
    tag: invite.tag,
  }
}
